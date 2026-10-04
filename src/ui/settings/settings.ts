/**
 * Settings v1 (GDD §19): the Numbers and Display settings of M3, their defaults, per-field
 * validation, migrations and the stored form `{ settingsVersion, values }` (key `isi.settings`,
 * `src/platform/storage.ts`).
 *
 * | Field          | Values                                               | Default      |
 * | -------------- | ---------------------------------------------------- | ------------ |
 * | `notation`     | `scientific`, `engineering`, `logarithm`, `standard` | `scientific` |
 * | `precision`    | integer 0–4                                          | 2            |
 * | `intThreshold` | 1e3, 1e6, 1e9                                        | 1e6          |
 * | `theme`        | `dark`, `light` (high-contrast comes in M16)         | `dark`       |
 * | `uiFps`        | integer 10–60 (the panel offers 15, 30 and 60)       | 30           |
 *
 * Loading never throws. A missing or invalid field gets its default and is reported; unknown
 * keys are dropped. A payload that is not an object, or whose `settingsVersion` is missing or
 * not a positive integer, gives the defaults. An older version runs through
 * `SETTINGS_MIGRATIONS`; a newer one (a later build's settings) has its known keys validated
 * field by field and is not written back until the player changes a setting. Milestones that add
 * settings (M5, M10, M12b, M16, M20) bump the version, append a migration and add a frozen
 * fixture in `tests/fixtures/settings/`.
 */
import { NOTATION } from '../../engine/format.ts';
import type { FormatOptions, Notation } from '../../engine/format.ts';
import { UI_FPS, UI_FPS_RANGE } from '../../platform/loop.ts';

export const SETTINGS_VERSION = 1;

export type NotationId = 'scientific' | 'engineering' | 'logarithm' | 'standard';
export type ThemeId = 'dark' | 'light';
export type IntThreshold = 1e3 | 1e6 | 1e9;

export interface Settings {
  readonly notation: NotationId;
  readonly precision: number;
  readonly intThreshold: IntThreshold;
  readonly theme: ThemeId;
  readonly uiFps: number;
}

export const NOTATION_IDS: readonly NotationId[] = Object.freeze([
  'scientific',
  'engineering',
  'logarithm',
  'standard',
]);
export const THEME_IDS: readonly ThemeId[] = Object.freeze(['dark', 'light']);
export const INT_THRESHOLDS: readonly IntThreshold[] = Object.freeze([1e3, 1e6, 1e9]);
export const PRECISIONS: readonly number[] = Object.freeze([0, 1, 2, 3, 4]);
/** The UI fps choices the Display panel offers (any integer 10–60 loads). */
export const UI_FPS_OPTIONS: readonly number[] = Object.freeze([15, 30, 60]);

export const DEFAULT_SETTINGS: Settings = Object.freeze({
  notation: 'scientific',
  precision: 2,
  intThreshold: 1e6,
  theme: 'dark',
  uiFps: UI_FPS,
});

type Validators = { readonly [K in keyof Settings]: (v: unknown) => v is Settings[K] };

function oneOf<T>(values: readonly T[]): (v: unknown) => v is T {
  return (v: unknown): v is T => values.includes(v as T);
}

function intIn(min: number, max: number): (v: unknown) => v is number {
  return (v: unknown): v is number =>
    typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
}

/** One validator per field, in the stored key order. */
export const SETTINGS_FIELDS: Validators = Object.freeze({
  notation: oneOf(NOTATION_IDS),
  precision: intIn(0, 4),
  intThreshold: oneOf(INT_THRESHOLDS),
  theme: oneOf(THEME_IDS),
  uiFps: intIn(UI_FPS_RANGE.min, UI_FPS_RANGE.max),
});

const FIELD_ORDER = Object.keys(SETTINGS_FIELDS) as (keyof Settings)[];

/** A settings migration: the values of version v + 1 from those of version v. */
export type SettingsMigration = (
  values: Readonly<Record<string, unknown>>,
) => Record<string, unknown>;

/** `SETTINGS_MIGRATIONS[v − 1]` upgrades version v to v + 1. Version 1 is the first. */
export const SETTINGS_MIGRATIONS: readonly SettingsMigration[] = Object.freeze([]);

export interface LoadedSettings {
  readonly settings: Settings;
  /** What was wrong with the stored payload (empty when it loaded cleanly). */
  readonly problems: readonly string[];
  /** The payload came from a newer build: do not write it back until the player changes it. */
  readonly newer: boolean;
}

export interface SettingsBlob {
  readonly settingsVersion: number;
  readonly values: Settings;
}

function isRecord(v: unknown): v is Readonly<Record<string, unknown>> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const DEFAULTS: LoadedSettings = Object.freeze({
  settings: DEFAULT_SETTINGS,
  problems: Object.freeze([]),
  newer: false,
});

/** Validates a stored payload field by field. Never throws. */
export function loadSettings(raw: unknown): LoadedSettings {
  if (raw === null || raw === undefined) return DEFAULTS;
  if (!isRecord(raw)) return { ...DEFAULTS, problems: ['settings: not an object'] };
  const version = raw.settingsVersion;
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1) {
    return { ...DEFAULTS, problems: ['settingsVersion: not a positive integer'] };
  }
  const problems: string[] = [];
  let values: Readonly<Record<string, unknown>> = isRecord(raw.values) ? raw.values : {};
  if (!isRecord(raw.values)) problems.push('values: not an object');
  try {
    for (let v = version; v < SETTINGS_VERSION; v++) {
      const migrate = SETTINGS_MIGRATIONS[v - 1];
      if (migrate === undefined) throw new Error(`no migration from settings v${v}`);
      values = migrate(values);
    }
  } catch (e) {
    return { ...DEFAULTS, problems: [`migration: ${e instanceof Error ? e.message : String(e)}`] };
  }
  const out: Record<string, unknown> = {};
  for (const key of FIELD_ORDER) {
    const v = values[key];
    if (SETTINGS_FIELDS[key](v)) {
      out[key] = v;
    } else {
      out[key] = DEFAULT_SETTINGS[key];
      if (v !== undefined) problems.push(`${key}: invalid`);
    }
  }
  for (const key of Object.keys(values)) {
    if (!(key in SETTINGS_FIELDS) && version <= SETTINGS_VERSION) problems.push(`${key}: unknown`);
  }
  return {
    settings: Object.freeze(out as unknown as Settings),
    problems,
    newer: version > SETTINGS_VERSION,
  };
}

/** The stored form, keys in a fixed order (so two saves of the same settings are identical). */
export function settingsBlob(s: Settings): SettingsBlob {
  const values: Record<string, unknown> = {};
  for (const key of FIELD_ORDER) values[key] = s[key];
  return { settingsVersion: SETTINGS_VERSION, values: values as unknown as Settings };
}

const NOTATION_OF: Readonly<Record<NotationId, Notation>> = Object.freeze({
  scientific: NOTATION.SCIENTIFIC,
  engineering: NOTATION.ENGINEERING,
  logarithm: NOTATION.LOGARITHM,
  standard: NOTATION.STANDARD,
});

/** The formatter options the Numbers settings select. */
export function formatOptions(s: Settings): Partial<FormatOptions> {
  return {
    notation: NOTATION_OF[s.notation],
    precision: s.precision,
    intThreshold: s.intThreshold,
  };
}
