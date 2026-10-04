// @vitest-environment node
// GDD §17.4: reveal at half price, the one rule. Every reveal rule is tested at exactly half its
// threshold and one ulp below, including the layer thresholds 2^127, 2^1023 and 2^65535.
import { describe, expect, it } from 'vitest';
import { CAP, TOWER1, ZERO, encodeNum, fromComponents, num, pow2 } from '../../src/engine/num.ts';
import type { Num } from '../../src/engine/num.ts';
import { map8 } from '../../src/engine/state.ts';
import type { Tuple8 } from '../../src/engine/state.ts';
import { globalCost, tierCost } from '../../src/engine/systems/sum.ts';
import { LAYER_UNLOCKS } from '../../src/engine/content/layers.ts';
import { GOALS } from '../../src/ui/goals.ts';
import {
  REVEAL_IDS,
  REVEAL_RULES,
  halfReached,
  isRevealId,
  mergeReveals,
  revealedNow,
} from '../../src/ui/reveal.ts';
import type { RevealContext, RevealId, RevealRule } from '../../src/ui/reveal.ts';

const NO_BUYS: Tuple8<number> = map8(() => 0);

function ctx(
  x: Num | string | number,
  bought: readonly number[] = [],
  globalLevel = 0,
): RevealContext {
  return { x: num(x), bought: map8((i) => bought[i] ?? 0), globalLevel };
}

/** The next double below v (v > 0). */
function nextDown(v: number): number {
  const buf = new DataView(new ArrayBuffer(8));
  buf.setFloat64(0, v);
  buf.setBigUint64(0, buf.getBigUint64(0) - 1n);
  return buf.getFloat64(0);
}

/** One ulp below a positive Num: of the double on layer 0, of the mag on layer 1. */
function justBelow(v: Num): Num {
  if (v.layer === 0) return num(nextDown(v.mag));
  return fromComponents(1, v.layer, nextDown(v.mag));
}

/** The rule's own id, or the ids that come with it (Max all comes with G2 and global). */
function revealsOnItsOwn(r: RevealRule, x: Num): boolean {
  return revealedNow({ x, bought: NO_BUYS, globalLevel: 0 }).includes(r.id);
}

/** The expected threshold of every rule (GDD §5.2, §5.3, §7, §8.1, §10.1). */
const EXPECTED: Readonly<Record<RevealId, Num>> = {
  'tier.2': num(100),
  'tier.3': num(1e4),
  'tier.4': num(1e7),
  'tier.5': num(1e11),
  'tier.6': num(1e16),
  'tier.7': num(1e22),
  'tier.8': num(1e29),
  global: num(100),
  maxAll: num(100),
  'tab.product': pow2(128),
  'tab.power': CAP,
  'tab.tower': TOWER1,
};

describe('reveal at half price (GDD §17.4)', () => {
  it('the table covers every RevealId, each once, in threshold order', () => {
    expect([...REVEAL_IDS].sort()).toEqual(Object.keys(EXPECTED).sort());
    expect(new Set(REVEAL_IDS).size).toBe(REVEAL_IDS.length);
    for (let i = 1; i < REVEAL_RULES.length; i++) {
      expect(
        REVEAL_RULES[i]!.threshold.gte(REVEAL_RULES[i - 1]!.threshold),
        REVEAL_RULES[i]!.id,
      ).toBe(true);
    }
  });

  it.each(REVEAL_RULES.map((r) => [r.id, r] as const))(
    '%s: its threshold, half = threshold/2, reveals at exactly half and not one ulp below',
    (id, r) => {
      expect(encodeNum(r.threshold)).toEqual(encodeNum(EXPECTED[id]));
      // half is threshold / 2: exact on layer 0; on layer 1 within an ulp of the mag (the
      // halves are built exactly, as 2^(n−1), not by dividing).
      if (r.half.layer === 0) expect(r.half.mul(2).eq(r.threshold)).toBe(true);
      else
        expect(Math.abs(r.half.mag + Math.log10(2) - r.threshold.mag)).toBeLessThan(
          1e-15 * r.threshold.mag,
        );
      expect(halfReached(r.half, r.half)).toBe(true);
      expect(revealsOnItsOwn(r, r.half)).toBe(true);
      const below = justBelow(r.half);
      expect(below.lt(r.half)).toBe(true);
      expect(revealsOnItsOwn(r, below)).toBe(false);
    },
  );

  it('tier thresholds are the first costs 10^λ_k and the global level costs 100', () => {
    for (const k of [2, 3, 4, 5, 6, 7, 8] as const) {
      const r = REVEAL_RULES.find((x) => x.id === `tier.${k}`)!;
      expect(encodeNum(r.threshold)).toEqual(encodeNum(tierCost(k, 0)));
    }
    expect(encodeNum(REVEAL_RULES.find((x) => x.id === 'global')!.threshold)).toEqual(
      encodeNum(globalCost(0)),
    );
    // So the G2 silhouette appears at x = 50 (§17.3).
    expect(revealedNow(ctx(50))).toEqual(['tier.2', 'global', 'maxAll']);
    expect(revealedNow(ctx(49.999))).toEqual([]);
  });

  it('the layer thresholds 2^127, 2^1023 and 2^65535 (exact, correctly rounded)', () => {
    const product = REVEAL_RULES.find((r) => r.id === 'tab.product')!;
    const power = REVEAL_RULES.find((r) => r.id === 'tab.power')!;
    const tower = REVEAL_RULES.find((r) => r.id === 'tab.tower')!;
    expect(encodeNum(product.half)).toEqual(encodeNum(pow2(127)));
    expect(encodeNum(power.half)).toEqual(encodeNum(pow2(1023)));
    expect(encodeNum(tower.half)).toEqual(encodeNum(pow2(65535)));
    // All three are on layer 1: one ulp below is the next-down mag.
    for (const r of [product, power, tower]) expect(r.half.layer).toBe(1);
    expect(revealedNow(ctx(pow2(127)))).toContain('tab.product');
    expect(revealedNow(ctx(justBelow(pow2(127))))).not.toContain('tab.product');
    expect(revealedNow(ctx(pow2(1023)))).toContain('tab.power');
    expect(revealedNow(ctx(justBelow(pow2(1023))))).not.toContain('tab.power');
    expect(revealedNow(ctx(pow2(65535)))).toContain('tab.tower');
    expect(revealedNow(ctx(justBelow(pow2(65535))))).not.toContain('tab.tower');
    // Everything is revealed at 2^65535.
    expect(revealedNow(ctx(pow2(65535)))).toEqual(REVEAL_IDS);
  });

  it('the layer tabs and the x goals read one table (LAYER_UNLOCKS): 2^128, 2^1024, 2^65536', () => {
    expect(LAYER_UNLOCKS.map((l) => [l.id, l.log2])).toEqual([
      ['product', 128],
      ['power', 1024],
      ['tower', 65536],
    ]);
    for (const l of LAYER_UNLOCKS) {
      expect(encodeNum(l.threshold)).toEqual(encodeNum(pow2(l.log2)));
      expect(encodeNum(l.half)).toEqual(encodeNum(pow2(l.log2 - 1)));
      const r = REVEAL_RULES.find((x) => x.id === `tab.${l.id}`)!;
      expect(r.threshold).toBe(l.threshold);
      expect(r.half).toBe(l.half);
      const g = GOALS.find((x) => x.id === `goal.${l.id}`)!;
      expect(g.threshold).toBe(l.threshold);
      expect(g.params.n).toBe(l.log2);
    }
    expect(LAYER_UNLOCKS[1]!.threshold).toBe(CAP);
    expect(LAYER_UNLOCKS[2]!.threshold).toBe(TOWER1);
    expect(REVEAL_IDS.every(isRevealId)).toBe(true);
    expect(isRevealId('tab.x')).toBe(false);
  });

  it('owned items count as revealed', () => {
    // G3 owned at x = 0: G2 and G3 show (a higher tier owned implies its cost was paid).
    expect(revealedNow(ctx(0, [1, 0, 1]))).toEqual(['tier.2', 'maxAll', 'tier.3']);
    expect(revealedNow(ctx(0, [0, 0, 0, 0, 0, 0, 0, 2]))).toEqual([
      'tier.2',
      'maxAll',
      'tier.3',
      'tier.4',
      'tier.5',
      'tier.6',
      'tier.7',
      'tier.8',
    ]);
    expect(revealedNow(ctx(0, [], 1))).toEqual(['global', 'maxAll']);
    // G1 alone reveals nothing (it is always shown).
    expect(revealedNow(ctx(0, [5]))).toEqual([]);
  });

  it('reveals are monotone: spending x below half keeps them', () => {
    let seen: ReadonlySet<RevealId> = new Set();
    seen = mergeReveals(seen, ctx(60));
    expect([...seen]).toEqual(['tier.2', 'global', 'maxAll']);
    const kept = mergeReveals(seen, ctx(0, [1]));
    expect(kept).toBe(seen); // nothing new: the same set object
    const more = mergeReveals(seen, ctx(1e4));
    expect([...more]).toContain('tier.3');
    expect(more).not.toBe(seen);
    expect([...seen]).not.toContain('tier.3'); // the input is never changed
  });

  it('Max all comes with a remembered G2 or global reveal', () => {
    expect([...mergeReveals(new Set<RevealId>(['tier.2']), ctx(0))]).toContain('maxAll');
    expect([...mergeReveals(new Set<RevealId>(['global']), ctx(0))]).toContain('maxAll');
  });

  it('invalid values reveal nothing', () => {
    expect(halfReached(num(Number.NaN), num(50))).toBe(false);
    expect(halfReached(num(Number.POSITIVE_INFINITY), num(50))).toBe(false);
    expect(halfReached(num(-100), num(50))).toBe(false);
    expect(revealedNow(ctx(ZERO))).toEqual([]);
  });
});
