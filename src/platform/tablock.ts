/**
 * The one-active-tab lock (GDD §20.1). Two open tabs must not both tick and save: one could
 * overwrite the other's progress, and both together would double it.
 *
 * - **Start.** A tab announces `{type: 'hello', id, startedAt}` on a `BroadcastChannel('isi')`
 *   and writes its id as `meta.owner` (the session claims before it loads). The newest tab, the
 *   highest `(startedAt, id)`, owns ticking and saving.
 * - **A newer hello** makes this tab yield (`onLost`): the session stops the loop and autosave
 *   without saving and shows "Open in another tab" with "Use here". **An older hello** is
 *   answered with a hello, so the older tab learns that it should stop.
 * - **Storage events** on `isi.save.meta` naming another owner make the tab yield too. They are
 *   the fallback without BroadcastChannel, and are listened to even when the channel exists.
 * - **Before every write** the save store re-reads `meta.owner` (twice, `storage.ts`), and on
 *   `pageshow` from the back/forward cache or when the tab becomes visible the session calls
 *   `recheck()`, so a lost message cannot break the lock.
 * - **"Use here"** (`reclaim`) takes ownership back with `startedAt = max(now, newest seen + 1)`,
 *   writes `meta.owner` and announces; the session then reloads the latest save from storage,
 *   since the other tab may have saved newer progress.
 */
import { KEYS } from './storage.ts';
import type { SaveStore } from './storage.ts';

/** The channel's name (§20.1). */
export const CHANNEL_NAME = 'isi';

/** A random tab id: `crypto.randomUUID()` where it exists, otherwise time and randomness. */
export function newTabId(c: { randomUUID?: () => string } | undefined = globalThis.crypto): string {
  try {
    if (typeof c?.randomUUID === 'function') return c.randomUUID();
  } catch {
    // not a secure context
  }
  const rnd = () => Math.floor(Math.random() * 2 ** 32).toString(36);
  return `${Date.now().toString(36)}-${rnd()}-${rnd()}`;
}

/** What the lock needs of a `BroadcastChannel`. */
export interface ChannelLike {
  postMessage(msg: unknown): void;
  addEventListener(type: 'message', fn: (e: { readonly data: unknown }) => void): void;
  removeEventListener?(type: 'message', fn: (e: { readonly data: unknown }) => void): void;
  close(): void;
}

/** What the lock needs of a window: its `storage` events. */
export interface StorageEventSource {
  addEventListener(type: 'storage', fn: (e: StorageEvent) => void): void;
  removeEventListener(type: 'storage', fn: (e: StorageEvent) => void): void;
}

export interface Hello {
  readonly type: 'hello';
  readonly id: string;
  readonly startedAt: number;
}

function isHello(v: unknown): v is Hello {
  if (typeof v !== 'object' || v === null) return false;
  const h = v as Record<string, unknown>;
  return (
    h.type === 'hello' &&
    typeof h.id === 'string' &&
    typeof h.startedAt === 'number' &&
    Number.isFinite(h.startedAt)
  );
}

/** True when tab a is newer than tab b: a higher startedAt, then a higher id. */
export function isNewer(a: Omit<Hello, 'type'>, b: Omit<Hello, 'type'>): boolean {
  return a.startedAt > b.startedAt || (a.startedAt === b.startedAt && a.id > b.id);
}

export interface TabLockOptions {
  readonly id: string;
  /** When this tab started (epoch ms). */
  readonly startedAt: number;
  readonly channel: ChannelLike | null;
  readonly store: Pick<SaveStore, 'readMeta' | 'claimOwner'>;
  readonly win: StorageEventSource | null;
  /** A newer tab took over (called once per loss). */
  readonly onLost: () => void;
  /** This tab took ownership back (`reclaim`). */
  readonly onGained?: () => void;
}

export interface TabLock {
  readonly id: string;
  /** This tab owns ticking and saving. */
  readonly owner: boolean;
  /** Posts this tab's hello. */
  announce(): void;
  /** "Use here": ownership back, with a start time newer than every tab seen. */
  reclaim(nowMs: number): void;
  /** Re-reads `meta.owner`; another owner makes this tab yield. Returns `owner`. */
  recheck(): boolean;
  /** Yields ownership (a write was refused: another tab owns the save). */
  yield(): void;
  dispose(): void;
}

export function createTabLock(o: TabLockOptions): TabLock {
  let startedAt = o.startedAt;
  let newest = o.startedAt;
  let owner = true;
  let disposed = false;

  const hello = (): Hello => ({ type: 'hello', id: o.id, startedAt });
  const post = (): void => {
    if (disposed || o.channel === null) return;
    try {
      o.channel.postMessage(hello());
    } catch {
      // a closed channel: the storage events and the write checks still hold the lock
    }
  };
  const lose = (): void => {
    if (!owner || disposed) return;
    owner = false;
    o.onLost();
  };
  const otherOwner = (text: string | null): boolean => {
    if (text === null) return false;
    try {
      const m = JSON.parse(text) as { owner?: unknown };
      return typeof m.owner === 'string' && m.owner !== o.id;
    } catch {
      return false;
    }
  };

  const onMessage = (e: { readonly data: unknown }): void => {
    if (disposed || !isHello(e.data) || e.data.id === o.id) return;
    newest = Math.max(newest, e.data.startedAt);
    if (isNewer(e.data, { id: o.id, startedAt })) lose();
    else post(); // an older tab: tell it a newer one is here
  };
  const onStorage = (e: StorageEvent): void => {
    if (disposed || e.key !== KEYS.meta) return;
    if (otherOwner(e.newValue)) lose();
  };

  o.channel?.addEventListener('message', onMessage);
  o.win?.addEventListener('storage', onStorage);

  return {
    id: o.id,
    get owner() {
      return owner;
    },
    announce: post,
    reclaim(nowMs) {
      if (disposed) return;
      const now = Number.isFinite(nowMs) ? nowMs : startedAt;
      startedAt = Math.max(now, newest + 1, startedAt + 1);
      newest = startedAt;
      o.store.claimOwner(o.id);
      owner = true;
      post();
      o.onGained?.();
    },
    recheck() {
      if (!owner || disposed) return owner;
      const meta = o.store.readMeta();
      if (meta !== null && meta.owner !== null && meta.owner !== o.id) lose();
      return owner;
    },
    yield: lose,
    dispose() {
      if (disposed) return;
      disposed = true;
      o.channel?.removeEventListener?.('message', onMessage);
      o.win?.removeEventListener('storage', onStorage);
      try {
        o.channel?.close();
      } catch {
        // already closed
      }
    },
  };
}
