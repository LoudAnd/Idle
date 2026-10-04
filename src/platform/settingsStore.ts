/**
 * Settings storage (GDD §19): the `isi.settings` key of `localStorage`, holding the JSON blob
 * `{ settingsVersion, values }` that `src/ui/settings/settings.ts` builds and validates. Game
 * state is not stored before M4, whose `storage.ts` takes this key over.
 *
 * Storage can be missing or throw (a private window, an Artifact iframe, a full quota): every
 * call is wrapped, and the blob is kept in memory, so the session still remembers the settings
 * and nothing throws. The store does not interpret the blob; the platform never imports UI code.
 */
export const SETTINGS_KEY = 'isi.settings';

export interface SettingsStore {
  /** The stored blob parsed from JSON, or `null` if there is none or it does not parse. */
  load(): unknown;
  /** Stores the blob. Returns false when it could only be kept in memory. */
  save(blob: unknown): boolean;
}

export function createSettingsStore(storage: Storage | null): SettingsStore {
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

/** `window.localStorage`, or `null` where reading it throws (blocked storage). */
export function browserStorage(win: Window): Storage | null {
  try {
    return win.localStorage;
  } catch {
    return null;
  }
}
