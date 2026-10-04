// @vitest-environment node
// GDD §14.3: frozen constants never change after their milestone. One block per milestone;
// later milestones append theirs.
import { describe, expect, it } from 'vitest';
import {
  BETA,
  DEFAULT_CURVE,
  GLOBAL_BASE,
  GLOBAL_COST,
  LAMBDA,
  LAMBDA_ANUMBER,
  RHO,
  RHO_TENTHS,
  STEP_LENGTH,
  SUM_EFFECTS,
  TICK_MS,
  X_START,
  defaultCurve,
} from '../../src/engine/content/sum.ts';
import { GLOBAL_PRICE, globalCost } from '../../src/engine/systems/sum.ts';
import { encodeNum, num } from '../../src/engine/num.ts';

describe('frozen after M2 (GDD §14.3)', () => {
  it('snapshots every M2 constant', () => {
    expect(LAMBDA).toEqual([1, 2, 4, 7, 11, 16, 22, 29]);
    expect(LAMBDA_ANUMBER).toBe('A000124');
    expect(RHO_TENTHS).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
    expect(RHO).toEqual([0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]);
    expect(BETA).toBe(2);
    expect(GLOBAL_BASE).toBe(1.15);
    expect(GLOBAL_COST).toEqual({ offset: 2, step: 1 });
    expect(STEP_LENGTH).toBe(10);
    expect(X_START).toBe(10);
    expect(DEFAULT_CURVE).toEqual({ base: 2, horizon: 34, anumber: 'A000079' });
    expect(TICK_MS).toBe(50);
  });

  it('the formulas behind them: λ = A000124(k−1), ρ = (k+2)/10, 10^(2+L), 2^min(i, 34)', () => {
    LAMBDA.forEach((l, i) => expect(l).toBe((i * (i + 1)) / 2 + 1));
    RHO.forEach((r, i) => expect(r).toBe((i + 1 + 2) / 10));
    expect(GLOBAL_PRICE).toEqual({ e0: 2, tenths: 10 });
    for (const level of [0, 1, 5, 100]) {
      expect(encodeNum(globalCost(level))).toEqual(encodeNum(num(`1e${2 + level}`)));
    }
    expect(defaultCurve(34).toNumber()).toBe(2 ** 34);
    expect(defaultCurve(35).toNumber()).toBe(2 ** 34);
  });

  it('freezes the shared tables', () => {
    for (const t of [LAMBDA, RHO_TENTHS, RHO, GLOBAL_COST, DEFAULT_CURVE, SUM_EFFECTS]) {
      expect(Object.isFrozen(t)).toBe(true);
    }
    for (const e of SUM_EFFECTS) expect(Object.isFrozen(e)).toBe(true);
  });
});
