// @vitest-environment node
// GDD §20.2, ROADMAP M4: the macro-step schedule (at most 2,000 steps summing exactly to the
// credited time; maximum steps of 2.1 s at 1 h, 62 s at 24 h and 516 s at 7 days), the credit
// max(0, now − maxSeenAt) with its cap, and `advance()` against the bot's 1 s exact-step
// reference with scripted purchases (§22 items 7 and 9). The 50 ms reference runs nightly
// (tests/nightly/offline-50ms.test.ts).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Action } from '../../src/engine/actions.ts';
import {
  OFFLINE_CAP_S,
  OFFLINE_FINE_STEP_S,
  OFFLINE_MAX_STEPS,
} from '../../src/engine/content/offline.ts';
import { log10Floor1 } from '../../src/engine/num.ts';
import {
  advance,
  continueAdvance,
  creditedSeconds,
  macroSteps,
  offlineCap,
  startAdvance,
} from '../../src/engine/offline.ts';
import { makeState, newGame, serializeState } from '../../src/engine/state.ts';
import type { GameState } from '../../src/engine/state.ts';
import { step } from '../../src/engine/tick.ts';
import { runBot } from '../../src/sim/bot.ts';
import { createRng } from '../../src/sim/rng.ts';
import { FC_SEED, uniform } from './support/arbitraries.ts';

const HOUR = 3600;
const DAY = 86_400;
const MAX_ALL: Action = { type: 'maxAll' };

/** The left fold of the steps, as `advance` accumulates them. */
const leftFold = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

/** The maxima of docs/prototypes/macro_steps.py (`python3 macro_steps.py`, h_max). */
const PROTOTYPE_MAX: readonly (readonly [number, number])[] = [
  [HOUR, 2.0900437755125267],
  [8 * HOUR, 19.17664886914463],
  [DAY, 62.45764573780434],
  [3 * DAY, 205.077815776629],
  [7 * DAY, 516.4339396209398],
];

/** The 1 s exact-step reference (§22.6): the bot's step, with actions at whole seconds. */
function reference(s: GameState, seconds: number, actionsAt: (t: number) => Action[]): GameState {
  let out = s;
  for (let t = 0; t < seconds; t++) out = step(out, actionsAt(t), 1);
  return out;
}

const relLog = (a: GameState, b: GameState) => {
  const la = log10Floor1(a.sum.x);
  const lb = log10Floor1(b.sum.x);
  return Math.abs(la - lb) / Math.abs(lb);
};

describe('macroSteps (GDD §20.2)', () => {
  it('the schedule has at most 2,000 steps whose left-fold sum is exactly Δ', () => {
    for (const d of [1e-9, 0.37, 1, 100, HOUR, 8 * HOUR, DAY, 3 * DAY, 7 * DAY]) {
      const steps = macroSteps(d);
      expect(steps.length, String(d)).toBeLessThanOrEqual(OFFLINE_MAX_STEPS);
      expect(steps.length).toBeGreaterThanOrEqual(1);
      expect(leftFold(steps), String(d)).toBe(d);
      for (const h of steps) expect(h).toBeGreaterThan(0);
    }
    fc.assert(
      fc.property(fc.oneof(uniform(1e-6, 1), uniform(1, 200), uniform(200, 7 * DAY)), (d) => {
        const steps = macroSteps(d);
        expect(steps.length).toBeLessThanOrEqual(OFFLINE_MAX_STEPS);
        expect(leftFold(steps)).toBe(d);
        expect(Math.min(...steps)).toBeGreaterThan(0);
      }),
      { seed: FC_SEED, numRuns: 300 },
    );
  });

  it('maximum steps are 2.1 s at 1 h, 62 s at 24 h and 516 s at 7 days (±1%)', () => {
    const max = (d: number) => Math.max(...macroSteps(d));
    for (const [d, want] of [
      [HOUR, 2.1],
      [8 * HOUR, 19],
      [DAY, 62],
      [3 * DAY, 205],
      [7 * DAY, 516],
    ] as const) {
      expect(Math.abs(max(d) - want) / want, `${d} s`).toBeLessThanOrEqual(0.01);
    }
    // And equal to the prototype's h_max to 1e-9 relative.
    for (const [d, hMax] of PROTOTYPE_MAX) {
      expect(Math.abs(max(d) - hMax) / hMax, `${d} s`).toBeLessThan(1e-9);
      expect(macroSteps(d)).toHaveLength(OFFLINE_MAX_STEPS);
    }
  });

  it('the ramp grows by 1.01 per step from 50 ms until it meets h_max', () => {
    const steps = macroSteps(DAY);
    expect(steps[0]).toBe(OFFLINE_FINE_STEP_S);
    expect(steps[1]).toBeCloseTo(0.0505, 15);
    for (let i = 1; i < steps.length - 1; i++) {
      expect(steps[i]!).toBeGreaterThanOrEqual(steps[i - 1]!);
    }
    // The prototype's ramp count at 24 h: 717 steps below h_max.
    const hMax = Math.max(...steps);
    expect(steps.slice(0, -1).filter((h) => h < hMax).length).toBe(717);
  });

  it('credit ≤ 1 s uses equal steps of at most 50 ms', () => {
    for (const d of [1e-9, 0.01, 0.05, 0.051, 0.37, 0.999, 1]) {
      const steps = macroSteps(d);
      expect(steps.length).toBe(Math.max(1, Math.ceil(d / 0.05 - 1e-9)));
      for (const h of steps) {
        expect(h).toBeLessThanOrEqual(0.05 + 1e-15);
        expect(h).toBeCloseTo(d / steps.length, 15);
      }
    }
    expect(macroSteps(1)).toHaveLength(20);
    expect(macroSteps(0.15)).toHaveLength(3);
    // Up to 100 s the steps stay at 50 ms (2,000 of them; the last one is the residual).
    expect(macroSteps(100)).toHaveLength(2000);
    for (const h of macroSteps(100)) expect(Math.abs(h - 0.05)).toBeLessThan(1e-10);
  });

  it('0, negative, NaN and infinite spans have no steps', () => {
    for (const d of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(macroSteps(d)).toEqual([]);
    }
  });
});

describe('credited time (GDD §20.2)', () => {
  it('credited time is max(0, now − maxSeenAt), capped: 30 h gives exactly 24 h', () => {
    const t0 = 1_790_000_000_000;
    expect(creditedSeconds(t0 + 30 * HOUR * 1000, t0, OFFLINE_CAP_S)).toBe(86_400);
    expect(creditedSeconds(t0 + 2 * HOUR * 1000, t0, OFFLINE_CAP_S)).toBe(7200);
    expect(creditedSeconds(t0 + 1500, t0, OFFLINE_CAP_S)).toBe(1.5);
    // The clock was set back: nothing.
    expect(creditedSeconds(t0 - 5 * HOUR * 1000, t0, OFFLINE_CAP_S)).toBe(0);
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(creditedSeconds(bad, t0, OFFLINE_CAP_S)).toBe(0);
      expect(creditedSeconds(t0, bad, OFFLINE_CAP_S)).toBe(0);
      expect(creditedSeconds(t0 + 1000, t0, bad)).toBe(0);
    }
    expect(offlineCap(newGame())).toBe(OFFLINE_CAP_S);
    expect(OFFLINE_CAP_S).toBe(24 * HOUR);
  });
});

describe('advance() (GDD §20.2)', () => {
  it(
    '48 scripted Max-all purchases (every 10 min) over 8 h match the 1 s exact-step reference within 1e-6 relative in log10 x',
    { timeout: 120_000 },
    () => {
      const s0 = newGame();
      const span = 8 * HOUR;
      const schedule = Array.from({ length: 48 }, (_, k) => ({ at: 600 * k, actions: [MAX_ALL] }));
      const ref = reference(s0, span, (t) => (t % 600 === 0 ? [MAX_ALL] : []));
      const off = advance(s0, span, schedule);
      expect(off.time).toBeCloseTo(ref.time, 6);
      // The same purchases were made.
      expect(off.sum.bought).toEqual(ref.sum.bought);
      expect(off.sum.globalLevel).toBe(ref.sum.globalLevel);
      expect(relLog(off, ref)).toBeLessThanOrEqual(1e-6);
      // Far beyond a new game, and below the cap.
      expect(log10Floor1(ref.sum.x)).toBeGreaterThan(100);
    },
  );

  it(
    '1 h without actions is within 0.5% of the 1 s reference in log10 x (§22.9)',
    { timeout: 60_000 },
    () => {
      const s0 = runBot({ profile: 'active', seed: 1, seconds: 360 }).final;
      const ref = reference(s0, HOUR, () => []);
      const off = advance(s0, HOUR);
      expect(relLog(off, ref)).toBeLessThanOrEqual(0.005);
      expect(relLog(off, ref)).toBeLessThan(1e-9); // in M2 the integrator is exact between events
    },
  );

  it('a scheduled time splits a step; actions at 0 apply first and at Δ after the last step', () => {
    const s0 = makeState({ x: 1e6, amounts: [10], bought: [1] });
    const buy: Action = { type: 'buy', tier: 2, mode: 'one' };
    // Actions at 0: applied before the first step.
    expect(serializeState(advance(s0, 0.5, [{ at: 0, actions: [buy] }]))).toBe(
      serializeState(advance(step(s0, [buy], 0), 0.5)),
    );
    // Actions at Δ: after the whole span.
    expect(serializeState(advance(s0, 0.5, [{ at: 0.5, actions: [buy] }]))).toBe(
      serializeState(step(advance(s0, 0.5), [buy], 0)),
    );
    // Out of range or non-finite times are ignored.
    const ignored = [
      { at: -1, actions: [buy] },
      { at: 0.6, actions: [buy] },
      { at: Number.NaN, actions: [buy] },
      { at: Number.POSITIVE_INFINITY, actions: [buy] },
    ];
    expect(serializeState(advance(s0, 0.5, ignored))).toBe(serializeState(advance(s0, 0.5)));
    // A time inside a step splits it there: the job has one more piece.
    const plain = startAdvance(s0, 0.1);
    const split = startAdvance(s0, 0.1, [{ at: 0.03, actions: [buy] }]);
    expect(plain.total).toBe(2);
    expect(split.total).toBe(3);
    expect(split.pieces.map((p) => p.actions.length)).toEqual([0, 1, 0]);
    expect(split.pieces[0]!.seconds).toBeCloseTo(0.03, 15);
    expect(split.pieces[1]!.seconds).toBeCloseTo(0.02, 15);
  });

  it('equal times keep their schedule order (stable)', () => {
    // With x = 150, G1 max then a global level buys 4 G1, and the other order 1 level, 2 G1.
    const s0 = makeState({ x: 150 });
    const g1: Action = { type: 'buy', tier: 1, mode: 'max' };
    const gl: Action = { type: 'buyGlobal', mode: 'max' };
    const a = advance(s0, 1, [
      { at: 0.5, actions: [g1] },
      { at: 0.5, actions: [gl] },
    ]);
    const b = advance(s0, 1, [
      { at: 0.5, actions: [gl] },
      { at: 0.5, actions: [g1] },
    ]);
    expect(a.sum.bought[0]).toBe(4);
    expect(b.sum.bought[0]).toBe(2);
    expect(b.sum.globalLevel).toBe(1);
    const job = startAdvance(s0, 1, [
      { at: 0.5, actions: [g1] },
      { at: 0.5, actions: [gl] },
    ]);
    expect(job.pieces.filter((p) => p.actions.length > 0).map((p) => p.actions)).toEqual([
      [g1, gl],
    ]);
  });

  it('slicing a job gives byte-identical results', { timeout: 30_000 }, () => {
    const s0 = runBot({ profile: 'active', seed: 2, seconds: 300 }).final;
    const schedule = [100, 900, 2000].map((at) => ({ at, actions: [MAX_ALL] }));
    const whole = advance(s0, 3 * HOUR, schedule);
    const rng = createRng(FC_SEED);
    let job = startAdvance(s0, 3 * HOUR, schedule);
    let slices = 0;
    while (!job.done) {
      const before = job;
      job = continueAdvance(job, 1 + rng.int(97));
      expect(before.done).toBe(false); // the input job is unchanged
      slices++;
    }
    expect(slices).toBeGreaterThan(10);
    expect(job.index).toBe(job.total);
    expect(serializeState(job.state)).toBe(serializeState(whole));
  });

  it('commits the pending time first, and an invalid span returns the state itself', () => {
    const s0 = { ...makeState({ amounts: [1] }), pendingMs: 400 };
    const out = advance(s0, 1);
    expect(out.time).toBeCloseTo(1.4, 12);
    expect(out.pendingMs).toBe(0);
    for (const d of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(advance(s0, d)).toBe(s0);
      expect(startAdvance(s0, d).done).toBe(true);
    }
  });
});
