/**
 * `validate(env)` (GDD §20.1): the problems with a migrated save envelope, empty when it is
 * valid. It never throws, only reads its input and never repairs: a NaN, infinite, negative or
 * wrong-typed field, a missing field, an unknown key or an unknown id makes the save invalid,
 * and the loader then quarantines it and tries the next source (§20.1 load order). New fields
 * get their defaults in a migration, never here; dropping an unknown key would be a repair, and
 * would break the byte-identical round trip.
 *
 * The rules (save v1):
 * - The envelope has exactly `format`, `saveVersion`, `gameVersion`, `savedAt`, `maxSeenAt`,
 *   `dataHash` and `state`; `format` is `SAVE_FORMAT`, `saveVersion` is `SAVE_VERSION`, the
 *   versions and the hash are strings, and the times are integers ≥ 0 (epoch milliseconds).
 * - `state` has exactly `sum`, `time`, `pendingMs` and `onboarding`; `time` and `pendingMs` are
 *   finite and ≥ 0.
 * - `sum` has exactly `x`, `amounts`, `bought` and `globalLevel`. x and the 8 amounts are
 *   canonical `Num` codes (`decodeNum`) that are finite and ≥ 0 (`isValidNum`), the 8 bought
 *   counts and the level are integers in [0, 2^53]. The tier arrays are ordinal positions
 *   G1…G8, not content ids.
 * - `onboarding` has exactly `revealed`, `done` and `visited`: arrays of unique strings, each a
 *   known id of its list (`content/onboarding.ts`).
 */
import { ONBOARDING_KINDS, isKnownOnboardingId } from '../content/onboarding.ts';
import { decodeNum, isValidNum } from '../num.ts';
import { MAX_COUNT } from '../tiers.ts';
import { SAVE_FORMAT, SAVE_VERSION } from './migrations.ts';

type Rec = Readonly<Record<string, unknown>>;

const ENVELOPE_KEYS = Object.freeze([
  'format',
  'saveVersion',
  'gameVersion',
  'savedAt',
  'maxSeenAt',
  'dataHash',
  'state',
]);
const STATE_KEYS = Object.freeze(['sum', 'time', 'pendingMs', 'onboarding']);
const SUM_KEYS = Object.freeze(['x', 'amounts', 'bought', 'globalLevel']);
/** One entry per tier, G1…G8. */
const TIERS = 8;

function isRecord(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Reports missing and unknown keys of `obj` against the exact key list. */
function keys(obj: Rec, expected: readonly string[], path: string, out: string[]): void {
  for (const k of expected) {
    if (!Object.prototype.hasOwnProperty.call(obj, k)) out.push(`${path}.${k}: missing`);
  }
  for (const k of Object.keys(obj)) {
    if (!expected.includes(k)) out.push(`${path}.${JSON.stringify(k)}: unknown key`);
  }
}

function has(obj: Rec, k: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, k);
}

function describe(v: unknown): string {
  if (typeof v === 'number') return Number.isNaN(v) ? 'NaN' : String(v);
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'an array';
  return `a ${typeof v}`;
}

function checkEpochMs(v: unknown, path: string, out: string[]): void {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) {
    out.push(`${path}: not an integer ≥ 0 (${describe(v)})`);
  }
}

function checkTime(v: unknown, path: string, out: string[]): void {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
    out.push(`${path}: not finite and ≥ 0 (${describe(v)})`);
  }
}

function checkCount(v: unknown, path: string, out: string[]): void {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > MAX_COUNT) {
    out.push(`${path}: not an integer in [0, 2^53] (${describe(v)})`);
  }
}

function checkNum(v: unknown, path: string, out: string[]): void {
  const n = decodeNum(v);
  if (n === null) out.push(`${path}: not a canonical Num code`);
  else if (!isValidNum(n)) out.push(`${path}: not finite and ≥ 0`);
}

function checkTuple(
  v: unknown,
  path: string,
  out: string[],
  each: (e: unknown, p: string, o: string[]) => void,
): void {
  if (!Array.isArray(v)) {
    out.push(`${path}: not an array (${describe(v)})`);
    return;
  }
  if (v.length !== TIERS) out.push(`${path}: not ${TIERS} entries`);
  for (let i = 0; i < Math.min(v.length, TIERS); i++) each(v[i], `${path}[${i}]`, out);
}

function checkSum(sum: unknown, out: string[]): void {
  const path = 'state.sum';
  if (!isRecord(sum)) {
    out.push(`${path}: not an object (${describe(sum)})`);
    return;
  }
  keys(sum, SUM_KEYS, path, out);
  if (has(sum, 'x')) checkNum(sum.x, `${path}.x`, out);
  if (has(sum, 'amounts')) checkTuple(sum.amounts, `${path}.amounts`, out, checkNum);
  if (has(sum, 'bought')) checkTuple(sum.bought, `${path}.bought`, out, checkCount);
  if (has(sum, 'globalLevel')) checkCount(sum.globalLevel, `${path}.globalLevel`, out);
}

function checkOnboarding(ob: unknown, out: string[]): void {
  const path = 'state.onboarding';
  if (!isRecord(ob)) {
    out.push(`${path}: not an object (${describe(ob)})`);
    return;
  }
  keys(ob, ONBOARDING_KINDS, path, out);
  for (const kind of ONBOARDING_KINDS) {
    if (!has(ob, kind)) continue;
    const list = ob[kind];
    const p = `${path}.${kind}`;
    if (!Array.isArray(list)) {
      out.push(`${p}: not an array (${describe(list)})`);
      continue;
    }
    const seen = new Set<unknown>();
    list.forEach((id: unknown, i) => {
      if (typeof id !== 'string') out.push(`${p}[${i}]: not a string (${describe(id)})`);
      else if (!isKnownOnboardingId(kind, id)) out.push(`${p}[${i}]: unknown id`);
      else if (seen.has(id)) out.push(`${p}[${i}]: duplicate id`);
      seen.add(id);
    });
  }
}

function check(env: unknown, out: string[]): void {
  if (!isRecord(env)) {
    out.push(`envelope: not an object (${describe(env)})`);
    return;
  }
  keys(env, ENVELOPE_KEYS, 'envelope', out);
  if (has(env, 'format') && env.format !== SAVE_FORMAT) {
    out.push(`envelope.format: not ${SAVE_FORMAT} (${describe(env.format)})`);
  }
  if (has(env, 'saveVersion') && env.saveVersion !== SAVE_VERSION) {
    out.push(`envelope.saveVersion: not ${SAVE_VERSION} (${describe(env.saveVersion)})`);
  }
  for (const k of ['gameVersion', 'dataHash'] as const) {
    if (has(env, k) && typeof env[k] !== 'string') {
      out.push(`envelope.${k}: not a string (${describe(env[k])})`);
    }
  }
  if (has(env, 'savedAt')) checkEpochMs(env.savedAt, 'envelope.savedAt', out);
  if (has(env, 'maxSeenAt')) checkEpochMs(env.maxSeenAt, 'envelope.maxSeenAt', out);
  if (!has(env, 'state')) return;
  const state = env.state;
  if (!isRecord(state)) {
    out.push(`state: not an object (${describe(state)})`);
    return;
  }
  keys(state, STATE_KEYS, 'state', out);
  if (has(state, 'sum')) checkSum(state.sum, out);
  if (has(state, 'time')) checkTime(state.time, 'state.time', out);
  if (has(state, 'pendingMs')) checkTime(state.pendingMs, 'state.pendingMs', out);
  if (has(state, 'onboarding')) checkOnboarding(state.onboarding, out);
}

/** The problems with a migrated envelope; empty when it is valid. Never throws or repairs. */
export function validate(env: unknown): readonly string[] {
  const out: string[] = [];
  try {
    check(env, out);
  } catch {
    out.push('envelope: unreadable');
  }
  return out;
}
