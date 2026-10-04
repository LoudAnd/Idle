// @vitest-environment node
// GDD §20.1: the save JSON is at most 64 KB, tested on a late-game-shaped fixture (all layers,
// 170 sequences, a full Lab history). Kept from M4 on. Before those systems exist the fixture is
// the largest M4 state plus projected id-keyed sections of their planned shape; each milestone
// that ships one replaces its projection with real state (GDD v1.5 changelog).
import { describe, expect, it } from 'vitest';
import { GOAL_IDS, REVEAL_IDS, TAB_IDS } from '../../src/engine/content/onboarding.ts';
import { CAP, fromComponents } from '../../src/engine/num.ts';
import { encodeSave, toEnvelope } from '../../src/engine/save/envelope.ts';
import type { SaveData } from '../../src/engine/save/envelope.ts';
import { MAX_COUNT, map8 } from '../../src/engine/state.ts';
import type { GameState } from '../../src/engine/state.ts';
import { utf8Encode } from '../../src/engine/save/codec.ts';

const BUDGET = 64 * 1024;
const META = {
  gameVersion: '10.20.30-rc.4',
  savedAt: 9_007_199_254_740_991,
  maxSeenAt: 9_007_199_254_740_991,
  dataHash: 'f'.repeat(64),
};

/** The largest M4 state: every count near 2^53, every value a full-precision mag. */
function largestM4Save(): SaveData {
  const game: GameState = {
    sum: {
      x: CAP,
      amounts: map8((i) => fromComponents(1, 3, 1234567.891234567 + i)),
      bought: map8((i) => MAX_COUNT - 1 - i),
      globalLevel: MAX_COUNT - 1,
    },
    time: 123456789.12345679,
    pendingMs: 59999.123456789,
    table: null,
  };
  return {
    game,
    onboarding: { revealed: [...REVEAL_IDS], done: [...GOAL_IDS], visited: [...TAB_IDS] },
  };
}

const anumber = (i: number) => `A${String(i * 1373 + 45).padStart(6, '0')}`;

/** Projected sections of the later systems, keyed by A-number (§20.1: ids, not indices). */
function projected(): Record<string, unknown> {
  const seqs = Array.from({ length: 170 }, (_, i) => anumber(i));
  const operators = Array.from({ length: 16 }, (_, i) => `op${String(i).padStart(2, '0')}`);
  const perSeq = (f: (a: string, i: number) => unknown) =>
    Object.fromEntries(seqs.map((a, i) => [a, f(a, i)]));
  return {
    // M7: discoveries with depth, hints and hold caps per sequence.
    collection: perSeq((_, i) => ({ d: 1, depth: i % 21, hints: i % 4, hold: i % 9 })),
    // M5/M13/M21: layer currencies, upgrades, milestones, resets, bests.
    layers: Object.fromEntries(
      ['product', 'power', 'tower', 'exponent'].map((l) => [
        l,
        {
          currency: [1, 3, 1234567.891234567],
          best: [1, 3, 1234567.891234567],
          resets: 9_007_199_254_740_991,
          upgrades: Array.from({ length: 24 }, (_, i) => `${l}.u${i}`),
          milestones: Array.from({ length: 12 }, (_, i) => `${l}.m${i}`),
          bestTimeS: 123456.789,
        },
      ]),
    ),
    // M14: 8 slots, each an A-number.
    slots: seqs.slice(0, 8),
    // M15: 8 challenges with completions and best times.
    challenges: Object.fromEntries(
      Array.from({ length: 8 }, (_, i) => [`c${i + 1}`, { done: 5, bestS: 1234.5678 }]),
    ),
    // M18a: the full Lab history, every operator tried on every sequence, as op:A-number ids.
    lab: operators.flatMap((op) => seqs.map((a) => `${op}:${a}`)),
    // M18b: links and chains between sequences.
    links: seqs.slice(0, 60).map((a, i) => `${a}>${anumber(i + 1)}`),
    // M22: 12 Records with their indices.
    records: Object.fromEntries(seqs.slice(0, 12).map((a, i) => [a, { index: 40 + i, best: i }])),
    // M11: autobuyers with intervals and modes.
    autobuyers: Object.fromEntries(
      Array.from({ length: 16 }, (_, i) => [`ab${i}`, { on: true, mode: 'max', interval: 0.05 }]),
    ),
    // M12b: achievements.
    achievements: Array.from({ length: 120 }, (_, i) => `ach.${i}`),
  };
}

describe('the save size budget (GDD §20.1)', () => {
  it('the largest M4 state’s save JSON is at most 64 KB', () => {
    const { json } = encodeSave(largestM4Save(), META);
    const bytes = utf8Encode(json).length;
    console.log(`M4 save JSON: ${bytes} B`);
    expect(bytes).toBeLessThanOrEqual(BUDGET);
  });

  it('the save JSON of a late-game-shaped fixture is at most 64 KB', () => {
    const env = toEnvelope(largestM4Save(), META);
    const late = { ...env, state: { ...env.state, ...projected() } };
    const json = JSON.stringify(late);
    const bytes = utf8Encode(json).length;
    console.log(`late-game-shaped save JSON: ${bytes} B`);
    // The fixture is really late-game sized (the Lab history alone is 2,720 ids).
    expect((late.state as unknown as { lab: unknown[] }).lab).toHaveLength(16 * 170);
    expect(bytes).toBeGreaterThan(30_000);
    expect(bytes).toBeLessThanOrEqual(BUDGET);
  });
});
