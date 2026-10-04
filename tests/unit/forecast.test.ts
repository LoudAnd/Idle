// @vitest-environment node
// GDD §17.4, §5.5: time-to-afford solves x(t) = target on the exact polynomial of the chain,
// matching `integrate` at the time it returns.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { stepMultipliers } from '../../src/engine/effects.ts';
import { timeToReach, xSeries } from '../../src/engine/forecast.ts';
import { integrate } from '../../src/engine/integrate.ts';
import { CAP, log10Pos, num } from '../../src/engine/num.ts';
import { makeState } from '../../src/engine/state.ts';
import { FC_SEED, uniform } from './support/arbitraries.ts';

const series = (s: ReturnType<typeof makeState>) => xSeries(s.sum, stepMultipliers(s));

describe('time-to-afford (GDD §17.4)', () => {
  it('G1 only: x(t) = x + 2·A1·t, so 10 → 100 with A1 = 1 takes 45 s', () => {
    const s = makeState({ x: 10, amounts: [1], bought: [1] });
    const t = timeToReach(series(s), num(100));
    expect(t).not.toBeNull();
    expect(t!).toBeCloseTo(45, 9);
  });

  it('x already at the target → 0 ("now"); nothing produces → null; above the cap → null', () => {
    expect(timeToReach(series(makeState({ x: 100 })), num(100))).toBe(0);
    expect(timeToReach(series(makeState({ x: 10 })), num(100))).toBeNull();
    const s = makeState({ x: 10, amounts: ['1e300'], bought: [1] });
    expect(timeToReach(series(s), CAP.mul(2))).toBeNull();
    expect(timeToReach(series(s), CAP)).toBeCloseTo(CAP.div('2e300').toNumber(), 0);
  });

  it('a target beyond 1e300 s is never reached (null), and results are finite', () => {
    const s = makeState({ x: 0, amounts: ['1e-300'], bought: [1] });
    expect(timeToReach(series(s), CAP)).toBeNull();
  });

  it('the series is integrate()’s solution: x(t) at the returned t equals the target (random chains)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 60 }), { minLength: 8, maxLength: 8 }),
        fc.array(uniform(0, 6), { minLength: 8, maxLength: 8 }),
        uniform(0.5, 30),
        (bought, logAmounts, gap) => {
          const s = makeState({
            x: 10,
            bought,
            amounts: logAmounts.map((l, i) => (bought[i]! > 0 ? 10 ** l : 0)),
          });
          if (!bought.some((b) => b > 0)) return;
          const target = num(10).mul(num(10).pow(gap));
          const t = timeToReach(series(s), target);
          if (t === null) return;
          expect(Number.isFinite(t)).toBe(true);
          const x = integrate(s, t).sum.x;
          if (x.gte(CAP)) return; // clamped
          const lx = log10Pos(x)!;
          expect(Math.abs(lx - log10Pos(target)!)).toBeLessThan(1e-9 * Math.max(1, lx));
        },
      ),
      { seed: FC_SEED, numRuns: 200 },
    );
  });

  it('xSeries: c0 = x and c_j = A_j·m_1⋯m_j / j!', () => {
    const s = makeState({ x: 7, amounts: [3, 5], bought: [10, 1] });
    const m = stepMultipliers(s);
    const c = xSeries(s.sum, m);
    expect(c).toHaveLength(9);
    expect(c[0]!.toNumber()).toBe(7);
    expect(c[1]!.toNumber()).toBeCloseTo(3 * m[0].toNumber(), 12);
    expect(c[2]!.toNumber()).toBeCloseTo((5 * m[0].toNumber() * m[1].toNumber()) / 2, 12);
    expect(c[3]!.toNumber()).toBe(0);
  });
});
