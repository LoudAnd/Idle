// A fake localStorage for the save tests (GDD §20.1): one shared Map-backed area that several
// instances (tabs) connect to. Each instance records its calls, can throw on every call, and
// tells the other connected windows about changes with `storage` events, as browsers do. The
// area can enforce a byte limit, above which `setItem` throws a QuotaExceededError.
import type { KeyValueStore } from '../../../src/platform/storage.ts';

export interface StorageCall {
  readonly op: 'getItem' | 'setItem' | 'removeItem';
  readonly key: string;
  readonly value?: string;
}

export interface FakeStorage extends KeyValueStore {
  readonly calls: StorageCall[];
  /** Throw on every call (a blocked localStorage). */
  throwAll: boolean;
}

/** Anything that receives `storage` events (a window; its own `Event` class is used). */
export interface StorageEventTarget {
  dispatchEvent(e: Event): boolean;
  readonly Event?: typeof Event;
}

export interface StorageArea {
  readonly data: Map<string, string>;
  /** Bytes in use (UTF-16: 2 per code unit of keys and values). */
  bytes(): number;
  /** The byte limit; `Infinity` for none. */
  quotaBytes: number;
  /** A new instance (a tab) whose changes reach the other connected targets. */
  connect(target?: StorageEventTarget | null): FakeStorage;
  /** A snapshot of every key and value. */
  snapshot(): Record<string, string>;
}

function quotaError(): DOMException {
  return new DOMException('The quota has been exceeded.', 'QuotaExceededError');
}

export function createStorageArea(opts: { quotaBytes?: number } = {}): StorageArea {
  const data = new Map<string, string>();
  const targets = new Set<StorageEventTarget>();
  const size = (m: Map<string, string>) =>
    [...m].reduce((n, [k, v]) => n + 2 * (k.length + v.length), 0);
  const area: StorageArea = {
    data,
    quotaBytes: opts.quotaBytes ?? Number.POSITIVE_INFINITY,
    bytes: () => size(data),
    snapshot: () => Object.fromEntries(data),
    connect(target = null) {
      if (target !== null) targets.add(target);
      const notify = (key: string, oldValue: string | null, newValue: string | null) => {
        for (const t of targets) {
          if (t === target) continue;
          // The target window's own Event class: jsdom refuses another realm's events.
          const E = t.Event ?? Event;
          const e = new E('storage');
          Object.assign(e, { key, oldValue, newValue });
          t.dispatchEvent(e);
        }
      };
      const store: FakeStorage = {
        calls: [],
        throwAll: false,
        getItem(key) {
          store.calls.push({ op: 'getItem', key });
          if (store.throwAll) throw new DOMException('blocked', 'SecurityError');
          return data.get(key) ?? null;
        },
        setItem(key, value) {
          const v = String(value);
          store.calls.push({ op: 'setItem', key, value: v });
          if (store.throwAll) throw new DOMException('blocked', 'SecurityError');
          const next = new Map(data);
          next.set(key, v);
          if (size(next) > area.quotaBytes) throw quotaError();
          const old = data.get(key) ?? null;
          data.set(key, v);
          if (old !== v) notify(key, old, v);
        },
        removeItem(key) {
          store.calls.push({ op: 'removeItem', key });
          if (store.throwAll) throw new DOMException('blocked', 'SecurityError');
          const old = data.get(key) ?? null;
          data.delete(key);
          if (old !== null) notify(key, old, null);
        },
      };
      return store;
    },
  };
  return area;
}

/** A store whose every call throws (a blocked localStorage). */
export function throwingStorage(): FakeStorage {
  const s = createStorageArea().connect();
  s.throwAll = true;
  return s;
}
