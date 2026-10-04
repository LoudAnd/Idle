// GDD §17.4, §21.3: the breakdown's factors fold to the displayed m_k within 1e-9 in log space.
// The view's factors come from the same effect table production uses.
import fc from 'fast-check';
import { afterEach, describe, expect, it } from 'vitest';
import { installTestEffect } from '../../src/engine/effects.ts';
import type { EffectDef } from '../../src/engine/effects.ts';
import { log10Pos, num } from '../../src/engine/num.ts';
import { TIERS, makeState, tierIndex } from '../../src/engine/state.ts';
import { factorLabel } from '../../src/ui/Breakdown.tsx';
import { buildSumView } from '../../src/ui/sum/view.ts';
import { FC_SEED, uniform } from './support/arbitraries.ts';
import { foldLog10 } from './support/fold.ts';

let cleanups: (() => void)[] = [];
afterEach(() => {
  for (const c of cleanups) c();
  cleanups = [];
});

const arbState = fc
  .record({
    bought: fc.array(fc.integer({ min: 0, max: 400 }), { minLength: 8, maxLength: 8 }),
    globalLevel: fc.integer({ min: 0, max: 300 }),
    logAmounts: fc.array(uniform(0, 40), { minLength: 8, maxLength: 8 }),
  })
  .map(({ bought, globalLevel, logAmounts }) =>
    makeState({ x: 10, bought, globalLevel, amounts: logAmounts.map((l) => num(10).pow(l)) }),
  );

/** |folded − log10 m| ≤ 1e-9 (absolute, in log space: ROADMAP M3, GDD §17.4), for every tier. */
function expectFolds(s: ReturnType<typeof makeState>): void {
  const view = buildSumView(s);
  for (const t of TIERS) {
    const row = view.tiers[tierIndex(t)];
    const lm = log10Pos(row.mult)!;
    const folded = foldLog10(row.factors);
    expect(folded).not.toBeNull();
    expect(Math.abs(folded! - lm), `G${t}`).toBeLessThanOrEqual(1e-9);
    // Every row has a filled label (no placeholder left).
    for (const f of row.factors) expect(factorLabel(f)).not.toMatch(/\{\w+\}|—/);
  }
}

function effect(id: string, kind: EffectDef['kind'], value: number): EffectDef {
  return {
    id,
    target: 'tierMult',
    tiers: 'all',
    kind,
    class: 'event',
    label: 'factor.beta',
    labelParams: () => ({ b: value }),
    value: () => num(value),
  };
}

describe('breakdown (GDD §17.4, §21.3)', () => {
  it('breakdown factors fold to the displayed m_k within 1e-9 in log space (50 random states)', () => {
    fc.assert(
      fc.property(arbState, (s) => expectFolds(s)),
      { seed: FC_SEED, numRuns: 50 },
    );
  });

  it('… also with add and pow factors, so the whole fold ((1 + Σadd)·Πmul)^(Πpow) is covered', () => {
    cleanups.push(installTestEffect(effect('test.add1', 'add', 0.5)));
    cleanups.push(installTestEffect(effect('test.add2', 'add', 2.25)));
    cleanups.push(installTestEffect(effect('test.pow', 'pow', 1.05)));
    fc.assert(
      fc.property(arbState, (s) => expectFolds(s)),
      { seed: FC_SEED, numRuns: 50 },
    );
    const g1 = buildSumView(makeState({ bought: [10] })).tiers[0];
    expect(g1.factors.map((f) => f.kind)).toEqual(['mul', 'mul', 'mul', 'add', 'add', 'pow']);
    // ((1 + 2.75) · 2 · 1 · 2)^1.05
    expect(foldLog10(g1.factors)).toBeCloseTo(1.05 * Math.log10(3.75 * 4), 12);
  });

  it('the rows of G1 at b = 55, L = 12 are β 2, global 1.15^12, A000079 a(5)', () => {
    const view = buildSumView(makeState({ bought: [55], globalLevel: 12 }));
    expect(view.tiers[0].factors.map(factorLabel)).toEqual([
      'β 2',
      'global 1.15^12',
      'A000079 a(5)',
    ]);
  });

  it('a non-positive multiplier folds to null', () => {
    const f = {
      id: 'x',
      label: 'factor.beta',
      params: { b: 0 },
      kind: 'mul' as const,
      value: num(0),
    };
    expect(foldLog10([f])).toBeNull();
  });
});
