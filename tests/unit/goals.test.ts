// @vitest-environment node
// GDD §17.1: the Next goal chip shows the nearest unlock and a log-scale percentage clamped to
// 0–100%, so x = 0 shows 0%. Done goals (a tier once owned, an x threshold once reached) are
// remembered, so the chip never flips back.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CAP, TOWER1, fromComponents, num, pow2 } from '../../src/engine/num.ts';
import type { Num } from '../../src/engine/num.ts';
import { map8 } from '../../src/engine/state.ts';
import { GOALS, GOAL_IDS, goalPercent, isGoalId, mergeDone, nextGoal } from '../../src/ui/goals.ts';
import type { GoalContext, GoalId } from '../../src/ui/goals.ts';
import { STRINGS } from '../../src/ui/strings.ts';
import { fill } from '../../src/ui/tpl.ts';
import { FC_SEED, arbNum } from './support/arbitraries.ts';

const ALL = [1, 1, 1, 1, 1, 1, 1, 1];
const G1_TO_G7 = [1, 1, 1, 1, 1, 1, 1, 0];

interface Case {
  readonly c: GoalContext;
  readonly done: ReadonlySet<GoalId>;
}

function ctx(x: Num | string | number, bought: readonly number[] = [], done: GoalId[] = []): Case {
  return { c: { x: num(x), bought: map8((i) => bought[i] ?? 0) }, done: new Set(done) };
}

/** The chip's text for a context ("Buy G2 · 0%"), or null. */
function chip({ c, done }: Case): string | null {
  const g = nextGoal(c, done);
  if (g === null) return null;
  return fill(STRINGS['goal.chip'], { goal: fill(STRINGS[g.key], g.params), pct: g.pct });
}

describe('Next goal (GDD §17.1)', () => {
  it.each([
    ['x = 0, b1 = 1', ctx(0, [1]), 'Buy G2 · 0%'],
    ['x = 10 (a new game)', ctx(10), 'Buy G2 · 0%'],
    ['x = 50', ctx(50), 'Buy G2 · 69%'],
    ['x = 99.99', ctx(99.99), 'Buy G2 · 99%'],
    ['x = 100, b2 = 0', ctx(100), 'Buy G2 · 100%'],
    [
      'b2 = 0, b3 = 1, x = 1e5 (the nearest goal, not the latest)',
      ctx(1e5, [1, 0, 1]),
      'Buy G2 · 100%',
    ],
    ['x = 1e3, b2 = 1', ctx(1e3, [1, 1]), 'Buy G3 · 50%'],
    ['G1–G7 owned, x = 1e25', ctx('1e25', G1_TO_G7), 'Buy G8 · 42%'],
    ['all owned, x = 1e30', ctx('1e30', ALL), 'Reach 2^128 · 10%'],
    ['all owned, x = 2^127', ctx(pow2(127), ALL), 'Reach 2^128 · 96%'],
    ['done {product}, x = 1e100', ctx('1e100', ALL, ['goal.product']), 'Reach 2^1024 · 22%'],
    [
      'done {product, power}, x = 2^1024',
      ctx(CAP, ALL, ['goal.product', 'goal.power']),
      'Reach 2^65536 · 0%',
    ],
    ['every goal done', ctx(TOWER1, ALL, ['goal.product', 'goal.power', 'goal.tower']), null],
  ])('next goal over 13 states (nearest unlock, log-scale percentage): %s', (_name, c, want) => {
    expect(chip(c)).toBe(want);
  });

  it('the goals are in threshold order: G2…G8, then 2^128, 2^1024, 2^65536', () => {
    expect(GOALS.map((g) => g.id)).toEqual([
      'goal.g2',
      'goal.g3',
      'goal.g4',
      'goal.g5',
      'goal.g6',
      'goal.g7',
      'goal.g8',
      'goal.product',
      'goal.power',
      'goal.tower',
    ]);
    for (let i = 1; i < GOALS.length; i++) {
      expect(GOALS[i]!.threshold.gt(GOALS[i - 1]!.threshold)).toBe(true);
    }
  });

  it('goals are done monotonically, so the chip does not flip back after spending or a reset', () => {
    const all = map8(() => 1);
    let done = mergeDone(new Set(), { x: pow2(128), bought: all });
    expect([...done]).toEqual([
      'goal.g2',
      'goal.g3',
      'goal.g4',
      'goal.g5',
      'goal.g6',
      'goal.g7',
      'goal.g8',
      'goal.product',
    ]);
    // Max all spent x: nothing new, the same set.
    const same = mergeDone(done, { x: num(5), bought: all });
    expect(same).toBe(done);
    expect(chip({ c: { x: num(5), bought: all }, done })).toBe('Reach 2^1024 · 0%');
    // A reset (M5) sets every bought count back to 0: the tier goals stay done.
    expect(chip({ c: { x: num(10), bought: map8(() => 0) }, done })).toBe('Reach 2^1024 · 0%');
    done = mergeDone(done, { x: CAP, bought: all });
    expect(done.has('goal.power')).toBe(true);
    expect(mergeDone(new Set(), { x: num(Number.NaN), bought: map8(() => 0) }).size).toBe(0);
  });

  it('goals are classified by kind, not by their display template', () => {
    expect(GOALS.map((g) => g.kind)).toEqual([...Array(7).fill('buy'), ...Array(3).fill('reach')]);
    expect(GOALS.filter((g) => g.kind === 'reach').map((g) => g.params.n)).toEqual([
      128, 1024, 65536,
    ]);
    expect(GOAL_IDS.every(isGoalId)).toBe(true);
    expect(isGoalId('goal.g9')).toBe(false);
    expect(isGoalId(3)).toBe(false);
  });

  it('the percentage is an integer in 0–100 for any x, including 0, 1e-400 and (0, 1)', () => {
    const goal = pow2(128);
    const start = num(1e29);
    for (const x of [num(0), num('1e-400'), num(0.5), fromComponents(1, 1, -1e5)]) {
      expect(goalPercent(x, start, goal)).toBe(0);
    }
    fc.assert(
      fc.property(arbNum, (x) => {
        const p = goalPercent(x, start, goal);
        expect(Number.isInteger(p)).toBe(true);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(100);
        if (x.gte(goal)) expect(p).toBe(100);
      }),
      { seed: FC_SEED, numRuns: 2000 },
    );
  });
});
