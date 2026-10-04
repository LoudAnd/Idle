/**
 * Save migrations (GDD §20.1). `MIGRATIONS[i]` turns an envelope of save version i + 1 into
 * version i + 2, so `MIGRATIONS.length === SAVE_VERSION − 1` (a test checks it). Every
 * milestone that changes the stored state bumps `SAVE_VERSION`, appends one migration (new
 * fields get their defaults here, never in `validate()`) and commits one frozen fixture
 * `tests/fixtures/saves/vN.json`.
 *
 * `migrate` only reads its input: a migration returns a new envelope. A save from a newer build
 * (a higher `saveVersion`, or a higher envelope `format`) is reported as `newer` and is never
 * migrated, validated or overwritten (§20.1: refused, autosave off, export prompt).
 */

/** The envelope format (`format` in the save): the shape of the envelope itself. */
export const SAVE_FORMAT = 1;
/** The current save version: the shape of `state`. */
export const SAVE_VERSION = 1;

/** One migration: the envelope of version v + 1 from that of version v. */
export type Migration = (env: Readonly<Record<string, unknown>>) => Record<string, unknown>;

/** `MIGRATIONS[v − 1]` upgrades version v to v + 1. Version 1 is the first; M4 has none. */
export const MIGRATIONS: readonly Migration[] = Object.freeze([]);

export type MigrateResult =
  | {
      readonly kind: 'ok';
      readonly env: Readonly<Record<string, unknown>>;
      /** The save version the envelope was stored with. */
      readonly from: number;
    }
  | { readonly kind: 'newer'; readonly saveVersion: number }
  | { readonly kind: 'error'; readonly problem: string };

function isRecord(v: unknown): v is Readonly<Record<string, unknown>> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isVersion(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 1;
}

/**
 * Brings a parsed envelope to `SAVE_VERSION`. Never throws: a migration that throws is an
 * `error`. A `format` above `SAVE_FORMAT` counts as newer too (a later envelope shape).
 */
export function migrate(
  raw: unknown,
  migrations: readonly Migration[] = MIGRATIONS,
  current: number = SAVE_VERSION,
): MigrateResult {
  if (!isRecord(raw)) return { kind: 'error', problem: 'envelope: not an object' };
  const format = raw.format;
  const version = raw.saveVersion;
  if (isVersion(format) && format > SAVE_FORMAT) {
    return { kind: 'newer', saveVersion: isVersion(version) ? version : current + 1 };
  }
  if (!isVersion(version)) return { kind: 'error', problem: 'saveVersion: not a positive integer' };
  if (version > current) return { kind: 'newer', saveVersion: version };
  let env: Readonly<Record<string, unknown>> = raw;
  try {
    for (let v = version; v < current; v++) {
      const m = migrations[v - 1];
      if (m === undefined) return { kind: 'error', problem: `no migration from v${v}` };
      const next = m(env);
      if (!isRecord(next)) return { kind: 'error', problem: `migration v${v}: not an object` };
      env = next;
    }
  } catch (e) {
    return { kind: 'error', problem: `migration: ${e instanceof Error ? e.message : String(e)}` };
  }
  return { kind: 'ok', env, from: version };
}
