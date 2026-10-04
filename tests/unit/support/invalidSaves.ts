// Invalid save fixtures (GDD §20.1, ROADMAP M4: "a NaN, negative, wrong-typed or missing field,
// one fixture each"). JSON cannot hold NaN or Infinity, so `validate()` gets JavaScript objects
// (`INVALID_CASES`), and the storage path gets what JSON makes of them (`INVALID_JSON`): `null`
// for NaN (JSON.stringify's output) and the text `1e999`, which parses to Infinity.
import { encodeSave, toEnvelope } from '../../../src/engine/save/envelope.ts';
import type { EnvelopeMeta, SaveData } from '../../../src/engine/save/envelope.ts';
import { makeState } from '../../../src/engine/state.ts';

export const META: EnvelopeMeta = Object.freeze({
  gameVersion: '0.4.0',
  savedAt: 1_790_000_000_000,
  maxSeenAt: 1_790_000_000_000,
  dataHash: '',
});

/** A non-trivial valid save: five tiers owned, a global level, pending time, memory. */
export function sampleSave(): SaveData {
  return {
    game: makeState({
      x: '1.25e12',
      amounts: ['3e9', '2e7', 4000, 25, 3],
      bought: [31, 22, 13, 4, 3],
      globalLevel: 7,
      time: 612.5,
      pendingMs: 350,
    }),
    onboarding: {
      revealed: ['global', 'maxAll', 'tier.2', 'tier.3', 'tier.4', 'tier.5', 'tier.6'],
      done: ['goal.g2', 'goal.g3', 'goal.g4', 'goal.g5'],
      visited: ['sum'],
    },
  };
}

/** A fresh, mutable plain-object envelope of `sampleSave()`. */
export function validEnvelope(): Record<string, any> {
  return JSON.parse(JSON.stringify(toEnvelope(sampleSave(), META)));
}

type Mutation = (env: Record<string, any>) => void;

/** One invalid field per case, each a change to `validEnvelope()`. */
export const INVALID_CASES: readonly (readonly [string, Mutation])[] = [
  ['NaN', (e) => (e.state.sum.x = [1, 0, Number.NaN])],
  ['infinite', (e) => (e.state.time = Number.POSITIVE_INFINITY)],
  ['negative', (e) => (e.state.sum.amounts[0] = [-1, 0, 5])],
  ['negative count', (e) => (e.state.sum.bought[1] = -1)],
  ['non-canonical', (e) => (e.state.sum.amounts[2] = [1, 0, -5])],
  ['wrong type', (e) => (e.state.sum.bought[2] = '5')],
  ['missing', (e) => delete e.state.sum.globalLevel],
  ['unknown key', (e) => (e.state.extra = 1)],
  ['unknown id', (e) => e.state.onboarding.revealed.push('tier.9')],
  ['duplicate id', (e) => e.state.onboarding.done.push('goal.g2')],
  ['fractional count', (e) => (e.state.sum.globalLevel = 1.5)],
  ['short tier array', (e) => e.state.sum.bought.pop()],
  ['negative time', (e) => (e.state.pendingMs = -1)],
  ['wrong envelope type', (e) => (e.gameVersion = 4)],
  ['fractional savedAt', (e) => (e.savedAt = 1.5)],
];

/** The envelope of one case. */
export function invalidEnvelope(name: string): Record<string, any> {
  const c = INVALID_CASES.find(([n]) => n === name);
  if (c === undefined) throw new Error(`no case ${name}`);
  const env = validEnvelope();
  c[1](env);
  return env;
}

/**
 * The storage-path fixtures: JSON texts, as a blob would hold them. NaN becomes `null` (what
 * JSON.stringify writes) and Infinity the literal `1e999`.
 */
export const INVALID_JSON: readonly (readonly [string, string])[] = [
  ['NaN', JSON.stringify(invalidEnvelope('NaN'))],
  ['infinite', JSON.stringify(validEnvelope()).replace('"time":612.5', '"time":1e999')],
  ['negative', JSON.stringify(invalidEnvelope('negative'))],
  ['wrong type', JSON.stringify(invalidEnvelope('wrong type'))],
  ['missing', JSON.stringify(invalidEnvelope('missing'))],
];

/** A valid frame of the sample save (for building corrupt variants). */
export function sampleBlob(meta: EnvelopeMeta = META): string {
  return encodeSave(sampleSave(), meta).blob;
}
