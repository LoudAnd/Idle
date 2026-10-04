/**
 * Storage (GDD §19, §20.1): the A/B save slots, `meta` with the owning tab, the hourly backup,
 * the quarantine, the reserved chart-samples key and the separate settings key. M4's storage
 * absorbs M3's `settingsStore.ts` (`createSettingsStore`, unchanged).
 *
 * | Key                   | Holds                                                             |
 * | --------------------- | ----------------------------------------------------------------- |
 * | `isi.save.a`, `.b`    | `ISI1u:` frames (`src/engine/save/codec.ts`)                      |
 * | `isi.save.meta`       | `{"active":"a"\|"b"\|null,"seq":n,"owner":"<tab id>"\|null}`      |
 * | `isi.save.bak`        | A copy of a verified slot blob, at most one per hour of `savedAt` |
 * | `isi.save.quarantine` | The raw string of the first blob that failed a load, as read      |
 * | `isi.stats.samples`   | Reserved for the chart samples (M12a); hard reset removes it      |
 * | `isi.settings`        | Settings v1, separate so a bad save never takes them with it      |
 *
 * `active: null` is the meta a tab writes when it claims ownership before any slot exists (a
 * first run, or after a hard reset): no slot is named, so a missing slot is no fallback.
 *
 * - **Write** (`write`): only the owner writes (re-read just before the slot write and again
 *   before the meta flip); write the inactive slot, read it back and check its CRC by decoding
 *   it, then flip `meta`. A `QuotaExceededError` leaves the previous slot active (the session
 *   shows the storage-full banner and the next autosave retries); any other failure switches to
 *   memory storage. The backup takes the blob when it is an hour newer than the last one.
 * - **Load** (`load`): the meta's active slot, then the other, then the backup, then a new game.
 *   With no usable meta, the slot with the higher `savedAt` goes first (a on a tie). The first
 *   blob that fails (frame, CRC, JSON, migration or `validate()`) is copied to the quarantine
 *   byte for byte, and the load goes on; `fellBack` is set whenever the load went past the
 *   active slot. A save from a newer version stops the load (`newer`): falling back past it
 *   would show older progress.
 * - Every storage call is wrapped in try/catch; a store whose `getItem` throws (a private
 *   window, some Artifact iframes) is replaced by memory storage (`openStorage`).
 */
import { decodeSave } from '../engine/save/envelope.ts';
import type { DecodeResult, EnvelopeMeta, SaveData } from '../engine/save/envelope.ts';

export const KEYS = Object.freeze({
  a: 'isi.save.a',
  b: 'isi.save.b',
  meta: 'isi.save.meta',
  bak: 'isi.save.bak',
  quarantine: 'isi.save.quarantine',
  samples: 'isi.stats.samples',
  settings: 'isi.settings',
} as const satisfies Record<string, string>);

/** Exactly what a hard reset removes (§19): everything but the settings. */
export const RESET_KEYS: readonly string[] = Object.freeze([
  KEYS.a,
  KEYS.b,
  KEYS.meta,
  KEYS.bak,
  KEYS.quarantine,
  KEYS.samples,
]);

export const SETTINGS_KEY = KEYS.settings;

/** The backup is refreshed when a save is at least this much newer (`savedAt`). */
export const BACKUP_INTERVAL_MS = 3_600_000;

/** The part of `Storage` the game uses. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** A store that lives in memory only (this page's lifetime). */
export function memoryStorage(): KeyValueStore {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
  };
}

export type StorageMode = 'storage' | 'memory';

/**
 * `win.localStorage` when it can be read, else memory storage: a throwing `localStorage`
 * getter or a `getItem` that throws gives `memory` (the game runs and shows the banner, §20.1).
 */
export function openStorage(win: { readonly localStorage: Storage } | null | undefined): {
  kv: KeyValueStore;
  mode: StorageMode;
} {
  try {
    const ls = win?.localStorage;
    if (ls === undefined || ls === null) return { kv: memoryStorage(), mode: 'memory' };
    ls.getItem(KEYS.meta);
    return { kv: ls, mode: 'storage' };
  } catch {
    return { kv: memoryStorage(), mode: 'memory' };
  }
}

/** True for a storage-full error (by name, or the legacy code 22 / Firefox's 1014). */
export function isQuotaError(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const { name, code } = e as { name?: unknown; code?: unknown };
  return (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    code === 22 ||
    code === 1014
  );
}

// ---------------------------------------------------------------------------------------------
// The save store
// ---------------------------------------------------------------------------------------------

export type SlotId = 'a' | 'b';

export interface SaveMeta {
  /** The slot holding the current save, or `null` before any slot was written. */
  readonly active: SlotId | null;
  readonly seq: number;
  /** The tab allowed to save, or `null`. */
  readonly owner: string | null;
}

/** Where a load came from: the active slot, the other slot or the backup. */
export type LoadSource = 'active' | 'other' | 'backup';

export type LoadResult =
  | {
      readonly kind: 'ok';
      readonly save: SaveData;
      readonly meta: EnvelopeMeta;
      readonly source: LoadSource;
      /** The blob loaded, byte for byte. */
      readonly blob: string;
      /** The load went past the active slot (§20.1: a banner says so). */
      readonly fellBack: boolean;
      /** The blob put into quarantine by this load, or `null`. */
      readonly quarantined: string | null;
    }
  | {
      readonly kind: 'newer';
      /** The refused blob, verbatim (the banner exports it). */
      readonly blob: string;
      readonly saveVersion: number;
      readonly source: LoadSource;
      readonly fellBack: boolean;
      readonly quarantined: string | null;
    }
  | {
      readonly kind: 'empty';
      /** Something existed and failed (otherwise this is a first run). */
      readonly fellBack: boolean;
      readonly quarantined: string | null;
    };

export type WriteResult =
  | { readonly ok: true; readonly slot: SlotId; readonly backup: boolean }
  | {
      readonly ok: false;
      readonly reason: 'notOwner' | 'quota' | 'verify' | 'storage';
    };

export interface StoreStatus {
  readonly mode: StorageMode;
  /** The last write hit the quota (§20.1: storage banner, retried at the next autosave). */
  readonly quota: boolean;
}

export interface SaveStore {
  load(): LoadResult;
  /** Writes a verified blob (`ISI1u:`) whose envelope says `savedAt` (§20.1 write sequence). */
  write(blob: string, savedAt: number): WriteResult;
  /** The last good save, byte for byte: the active slot if it decodes, else the last loaded. */
  lastGood(): string | null;
  /** The backup and its envelope's `savedAt`, or `null` when there is none that decodes. */
  backup(): { readonly blob: string; readonly savedAt: number } | null;
  /** The quarantined blob, or `null`. */
  quarantined(): string | null;
  readMeta(): SaveMeta | null;
  /** Writes `meta.owner = id`, keeping the slot fields (before loading, §20.1). */
  claimOwner(id: string): boolean;
  /** `meta.owner` is `id`, or no tab owns the save. */
  isOwner(id: string): boolean;
  /** Removes exactly `RESET_KEYS` (settings are kept). */
  hardReset(): void;
  readonly status: StoreStatus;
}

export interface SaveStoreOptions {
  /** This tab's id (`tablock.ts`). */
  readonly ownerId: string;
  /** The storage mode `openStorage` found (memory: the storage banner shows). */
  readonly mode?: StorageMode;
}

const SLOT_KEY: Readonly<Record<SlotId, string>> = Object.freeze({ a: KEYS.a, b: KEYS.b });

const other = (s: SlotId): SlotId => (s === 'a' ? 'b' : 'a');

function parseMeta(text: string | null): SaveMeta | null {
  if (text === null) return null;
  try {
    const v: unknown = JSON.parse(text);
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
    const { active, seq, owner } = v as Record<string, unknown>;
    if (active !== 'a' && active !== 'b' && active !== null) return null;
    if (typeof seq !== 'number' || !Number.isSafeInteger(seq) || seq < 0) return null;
    if (owner !== null && typeof owner !== 'string') return null;
    return { active, seq, owner };
  } catch {
    return null;
  }
}

/** A deflate frame cannot be read synchronously, so in a slot it counts as invalid. */
function decodeSlot(blob: string): DecodeResult {
  const r = decodeSave(blob);
  return r.kind === 'needsInflate'
    ? { kind: 'invalid', stage: 'frame', problems: ['frame: compressed frame in a slot'] }
    : r;
}

export function createSaveStore(initial: KeyValueStore, opts: SaveStoreOptions): SaveStore {
  let kv = initial;
  let mode: StorageMode = opts.mode ?? 'storage';
  let quota = false;
  /** The last blob this store loaded or wrote (for Export last good). */
  let last: string | null = null;

  const get = (key: string): string | null => {
    try {
      return kv.getItem(key);
    } catch {
      return null;
    }
  };
  const remove = (key: string): void => {
    try {
      kv.removeItem(key);
    } catch {
      // nothing to remove in a broken store
    }
  };
  /** Storage failed in a way that is not the quota: keep going in memory (§20.1 fallback). */
  const toMemory = (): void => {
    if (mode === 'memory') return;
    const keep = memoryStorage();
    for (const key of [...RESET_KEYS, KEYS.settings]) {
      const v = get(key);
      if (v !== null) keep.setItem(key, v);
    }
    kv = keep;
    mode = 'memory';
  };
  type SetResult = 'ok' | 'quota' | 'storage';
  const set = (key: string, value: string): SetResult => {
    try {
      kv.setItem(key, value);
      return 'ok';
    } catch (e) {
      return isQuotaError(e) ? 'quota' : 'storage';
    }
  };

  const readMeta = (): SaveMeta | null => parseMeta(get(KEYS.meta));
  const ownedByOther = (m: SaveMeta | null): boolean =>
    m !== null && m.owner !== null && m.owner !== opts.ownerId;

  const savedAtOf = (blob: string | null): number => {
    if (blob === null) return -1;
    const r = decodeSlot(blob);
    return r.kind === 'ok' ? r.meta.savedAt : -1;
  };

  const backup = (): { blob: string; savedAt: number } | null => {
    const blob = get(KEYS.bak);
    if (blob === null) return null;
    const at = savedAtOf(blob);
    return at < 0 ? null : { blob, savedAt: at };
  };

  const writeOnce = (blob: string, savedAt: number): WriteResult => {
    const meta = readMeta();
    if (ownedByOther(meta)) return { ok: false, reason: 'notOwner' };
    const target: SlotId = meta?.active === 'a' ? 'b' : 'a';
    const put = set(SLOT_KEY[target], blob);
    if (put !== 'ok') {
      if (put === 'quota') quota = true;
      return { ok: false, reason: put };
    }
    const readback = get(SLOT_KEY[target]);
    if (readback !== blob || decodeSlot(readback).kind !== 'ok') {
      return { ok: false, reason: 'verify' };
    }
    // Re-read just before the flip: another tab may have claimed the save meanwhile.
    const again = readMeta();
    if (ownedByOther(again)) return { ok: false, reason: 'notOwner' };
    const seq = (again ?? meta)?.seq ?? 0;
    const next = JSON.stringify({ active: target, seq: seq + 1, owner: opts.ownerId });
    const flip = set(KEYS.meta, next);
    if (flip !== 'ok') {
      if (flip === 'quota') quota = true;
      return { ok: false, reason: flip };
    }
    quota = false;
    last = blob;
    let wroteBackup = false;
    const bak = backup();
    if (bak === null || savedAt - bak.savedAt >= BACKUP_INTERVAL_MS) {
      const r = set(KEYS.bak, blob);
      // A backup that does not fit only raises the quota flag; the save itself is done.
      if (r === 'quota') quota = true;
      wroteBackup = r === 'ok';
    }
    return { ok: true, slot: target, backup: wroteBackup };
  };

  return {
    get status() {
      return { mode, quota };
    },
    load() {
      let quarantined: string | null = null;
      let fellBack = false;
      const meta = readMeta();
      let order: SlotId[];
      if (meta !== null && meta.active !== null) {
        order = [meta.active, other(meta.active)];
      } else {
        const a = savedAtOf(get(KEYS.a));
        const b = savedAtOf(get(KEYS.b));
        order = b > a ? ['b', 'a'] : ['a', 'b'];
      }
      const sources: readonly { key: string; source: LoadSource; named: boolean }[] = [
        { key: SLOT_KEY[order[0]!], source: 'active', named: meta?.active != null },
        { key: SLOT_KEY[order[1]!], source: 'other', named: false },
        { key: KEYS.bak, source: 'backup', named: false },
      ];
      for (const src of sources) {
        const blob = get(src.key);
        if (blob === null) {
          if (src.named) fellBack = true;
          continue;
        }
        const r = decodeSlot(blob);
        if (r.kind === 'ok') {
          last = blob;
          return {
            kind: 'ok',
            save: r.save,
            meta: r.meta,
            source: src.source,
            blob,
            fellBack,
            quarantined,
          };
        }
        if (r.kind === 'newer') {
          return {
            kind: 'newer',
            blob,
            saveVersion: r.saveVersion,
            source: src.source,
            fellBack,
            quarantined,
          };
        }
        if (quarantined === null) {
          quarantined = blob;
          set(KEYS.quarantine, blob);
        }
        fellBack = true;
      }
      return { kind: 'empty', fellBack, quarantined };
    },
    write(blob, savedAt) {
      const r = writeOnce(blob, savedAt);
      if (r.ok || r.reason !== 'storage') return r;
      // Storage broke (not the quota): carry on in memory and write there.
      toMemory();
      return writeOnce(blob, savedAt);
    },
    lastGood() {
      const meta = readMeta();
      if (meta?.active != null) {
        const blob = get(SLOT_KEY[meta.active]);
        if (blob !== null && decodeSlot(blob).kind === 'ok') return blob;
      }
      return last;
    },
    backup,
    quarantined: () => get(KEYS.quarantine),
    readMeta,
    claimOwner(id) {
      const meta = readMeta();
      const next = { active: meta?.active ?? null, seq: meta?.seq ?? 0, owner: id };
      const r = set(KEYS.meta, JSON.stringify(next));
      if (r === 'storage') {
        toMemory();
        return set(KEYS.meta, JSON.stringify(next)) === 'ok';
      }
      return r === 'ok';
    },
    isOwner(id) {
      const meta = readMeta();
      return meta === null || meta.owner === null || meta.owner === id;
    },
    hardReset() {
      for (const key of RESET_KEYS) remove(key);
      last = null;
      quota = false;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Settings (M3's settingsStore.ts, unchanged)
// ---------------------------------------------------------------------------------------------

export interface SettingsStore {
  /** The stored blob parsed from JSON, or `null` if there is none or it does not parse. */
  load(): unknown;
  /** Stores the blob. Returns false when it could only be kept in memory. */
  save(blob: unknown): boolean;
}

/**
 * The settings store (GDD §19): the JSON blob `{ settingsVersion, values }` under
 * `isi.settings`, which `src/ui/settings/settings.ts` builds and validates (the platform never
 * imports UI code). Every call is wrapped and the blob is also kept in memory, so the session
 * remembers the settings when storage throws, and nothing throws.
 */
export function createSettingsStore(storage: KeyValueStore | null): SettingsStore {
  let memory: string | null = null;
  // What this session saved last: newer than storage whenever a write failed.
  const read = (): string | null => {
    if (memory !== null || storage === null) return memory;
    try {
      return storage.getItem(SETTINGS_KEY);
    } catch {
      return null;
    }
  };
  return {
    load() {
      const text = read();
      if (text === null) return null;
      try {
        return JSON.parse(text) as unknown;
      } catch {
        return null;
      }
    },
    save(blob) {
      let text: string;
      try {
        text = JSON.stringify(blob);
      } catch {
        return false;
      }
      memory = text;
      if (storage === null) return false;
      try {
        storage.setItem(SETTINGS_KEY, text);
        return true;
      } catch {
        return false;
      }
    },
  };
}
