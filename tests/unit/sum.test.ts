// @vitest-environment node
// GDD §5.1–5.4: Sum layer costs, the global level, the default step multiplier and every buy
// mode, including buy-max against repeated single buys (fast-check).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CAP, encodeNum, isValidNum, num, pow10, subClamp } from '../../src/engine/num.ts';
import type { Num } from '../../src/engine/num.ts';
import {
  BETA,
  DEFAULT_CURVE,
  LAMBDA,
  RHO_TENTHS,
  SUM_EFFECTS,
  defaultCurve,
} from '../../src/engine/content/sum.ts';
import { breakdown, stepMultipliers } from '../../src/engine/effects.ts';
import { applyAction } from '../../src/engine/actions.ts';
import type { Action } from '../../src/engine/actions.ts';
import { integrate } from '../../src/engine/integrate.ts';
import { checkInvariants } from '../../src/engine/invariants.ts';
import { TIERS, makeState, newGame, serializeState, tierIndex } from '../../src/engine/state.ts';
import type { GameState, Tier } from '../../src/engine/state.ts';
import {
  GLOBAL_PRICE,
  buyGlobal,
  buyTier,
  costAt,
  globalCost,
  globalMultiplier,
  maxAffordable,
  maxAll,
  stepOf,
  tierCost,
  tierPrice,
  totalCost,
  untilTenCount,
} from '../../src/engine/systems/sum.ts';
import type { PriceModel } from '../../src/engine/systems/sum.ts';
import { STRINGS, isStringKey } from '../../src/ui/strings.ts';
import type { StringKey } from '../../src/ui/strings.ts';
import { fill } from '../../src/ui/tpl.ts';
import { REPO_ROOT, importSpecifiers } from '../arch/lib/scan.ts';
import { FC_SEED, uniform } from './support/arbitraries.ts';

const PROPERTY = { timeout: 60_000 };

/** A state with tier t at count b and x, everything else 0. */
function at(t: Tier, b: number, x: Num | number | string): GameState {
  const bought = [0, 0, 0, 0, 0, 0, 0, 0];
  bought[tierIndex(t)] = b;
  return makeState({ x, bought });
}

/** Repeated single purchases: how many x pays for, and what is left. */
function iterated(p: PriceModel, b: number, x0: Num): { n: number; x: Num } {
  let x = x0;
  let n = 0;
  for (;;) {
    const c = costAt(p, b + n);
    if (x.lt(c)) return { n, x };
    x = subClamp(x, c);
    n++;
  }
}

function relErr(a: Num, b: Num): number {
  if (b.sign === 0) return a.sign === 0 ? 0 : Infinity;
  return Math.abs(a.div(b).toNumber() - 1);
}

describe('costs (GDD §5.2)', () => {
  it('cost(G1, 0) = 10, cost(G3, 10) = 1e9 exactly, cost(G8, 0) = 1e29', () => {
    expect(encodeNum(tierCost(1, 0))).toEqual([1, 0, 10]);
    expect(encodeNum(tierCost(3, 10))).toEqual([1, 0, 1e9]);
    expect(encodeNum(tierCost(8, 0))).toEqual(encodeNum(num('1e29')));
    expect(encodeNum(tierCost(8, 0))).toEqual([1, 1, 29]);
  });

  it('the first purchase of Gk costs 10^λ_k, λ = A000124(k−1) = 1, 2, 4, 7, 11, 16, 22, 29', () => {
    for (const t of TIERS) {
      const lambda = ((t - 1) * t) / 2 + 1; // A000124(n) = n(n+1)/2 + 1 at n = k − 1
      expect(LAMBDA[tierIndex(t)]).toBe(lambda);
      expect(encodeNum(tierCost(t, 0))).toEqual(encodeNum(num(`1e${lambda}`)));
    }
  });

  it('every integer cost exponent gives the exact power of ten (n = 0…400, all tiers)', () => {
    for (const t of TIERS) {
      const k = tierIndex(t);
      for (let n = 0; n <= 400; n++) {
        const tenths = 10 * LAMBDA[k] + RHO_TENTHS[k] * n;
        if (tenths % 10 !== 0) continue;
        expect(encodeNum(tierCost(t, n)), `G${t} n=${n}`).toEqual(
          encodeNum(num(`1e${tenths / 10}`)),
        );
      }
    }
  });

  it('each purchase multiplies the price by 10^ρ_k, ρ_k = (k+2)/10', () => {
    for (const t of TIERS) {
      const rho = (t + 2) / 10;
      for (const n of [0, 1, 7, 50, 333]) {
        const ratio = tierCost(t, n + 1)
          .div(tierCost(t, n))
          .toNumber();
        expect(ratio).toBeCloseTo(10 ** rho, 9);
      }
    }
  });

  it('prices are monotone in n (strictly, all tiers, n = 0…2000) and so is the total cost', () => {
    for (const t of TIERS) {
      for (let n = 0; n < 2000; n++) expect(tierCost(t, n + 1).gt(tierCost(t, n))).toBe(true);
      const p = tierPrice(t);
      for (let n = 0; n < 300; n++)
        expect(totalCost(p, 5, n + 1).gt(totalCost(p, 5, n))).toBe(true);
    }
  });

  it('the closed-form total equals the sum of single costs', () => {
    for (const t of TIERS) {
      const p = tierPrice(t);
      for (const [b, n] of [
        [0, 1],
        [0, 10],
        [13, 7],
        [200, 40],
      ] as const) {
        let sum: Num = num(0);
        for (let i = 0; i < n; i++) sum = sum.add(costAt(p, b + i));
        expect(relErr(totalCost(p, b, n), sum)).toBeLessThan(1e-12);
      }
      expect(encodeNum(totalCost(p, 3, 0))).toEqual([0, 0, 0]);
      expect(encodeNum(totalCost(p, 3, 1))).toEqual(encodeNum(costAt(p, 3)));
    }
  });
});

describe('global level (GDD §5.3)', () => {
  it('global level L costs 10^(2+L) and gives ×1.15^L', () => {
    for (let level = 0; level <= 400; level++) {
      expect(encodeNum(globalCost(level))).toEqual(encodeNum(num(`1e${2 + level}`)));
      const m = globalMultiplier(level);
      const expected = Math.pow(1.15, level);
      if (Number.isFinite(expected))
        expect(Math.abs(m.toNumber() / expected - 1)).toBeLessThan(1e-12);
    }
    expect(globalMultiplier(0).toNumber()).toBe(1);
    expect(globalMultiplier(12).toNumber()).toBeCloseTo(5.35, 2); // the ×5.35 of §17.4
    expect(GLOBAL_PRICE).toEqual({ e0: 2, tenths: 10 });
  });

  it('the first level costs 100: Buy 1 at x = 100 leaves x = 0 and L = 1', () => {
    const s = buyGlobal(makeState({ x: 100 }), 'one');
    expect(s.sum.globalLevel).toBe(1);
    expect(encodeNum(s.sum.x)).toEqual([0, 0, 0]);
    expect(buyGlobal(makeState({ x: 99.99 }), 'one').sum.globalLevel).toBe(0);
  });

  it('global buy-max buys every affordable level (x = 111,100 → levels 0–2, then 1e5 is too much)', () => {
    // 100 + 1,000 + 10,000 = 11,100 for three levels; the fourth costs 100,000.
    const s = buyGlobal(makeState({ x: 111_099 }), 'max');
    expect(s.sum.globalLevel).toBe(3);
    expect(s.sum.x.toNumber()).toBe(99_999);
    expect(buyGlobal(makeState({ x: 111_100 }), 'max').sum.globalLevel).toBe(4);
  });

  it('global buy-max equals repeated single buys (100 random states)', PROPERTY, () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 280 }), uniform(2, 307), (level, lx) => {
        const x = pow10(lx);
        const s = makeState({ x, globalLevel: level });
        const out = buyGlobal(s, 'max');
        const ref = iterated(GLOBAL_PRICE, level, x);
        const n = out.sum.globalLevel - level;
        expect(n).toBeLessThanOrEqual(ref.n); // never more than single buys: never overspends
        expect(Math.abs(n - ref.n)).toBeLessThanOrEqual(1);
        if (n !== ref.n) {
          expect(relErr(totalCost(GLOBAL_PRICE, level, Math.max(n, ref.n)), x)).toBeLessThan(1e-12);
        }
        expect(isValidNum(out.sum.x)).toBe(true);
      }),
      { seed: FC_SEED, numRuns: 100 },
    );
  });
});

describe('default step multiplier (GDD §5.2)', () => {
  it('the default step multiplier is 2^min(⌊b/10⌋, 34), computed in code', () => {
    for (let b = 0; b <= 1000; b++) {
      const expected = 2 ** Math.min(Math.floor(b / 10), 34);
      expect(stepOf(b)).toBe(Math.floor(b / 10));
      expect(defaultCurve(stepOf(b)).toNumber()).toBe(expected);
      const s = at(4, b, 0);
      const slot = SUM_EFFECTS.find((e) => e.id === 'sum.slot')!;
      expect(slot.value(s, 4).toNumber()).toBe(expected);
    }
  });

  it('m_k = β · g^L · slot_k for every tier', () => {
    const s = makeState({ bought: [0, 9, 10, 55, 120, 339, 340, 1000], globalLevel: 17 });
    const m = stepMultipliers(s);
    for (const t of TIERS) {
      const b = s.sum.bought[tierIndex(t)];
      const expected = num(BETA)
        .mul(globalMultiplier(17))
        .mul(defaultCurve(stepOf(b)));
      expect(encodeNum(m[tierIndex(t)]), `G${t}`).toEqual(encodeNum(expected));
    }
  });

  it('Sum code imports no data module (the default curve never depends on oeis.json)', () => {
    for (const file of [
      'src/engine/content/sum.ts',
      'src/engine/systems/sum.ts',
      'src/engine/effects.ts',
      'src/engine/integrate.ts',
      'src/engine/state.ts',
    ]) {
      const specs = importSpecifiers(readFileSync(join(REPO_ROOT, file), 'utf8')).map(
        (r) => r.specifier,
      );
      expect(specs.length, file).toBeGreaterThan(0);
      for (const spec of specs) {
        expect(spec, `${file} imports ${spec}`).toMatch(/^\.\.?\/[\w/.]*\.ts$/);
        expect(spec, `${file} imports ${spec}`).not.toMatch(/data\/|oeis|\.json/);
      }
    }
  });
});

describe('effects of the Sum layer (GDD §2, §21.3)', () => {
  it('every Sum effect is event-constant, has a strings.ts label and no Appendix C template', () => {
    expect(SUM_EFFECTS.map((e) => e.id)).toEqual(['sum.beta', 'sum.global', 'sum.slot']);
    for (const e of SUM_EFFECTS) {
      expect(isStringKey(e.label), e.label).toBe(true);
      expect(STRINGS).toHaveProperty([e.label]);
      expect(e.class).toBe('event');
      expect(e.kind).toBe('mul');
      expect(e.templateId).toBeUndefined();
    }
  });

  it('every factor label is filled from its own params, so a breakdown row needs nothing else', () => {
    const s = makeState({ bought: [55, 0, 9, 10, 120, 339, 340, 999], globalLevel: 12 });
    for (const t of TIERS) {
      for (const f of breakdown(s, t)) {
        const text = fill(STRINGS[f.label as StringKey], f.params);
        expect(text, `${f.id} on G${t}`).not.toMatch(/\{\w+\}/);
      }
      // The slot row names the curve's A-number and the term whose value it shows.
      const slot = breakdown(s, t).find((f) => f.id === 'sum.slot')!;
      expect(slot.params.a).toBe(DEFAULT_CURVE.anumber);
      expect(slot.value.toNumber()).toBe(2 ** Number(slot.params.i));
    }
    const g1 = breakdown(s, 1).find((f) => f.id === 'sum.slot')!;
    expect(fill(STRINGS['factor.slot'], g1.params)).toBe('A000079 a(5)');
    const g8 = breakdown(s, 8).find((f) => f.id === 'sum.slot')!;
    expect(g8.params).toEqual({ a: 'A000079', i: 34 }); // step 99, at the data horizon
  });
});

describe('Buy 1 (GDD §5.4)', () => {
  it('in a new game, Buy 1 on G1 leaves x = 0, b1 = 1 and A1 = 1, and marks the table dirty', () => {
    const s = buyTier(newGame(), 1, 'one');
    expect(encodeNum(s.sum.x)).toEqual([0, 0, 0]);
    expect(s.sum.bought[0]).toBe(1);
    expect(s.sum.amounts[0].toNumber()).toBe(1);
    expect(s.table).toBeNull();
  });

  it('an unaffordable Buy 1 returns the same state object', () => {
    const s = newGame();
    expect(buyTier(s, 2, 'one')).toBe(s);
    expect(buyGlobal(s, 'one')).toBe(s);
  });

  it('Buy 1 buys exactly one even when more are affordable', () => {
    const s = buyTier(at(2, 0, 1e9), 2, 'one');
    expect(s.sum.bought[1]).toBe(1);
    expect(s.sum.x.toNumber()).toBe(1e9 - 100);
  });
});

describe('Until 10 (GDD §5.4)', () => {
  const ample = '1e300';
  it.each([
    [0, 10],
    [7, 3],
    [10, 10],
    [19, 1],
    [123, 7],
  ])('from b = %i it buys %i with ample x (to the next multiple of 10)', (b, n) => {
    expect(untilTenCount(b)).toBe(n);
    const s = buyTier(at(3, b, ample), 3, 'until10');
    expect(s.sum.bought[2]).toBe(b + n);
    expect(s.sum.bought[2] % 10).toBe(0);
    expect(s.sum.amounts[2].toNumber()).toBe(n); // A_k grows by every purchase
  });

  it('buys as many of the set as are affordable when not all are', () => {
    const p = tierPrice(1);
    // Enough for 4 purchases from b = 0, not for 5.
    const x = totalCost(p, 0, 4).add(costAt(p, 4).mul(0.5));
    const s = buyTier(at(1, 0, x), 1, 'until10');
    expect(s.sum.bought[0]).toBe(4);
    expect(s.sum.amounts[0].toNumber()).toBe(4);
    expect(isValidNum(s.sum.x)).toBe(true);
  });

  it('is a no-op (the same state) when not even one is affordable', () => {
    const s = at(5, 3, 1e10);
    expect(buyTier(s, 5, 'until10')).toBe(s);
  });

  it('never crosses the multiple of 10 (b = 8, ample x → 10)', () => {
    expect(buyTier(at(6, 8, ample), 6, 'until10').sum.bought[5]).toBe(10);
  });
});

describe('Max and Max all (GDD §5.4)', () => {
  it('Max respects a hold-cap limit', () => {
    const p = tierPrice(2);
    expect(maxAffordable(p, 0, num('1e100'), 5)).toBe(5);
    expect(maxAffordable(p, 0, num('1e100'), 0)).toBe(0);
    const capped = buyTier(at(2, 0, '1e100'), 2, 'max', 7);
    expect(capped.sum.bought[1]).toBe(7);
    expect(capped.sum.amounts[1].toNumber()).toBe(7);
  });

  it('Max buys nothing for an invalid x', () => {
    const p = tierPrice(1);
    expect(maxAffordable(p, 0, num(Number.NaN))).toBe(0);
    expect(maxAffordable(p, 0, num(Number.POSITIVE_INFINITY))).toBe(0);
    expect(maxAffordable(p, 0, num(-5))).toBe(0);
  });

  it('Max all buys max of G8, then G7, down to G1, then global levels', () => {
    const s = makeState({ x: '1e60', bought: [3, 1, 4, 1, 5, 9, 2, 6], globalLevel: 4 });
    let expected = s;
    for (let k = 8; k >= 1; k--) expected = buyTier(expected, k as Tier, 'max');
    expected = buyGlobal(expected, 'max');
    const all = maxAll(s);
    expect(serializeState(all)).toBe(serializeState(expected));
    // Each tier gains exactly as many generators as it bought (amounts start at 0 here).
    for (const t of TIERS) {
      const i = tierIndex(t);
      const n = all.sum.bought[i] - s.sum.bought[i];
      expect(n, `G${t}`).toBeGreaterThan(0);
      expect(all.sum.amounts[i].toNumber(), `G${t}`).toBe(n);
    }
    // G8 goes first: with x exactly cost(G8, 0) nothing else is bought.
    const only8 = maxAll(makeState({ x: tierCost(8, 0) }));
    expect(only8.sum.bought).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(encodeNum(only8.sum.x)).toEqual([0, 0, 0]);
  });

  it('Max all with nothing affordable returns the same state', () => {
    const s = makeState({ x: 9 });
    expect(maxAll(s)).toBe(s);
  });
});

/** x for the buy-max property: log-uniform, or planted within 2e-13 of a total-cost boundary. */
const arbBuyCase = fc
  .tuple(
    fc.constantFrom(...TIERS),
    fc.integer({ min: 0, max: 400 }),
    fc.boolean(),
    uniform(0, 308),
    fc.integer({ min: 1, max: 300 }),
    uniform(-2e-13, 2e-13),
  )
  .map(([tier, b, planted, lx, n, eps]) => {
    const p = tierPrice(tier);
    const x = planted ? totalCost(p, b, n).mul(1 + eps) : pow10(lx);
    return { tier, b, x, planted };
  })
  .filter(({ x }) => isValidNum(x) && x.lt(CAP));

describe('buy-max (GDD §5.4, §22 item 2)', () => {
  it('buy-max equals repeated single buys for 200 random states', PROPERTY, () => {
    let planted = 0;
    let differ = 0;
    fc.assert(
      fc.property(arbBuyCase, ({ tier, b, x, planted: near }) => {
        if (near) planted++;
        const p = tierPrice(tier);
        const out = buyTier(at(tier, b, x), tier, 'max');
        const n = out.sum.bought[tierIndex(tier)] - b;
        const ref = iterated(p, b, x);
        expect(isValidNum(out.sum.x)).toBe(true);
        expect(out.sum.x.sign).toBeGreaterThanOrEqual(0);
        // Never overspends (§5.4): never more purchases than single buys pay for.
        expect(n).toBeLessThanOrEqual(ref.n);
        expect(Math.abs(n - ref.n)).toBeLessThanOrEqual(1);
        expect(out.sum.amounts[tierIndex(tier)].toNumber()).toBe(n);
        if (n !== ref.n) {
          // Only when the total cost is within 1e-12 relative of x.
          differ++;
          expect(relErr(totalCost(p, b, Math.max(n, ref.n)), x)).toBeLessThan(1e-12);
        } else {
          expect(Math.abs(out.sum.x.sub(ref.x).toNumber())).toBeLessThanOrEqual(
            1e-12 * x.toNumber(),
          );
        }
      }),
      { seed: FC_SEED, numRuns: 200 },
    );
    // About half the cases sit on a boundary; only those may differ.
    expect(planted).toBeGreaterThan(50);
    expect(differ).toBeLessThanOrEqual(planted);
  });

  it('at a boundary it never buys more than single buys (500 planted states)', PROPERTY, () => {
    // Within ±2e-12 of a total cost, where the closed form's rounding alone could add one.
    const arbEdge = fc
      .tuple(
        fc.constantFrom(...TIERS),
        fc.integer({ min: 0, max: 400 }),
        fc.integer({ min: 1, max: 300 }),
        uniform(-2e-12, 2e-12),
      )
      .map(([tier, b, n, eps]) => ({ tier, b, x: totalCost(tierPrice(tier), b, n).mul(1 + eps) }))
      .filter(({ x }) => isValidNum(x) && x.lt(CAP));
    fc.assert(
      fc.property(arbEdge, ({ tier, b, x }) => {
        const out = buyTier(at(tier, b, x), tier, 'max');
        const ref = iterated(tierPrice(tier), b, x);
        expect(out.sum.bought[tierIndex(tier)] - b).toBeLessThanOrEqual(ref.n);
      }),
      { seed: FC_SEED, numRuns: 500 },
    );
  });

  it('a found overspend: G4 from b = 206 at x = 3.354498310601749e174 buys 73, as single buys do', () => {
    // The closed form once bought 74 here, 2.6e-14 relative more than x pays for.
    const x = num('3.354498310601749e174');
    const ref = iterated(tierPrice(4), 206, x);
    expect(ref.n).toBe(73);
    const out = buyTier(at(4, 206, x), 4, 'max');
    expect(out.sum.bought[3]).toBe(206 + 73);
    expect(relErr(out.sum.x, ref.x)).toBeLessThan(1e-12);
    expect(out.sum.x.gt(0)).toBe(true);
  });

  it('x is never negative under random action sequences and integration steps', PROPERTY, () => {
    const arbAction: fc.Arbitrary<Action> = fc.oneof(
      fc.record({
        type: fc.constant('buy' as const),
        tier: fc.constantFrom(...TIERS),
        mode: fc.constantFrom('one' as const, 'until10' as const, 'max' as const),
      }),
      fc.record({
        type: fc.constant('buyGlobal' as const),
        mode: fc.constantFrom('one' as const, 'max' as const),
      }),
      fc.constant({ type: 'maxAll' as const }),
    );
    fc.assert(
      fc.property(
        fc.array(fc.tuple(arbAction, uniform(0, 30)), { minLength: 1, maxLength: 60 }),
        uniform(1, 40),
        (steps, lx) => {
          let s = makeState({ x: pow10(lx) });
          for (const [a, dt] of steps) {
            const bought = applyAction(s, a);
            // A purchase adds to A_k exactly what it adds to b_k.
            for (const t of TIERS) {
              const i = tierIndex(t);
              const db = bought.sum.bought[i] - s.sum.bought[i];
              const before = s.sum.amounts[i];
              if (before.lt(2 ** 20)) {
                const da = bought.sum.amounts[i].sub(before).toNumber();
                expect(Math.abs(da - db), `G${t}`).toBeLessThanOrEqual(1e-6 * Math.max(1, db));
              }
            }
            s = integrate(bought, dt);
            expect(isValidNum(s.sum.x)).toBe(true);
            expect(s.sum.x.sign).toBeGreaterThanOrEqual(0);
            expect(checkInvariants(s)).toEqual([]);
          }
        },
      ),
      { seed: FC_SEED, numRuns: 200 },
    );
  });
});
