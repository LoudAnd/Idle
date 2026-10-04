// @vitest-environment node
// GDD §19: settings v1 are stored as { settingsVersion: 1, values } with per-field validation:
// an invalid field gets its default, an unknown key is dropped, and the frozen v1 fixture loads.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NOTATION } from '../../src/engine/format.ts';
import { SETTINGS_KEY, createSettingsStore } from '../../src/platform/settingsStore.ts';
import {
  DEFAULT_SETTINGS,
  SETTINGS_FIELDS,
  SETTINGS_MIGRATIONS,
  SETTINGS_VERSION,
  formatOptions,
  loadSettings,
  settingsBlob,
} from '../../src/ui/settings/settings.ts';
import type { Settings } from '../../src/ui/settings/settings.ts';

const FIXTURES = join(__dirname, '..', 'fixtures', 'settings');
const blob = (values: Record<string, unknown>, settingsVersion: unknown = 1) => ({
  settingsVersion,
  values,
});

describe('settings v1 (GDD §19)', () => {
  it('defaults: Scientific, precision 2, integer threshold 1e6, dark, 30 fps', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      notation: 'scientific',
      precision: 2,
      intThreshold: 1e6,
      theme: 'dark',
      uiFps: 30,
    });
    expect(Object.isFrozen(DEFAULT_SETTINGS)).toBe(true);
    expect(SETTINGS_VERSION).toBe(1);
  });

  it.each([
    ['notation', 'roman'],
    ['notation', 0],
    ['precision', 5],
    ['precision', 1.5],
    ['precision', '2'],
    ['intThreshold', 1e4],
    ['theme', 'high-contrast'],
    ['uiFps', 9],
    ['uiFps', 61],
    ['uiFps', 30.5],
    ['uiFps', null],
  ])('an invalid field gets its default: %s = %j', (key, bad) => {
    const good = { ...DEFAULT_SETTINGS, notation: 'standard', precision: 4, theme: 'light' };
    const r = loadSettings(blob({ ...good, [key]: bad }));
    expect(r.settings[key as keyof Settings]).toBe(DEFAULT_SETTINGS[key as keyof Settings]);
    expect(r.problems).toEqual([`${key}: invalid`]);
    // The other fields keep their stored values.
    for (const k of Object.keys(SETTINGS_FIELDS) as (keyof Settings)[]) {
      if (k !== key) expect(r.settings[k]).toBe(good[k]);
    }
  });

  it('a missing field gets its default without a problem', () => {
    const r = loadSettings(blob({ theme: 'light' }));
    expect(r.settings).toEqual({ ...DEFAULT_SETTINGS, theme: 'light' });
    expect(r.problems).toEqual([]);
  });

  it('an unknown key is dropped', () => {
    const r = loadSettings(blob({ theme: 'light', volume: 0.5, __proto__x: 1 }));
    expect(r.settings).toEqual({ ...DEFAULT_SETTINGS, theme: 'light' });
    expect(Object.keys(r.settings)).toEqual(Object.keys(DEFAULT_SETTINGS));
    expect(r.settings).not.toHaveProperty('volume');
    expect(r.problems).toEqual(['volume: unknown', '__proto__x: unknown']);
  });

  it('the v1 fixture loads', () => {
    const raw = readFileSync(join(FIXTURES, 'v1.json'), 'utf8');
    const r = loadSettings(JSON.parse(raw));
    expect(r.problems).toEqual([]);
    expect(r.newer).toBe(false);
    expect(r.settings).toEqual({
      notation: 'engineering',
      precision: 3,
      intThreshold: 1000,
      theme: 'light',
      uiFps: 60,
    });
    // ... and saving it again writes the same bytes (keys in a fixed order).
    expect(JSON.stringify(settingsBlob(r.settings))).toBe(raw.trim());
  });

  it('non-object and bad-version payloads give the defaults', () => {
    for (const raw of [null, undefined, 3, 'x', [], true]) {
      expect(loadSettings(raw).settings).toBe(DEFAULT_SETTINGS);
    }
    for (const v of [undefined, 0, -1, 1.5, '1', null]) {
      const r = loadSettings({ settingsVersion: v, values: { theme: 'light' } });
      expect(r.settings).toBe(DEFAULT_SETTINGS);
      expect(r.problems).toEqual(['settingsVersion: not a positive integer']);
    }
    expect(loadSettings({ settingsVersion: 1, values: 'x' }).problems).toEqual([
      'values: not an object',
    ]);
  });

  it('a newer version keeps its valid known fields and is marked newer (not written back)', () => {
    const r = loadSettings(blob({ theme: 'light', precision: 9, musicVolume: 1 }, 7));
    expect(r.newer).toBe(true);
    expect(r.settings).toEqual({ ...DEFAULT_SETTINGS, theme: 'light' });
  });

  it('migrations.length === SETTINGS_VERSION − 1', () => {
    expect(SETTINGS_MIGRATIONS).toHaveLength(SETTINGS_VERSION - 1);
  });

  it('the blob round-trips', () => {
    const s: Settings = {
      notation: 'logarithm',
      precision: 0,
      intThreshold: 1e9,
      theme: 'light',
      uiFps: 15,
    };
    const b = settingsBlob(s);
    expect(b).toEqual({ settingsVersion: 1, values: s });
    expect(loadSettings(JSON.parse(JSON.stringify(b)))).toEqual({
      settings: s,
      problems: [],
      newer: false,
    });
  });

  it('formatOptions maps the Numbers settings onto the formatter', () => {
    expect(formatOptions({ ...DEFAULT_SETTINGS, notation: 'standard', precision: 3 })).toEqual({
      notation: NOTATION.STANDARD,
      precision: 3,
      intThreshold: 1e6,
    });
  });
});

describe('settings store (isi.settings)', () => {
  function memoryStorage(): Storage {
    const m = new Map<string, string>();
    return {
      get length() {
        return m.size;
      },
      clear: () => m.clear(),
      getItem: (k) => m.get(k) ?? null,
      key: (i) => [...m.keys()][i] ?? null,
      removeItem: (k) => void m.delete(k),
      setItem: (k, v) => void m.set(k, String(v)),
    };
  }

  it('saves the blob as JSON under isi.settings and loads it back', () => {
    const storage = memoryStorage();
    const store = createSettingsStore(storage);
    expect(store.load()).toBeNull();
    const b = settingsBlob({ ...DEFAULT_SETTINGS, theme: 'light' });
    expect(store.save(b)).toBe(true);
    expect(storage.getItem(SETTINGS_KEY)).toBe(JSON.stringify(b));
    expect(createSettingsStore(storage).load()).toEqual(b);
  });

  it('a throwing localStorage gives defaults and never throws; the session keeps its settings', () => {
    const boom = (): never => {
      throw new Error('SecurityError');
    };
    const storage = { getItem: boom, setItem: boom, removeItem: boom } as unknown as Storage;
    const store = createSettingsStore(storage);
    expect(() => store.load()).not.toThrow();
    expect(loadSettings(store.load()).settings).toBe(DEFAULT_SETTINGS);
    const b = settingsBlob({ ...DEFAULT_SETTINGS, precision: 4 });
    expect(store.save(b)).toBe(false);
    expect(loadSettings(store.load()).settings.precision).toBe(4);
  });

  it('no storage at all: memory only', () => {
    const store = createSettingsStore(null);
    expect(store.load()).toBeNull();
    expect(store.save({ settingsVersion: 1, values: {} })).toBe(false);
    expect(store.load()).toEqual({ settingsVersion: 1, values: {} });
  });

  it('corrupt JSON loads as nothing (defaults)', () => {
    const storage = memoryStorage();
    storage.setItem(SETTINGS_KEY, '{"settingsVersion":1,');
    expect(createSettingsStore(storage).load()).toBeNull();
  });
});
