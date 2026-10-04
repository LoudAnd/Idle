/**
 * The game session (GDD §19, §20, §21.4, §21.8): the save lifecycle around the game loop. It
 * sits between storage, the tab lock, autosave, the offline runner, the loop and the UI's
 * onboarding memory, and owns every decision about when the game may be saved.
 *
 * **States.** `owner` (playing and saving), `catchingUp` (an offline run behind the progress
 * modal), `yielded` (another tab owns the save: "Open in another tab"), `faulted` (§21.8: never
 * saves again) and `readOnly` (the stored save is from a newer version: refused, a new game is
 * played in memory, nothing is ever written, and the player is asked to export it).
 *
 * **Start.** `createSession` claims ownership and announces the tab, then loads synchronously
 * (`loaded`: the save, the offline credit and the banners), before the loop exists; the loop is
 * created from `loaded`. `start()` catches up the credit (max(0, now − maxSeenAt), capped, §20.2)
 * behind the progress modal, shows "While away" when at least 60 s were credited, saves, then
 * starts the loop and autosave. A gap of more than 60 s during the session (`onGap`) takes the
 * same path, capped the same way.
 *
 * **Saving** (`save`): never while not the owner, catching up, faulted or read-only. The
 * invariant (`checkSave`, §20.1) runs first: a failure is a fault (the loop pauses, autosave
 * stops, the recovery panel opens) and storage is not touched. The blob is decoded again and
 * compared with the state before it is written (a blob that would not load is never written);
 * then the store's write sequence runs (owner checks, inactive slot, read-back, meta flip). A
 * write refused because another tab owns the save makes this tab yield. Times never decrease:
 * `savedAt` = max(previous, now), `maxSeenAt` = max(previous, now, every wall time seen).
 *
 * **Replacing the game** (import, Restore backup, hard reset, Use here) resets the onboarding
 * memory, replaces the loop's state and saves at once. Imports and restores get no offline
 * credit and adopt the higher of the stored and the imported times, so a re-import is exact and
 * cannot be used to earn time. "Use here" reloads the latest save from storage with the normal
 * credit, since the other tab may have saved newer progress.
 *
 * The platform never imports UI code: the onboarding memory reaches the session through a
 * `MemoryPort` that `main.tsx` builds from the shell's deriver.
 */
import type { OnboardingIds } from '../engine/content/onboarding.ts';
import { checkSave } from '../engine/invariants.ts';
import type { Num } from '../engine/num.ts';
import { previewSum } from '../engine/integrate.ts';
import { creditedSeconds, offlineCap, startAdvance } from '../engine/offline.ts';
import { decodeSave, decodeSaveJson, encodeSave, nextSaveTimes } from '../engine/save/envelope.ts';
import type { DecodeResult, EnvelopeMeta, SaveData, SaveTimes } from '../engine/save/envelope.ts';
import { newGame, serializeState } from '../engine/state.ts';
import type { GameState, Tuple8 } from '../engine/state.ts';
import { createAutosave } from './autosave.ts';
import type { Autosave, AutosaveWindow } from './autosave.ts';
import type { Clock, WallClock } from './clock.ts';
import type { ErrorHub } from './errors.ts';
import type { GameLoop } from './loop.ts';
import { runOffline } from './offlineRunner.ts';
import type { OfflineRun } from './offlineRunner.ts';
import { createSaveStore } from './storage.ts';
import type { KeyValueStore, LoadSource, SaveStore, StorageMode } from './storage.ts';
import { createTabLock, newTabId } from './tablock.ts';
import type { ChannelLike, StorageEventSource, TabLock } from './tablock.ts';
import { exportText as exportFrame, importText as importFrame } from './transfer.ts';
import { GAME_VERSION } from './version.ts';
import { onShow } from './visibility.ts';
import type { VisibilityWindow } from './visibility.ts';

/** "While away" shows from this much credited time (shorter catch-ups are silent). */
export const AWAY_MIN_S = 60;

/** The onboarding memory, as the session sees it (`main.tsx` binds it to the deriver). */
export interface MemoryPort {
  ids(): OnboardingIds;
  reset(ids: OnboardingIds): void;
}

const NEW_MEMORY: OnboardingIds = Object.freeze({
  revealed: Object.freeze([]),
  done: Object.freeze([]),
  visited: Object.freeze(['sum']),
});

/** The values the "While away" summary compares (§20.2). */
export interface AwayValues {
  readonly x: Num;
  readonly amounts: Tuple8<Num>;
  readonly bought: Tuple8<number>;
}

export interface AwaySummary {
  /** Credited seconds. */
  readonly seconds: number;
  readonly before: AwayValues;
  readonly after: AwayValues;
}

/** Where a fallen-back load came from (the banner's "Loaded from {source}"). */
export type FallbackSource = 'other' | 'backup' | 'new';

export interface SessionView {
  /** `memory`: storage unavailable; `quota`: storage full (banners, §20.1). */
  readonly storage: 'ok' | 'memory' | 'quota';
  /** The load went past the active slot (§20.1), or `null`. */
  readonly fellBack: { readonly source: FallbackSource } | null;
  /** The refused newer save (read-only session), or `null`. */
  readonly newer: { readonly blob: string; readonly saveVersion: number } | null;
  /** Another tab owns the save ("Open in another tab"). */
  readonly yielded: boolean;
  /** A catch-up in progress, or `null`. */
  readonly catchUp: { readonly done: number; readonly total: number } | null;
  /** The "While away" summary to show, or `null`. */
  readonly away: AwaySummary | null;
  /** The backup's `savedAt`, or `null` when there is none. */
  readonly backupAt: number | null;
  /** A quarantined blob exists. */
  readonly quarantine: boolean;
  /** The `savedAt` of this session's last save, or `null`. */
  readonly lastSavedAt: number | null;
  /** The game can be played: owner, not catching up, not faulted. */
  readonly active: boolean;
  /** Nothing is ever written (a newer save, §20.1). */
  readonly readOnly: boolean;
}

export interface LoadedSession {
  readonly save: SaveData;
  /** Offline credit in seconds (0 for fixtures and read-only sessions). */
  readonly credit: number;
}

export type SaveOutcome = { readonly ok: true } | { readonly ok: false; readonly reason: string };

export interface Session {
  /** The tab's id. */
  readonly id: string;
  /** What was loaded, computed before the loop exists. */
  readonly loaded: LoadedSession;
  /** Connects the loop and the onboarding memory (once, before `start`). */
  attach(loop: GameLoop<unknown>, memory: MemoryPort): void;
  /** Catches up the load's credit, saves, starts the loop and autosave. */
  start(): Promise<void>;
  /** The loop's `onGap`: a frame gap of `ms` (§21.4). */
  onGap(ms: number): void;
  view(): SessionView;
  subscribe(fn: () => void): () => void;
  /** Save now (the Save panel); also what autosave calls. */
  saveNow(): SaveOutcome;
  /** The current game as export text (`ISI1:` where compression exists). */
  exportText(): Promise<string>;
  /** The in-memory state as `ISI1u:`, synchronous and unverified (the recovery panel). */
  exportCurrent(): string;
  /** The last good save, byte for byte. */
  lastGood(): string | null;
  /** Decodes an import; nothing changes until `adopt`. */
  importText(text: string): Promise<DecodeResult>;
  /** Replaces the game with a decoded save (after the player confirmed), and saves. */
  adopt(save: SaveData, meta: SaveTimes): boolean;
  /** The decoded backup, or `null`. */
  backup(): { readonly save: SaveData; readonly meta: EnvelopeMeta } | null;
  /** The quarantined blob, or `null`. */
  quarantineBlob(): string | null;
  /** Removes exactly the reset keys, starts a new game and saves it. */
  hardReset(): boolean;
  /** "Use here": takes ownership back and reloads the latest save. */
  useHere(): Promise<void>;
  dismissAway(): void;
  dispose(): void;
}

export type SessionWindow = AutosaveWindow & VisibilityWindow & StorageEventSource;

export interface SessionOptions {
  readonly kv: KeyValueStore;
  readonly storageMode?: StorageMode;
  readonly wall: WallClock;
  /** The frame clock for the offline runner's time slices (never a dev-hook scaled one). */
  readonly clock: Clock;
  readonly hub: ErrorHub;
  readonly win: SessionWindow | null;
  readonly channel: ChannelLike | null;
  readonly tabId?: string;
  readonly gameVersion?: string;
  readonly autosaveMs?: number;
  /** A dev fixture's envelope JSON (§21.9): loaded instead of storage, with no credit. */
  readonly fixture?: string | null;
  /** Stay out of the tab lock (dev fixture sessions; no channel and no storage events). */
  readonly isolated?: boolean;
}

function awayValues(s: GameState): AwayValues {
  const sum = previewSum(s);
  return { x: sum.x, amounts: sum.amounts, bought: sum.bought };
}

const maxTimes = (a: SaveTimes | null, b: SaveTimes): SaveTimes => ({
  savedAt: Math.max(a?.savedAt ?? 0, b.savedAt),
  maxSeenAt: Math.max(a?.maxSeenAt ?? 0, b.maxSeenAt),
});

export function createSession(o: SessionOptions): Session {
  const id = o.tabId ?? newTabId();
  const gameVersion = o.gameVersion ?? GAME_VERSION;
  const store: SaveStore = createSaveStore(o.kv, { ownerId: id, mode: o.storageMode });
  const listeners = new Set<() => void>();
  let cached: SessionView | null = null;
  const notify = (): void => {
    cached = null;
    for (const l of [...listeners]) {
      try {
        l();
      } catch {
        // a broken listener must not stop the others
      }
    }
  };

  let loop: GameLoop<unknown> | null = null;
  let memory: MemoryPort | null = null;
  let prev: SaveTimes | null = null;
  let seen = 0;
  let lastSavedAt: number | null = null;
  let readOnly = false;
  let newer: SessionView['newer'] = null;
  let fellBack: SessionView['fellBack'] = null;
  let yielded = false;
  let faulted = o.hub.fault !== null;
  let catchingUp = false;
  let progress: SessionView['catchUp'] = null;
  let away: AwaySummary | null = null;
  let runner: OfflineRun | null = null;
  let started = false;
  let disposed = false;

  const wallNow = (): number => {
    const t = o.wall.now();
    if (Number.isFinite(t)) seen = Math.max(seen, t);
    return t;
  };

  // ------------------------------------------------------------------------------------------
  // Lock and load (synchronous, before the loop exists)
  // ------------------------------------------------------------------------------------------

  const autosave: Autosave | null =
    o.win === null
      ? null
      : createAutosave({ save: () => void save('auto'), win: o.win, intervalMs: o.autosaveMs });

  const onLost = (): void => {
    yielded = true;
    runner?.cancel();
    loop?.stop();
    loop?.clearQueue();
    autosave?.stop();
    notify();
  };

  const lock: TabLock = createTabLock({
    id,
    startedAt: o.wall.now(),
    channel: o.isolated ? null : o.channel,
    store,
    win: o.isolated ? null : o.win,
    onLost,
  });

  const loadFromStorage = (): { save: SaveData; credit: number } => {
    const r = store.load();
    const now = wallNow();
    if (r.kind === 'ok') {
      prev = maxTimes(prev, r.meta);
      seen = Math.max(seen, r.meta.maxSeenAt);
      if (r.fellBack) fellBack = { source: r.source === 'backup' ? 'backup' : 'other' };
      const credit = creditedSeconds(now, r.meta.maxSeenAt, offlineCap(r.save.game));
      return { save: r.save, credit };
    }
    if (r.kind === 'newer') {
      readOnly = true;
      newer = { blob: r.blob, saveVersion: r.saveVersion };
      autosave?.stop();
    } else if (r.fellBack) {
      fellBack = { source: 'new' };
    }
    return { save: { game: newGame(), onboarding: NEW_MEMORY }, credit: 0 };
  };

  const loadInitial = (): LoadedSession => {
    if (o.fixture !== undefined && o.fixture !== null) {
      const r = decodeSaveJson(o.fixture);
      wallNow();
      if (r.kind === 'ok') {
        prev = maxTimes(null, r.meta);
        seen = Math.max(seen, r.meta.maxSeenAt);
        return { save: r.save, credit: 0 };
      }
      console.error('dev fixture refused:', r);
      return { save: { game: newGame(), onboarding: NEW_MEMORY }, credit: 0 };
    }
    // Claim before loading (§20.1): an older tab's next write is refused from now on.
    store.claimOwner(id);
    lock.announce();
    return loadFromStorage();
  };

  const loaded = loadInitial();

  // ------------------------------------------------------------------------------------------
  // Saving
  // ------------------------------------------------------------------------------------------

  const canWrite = (): string | null => {
    if (disposed) return 'disposed';
    if (faulted || o.hub.fault !== null) return 'faulted';
    if (readOnly) return 'readOnly';
    if (yielded || !lock.owner) return 'notOwner';
    if (catchingUp) return 'catchingUp';
    if (loop === null || memory === null) return 'detached';
    return null;
  };

  const currentSave = (): SaveData => ({
    game: (loop as GameLoop<unknown>).state(),
    onboarding: (memory as MemoryPort).ids(),
  });

  const metaFor = (times: SaveTimes): EnvelopeMeta => ({ gameVersion, dataHash: '', ...times });

  function save(_kind: 'auto' | 'manual'): SaveOutcome {
    const blocked = canWrite();
    if (blocked !== null) return { ok: false, reason: blocked };
    const data = currentSave();
    const problems = checkSave(data);
    if (problems.length > 0) {
      // §20.1: refused, autosave stops, the last good save is untouched, the panel opens.
      autosave?.stop();
      o.hub.report({ kind: 'invariant', problems });
      return { ok: false, reason: 'invariant' };
    }
    const times = nextSaveTimes(prev, wallNow(), seen);
    const { blob } = encodeSave(data, metaFor(times));
    const back = decodeSave(blob);
    if (back.kind !== 'ok' || serializeState(back.save.game) !== serializeState(data.game)) {
      autosave?.stop();
      o.hub.report({ kind: 'invariant', problems: ['save: the encoded blob does not decode'] });
      return { ok: false, reason: 'selfcheck' };
    }
    const r = store.write(blob, times.savedAt);
    if (r.ok) {
      prev = times;
      lastSavedAt = times.savedAt;
      notify();
      return { ok: true };
    }
    if (r.reason === 'notOwner') lock.yield();
    notify();
    return { ok: false, reason: r.reason };
  }

  // ------------------------------------------------------------------------------------------
  // Catch-up
  // ------------------------------------------------------------------------------------------

  /** Runs `seconds` of offline time from `before`; the state after, or `null` (fault, cancel). */
  const catchUp = async (before: GameState, seconds: number): Promise<GameState | null> => {
    const job = startAdvance(before, seconds);
    if (job.done) return before;
    catchingUp = true;
    progress = { done: 0, total: job.total };
    notify();
    const run = runOffline(job, {
      clock: o.clock,
      hub: o.hub,
      onProgress: (done, total) => {
        progress = { done, total };
        notify();
      },
    });
    runner = run;
    const after = await run.done;
    if (runner === run) runner = null;
    catchingUp = false;
    progress = null;
    if (after !== null && seconds >= AWAY_MIN_S) {
      away = { seconds, before: awayValues(before), after: awayValues(after) };
    }
    notify();
    return after;
  };

  /** Catch up `seconds` from the loop's state, put the result in place, save and play on. */
  const resume = async (seconds: number): Promise<void> => {
    const l = loop;
    if (l === null) return;
    if (seconds > 0) {
      const after = await catchUp(l.state(), seconds);
      if (after === null || disposed || yielded || faulted) return;
      l.replace(after);
    }
    if (disposed || yielded || faulted) return;
    save('auto');
    l.start();
    if (!readOnly) autosave?.start();
    notify();
  };

  // ------------------------------------------------------------------------------------------
  // Replacing the game
  // ------------------------------------------------------------------------------------------

  const replaceGame = (data: SaveData): boolean => {
    const l = loop;
    const m = memory;
    if (l === null || m === null || faulted) return false;
    if (checkSave(data).length > 0) return false;
    m.reset(data.onboarding);
    if (!l.replace(data.game)) return false;
    away = null;
    return true;
  };

  const unsubscribeFault = o.hub.subscribe(() => {
    faulted = true;
    runner?.cancel();
    autosave?.stop();
    notify();
  });
  const unsubscribeShow =
    o.win === null || o.isolated
      ? () => {}
      : onShow(o.win, () => {
          // A message may have been lost while hidden or in the back/forward cache (§20.1).
          if (!yielded) lock.recheck();
        });

  return {
    id,
    loaded,
    attach(l, m) {
      loop = l;
      memory = m;
    },
    async start() {
      if (started || loop === null) return;
      started = true;
      await resume(loaded.credit);
    },
    onGap(ms) {
      const l = loop;
      if (l === null || disposed || yielded || faulted) return;
      wallNow();
      const seconds = Math.min(Math.max(0, ms) / 1000, offlineCap(l.state()));
      void resume(seconds);
    },
    view() {
      if (cached !== null) return cached;
      const status = store.status;
      const bak = store.backup();
      cached = {
        storage: status.mode === 'memory' ? 'memory' : status.quota ? 'quota' : 'ok',
        fellBack,
        newer,
        yielded,
        catchUp: progress,
        away,
        backupAt: bak === null ? null : bak.savedAt,
        quarantine: store.quarantined() !== null,
        lastSavedAt,
        active: !yielded && !catchingUp && !faulted && lock.owner,
        readOnly,
      };
      return cached;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    saveNow: () => save('manual'),
    exportText() {
      if (loop === null || memory === null) return Promise.resolve('');
      const data = currentSave();
      return exportFrame(data, metaFor(nextSaveTimes(prev, wallNow(), seen)));
    },
    exportCurrent() {
      if (loop === null || memory === null) return '';
      try {
        return encodeSave(currentSave(), metaFor(nextSaveTimes(prev, wallNow(), seen))).blob;
      } catch {
        return '';
      }
    },
    lastGood: () => store.lastGood(),
    importText: (text) => importFrame(text),
    adopt(data, meta) {
      // Only a tab that may save replaces its game (not yielded, catching up or read-only).
      if (canWrite() !== null) return false;
      if (!replaceGame(data)) return false;
      prev = maxTimes(prev, meta);
      seen = Math.max(seen, meta.maxSeenAt);
      save('manual');
      notify();
      return true;
    },
    backup() {
      const b = store.backup();
      if (b === null) return null;
      const r = decodeSave(b.blob);
      return r.kind === 'ok' ? { save: r.save, meta: r.meta } : null;
    },
    quarantineBlob: () => store.quarantined(),
    hardReset() {
      const blocked = canWrite();
      if (blocked !== null && blocked !== 'readOnly') return false;
      store.hardReset();
      // The player typed RESET: a refused newer save is gone too, so writing resumes.
      if (readOnly) {
        readOnly = false;
        newer = null;
        if (lock.owner && !yielded && started) autosave?.start();
      }
      fellBack = null;
      if (!replaceGame({ game: newGame(), onboarding: NEW_MEMORY })) return false;
      // The first save after the reset writes slot a and a meta naming this tab (§19).
      save('manual');
      notify();
      return true;
    },
    async useHere() {
      const l = loop;
      if (l === null || disposed || faulted || !yielded) return;
      lock.reclaim(wallNow());
      yielded = false;
      const r = loadFromStorage();
      if (!replaceGame(r.save)) return;
      notify();
      await resume(readOnly ? 0 : r.credit);
    },
    dismissAway() {
      if (away === null) return;
      away = null;
      notify();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      runner?.cancel();
      autosave?.stop();
      unsubscribeFault();
      unsubscribeShow();
      lock.dispose();
      listeners.clear();
    },
  };
}
