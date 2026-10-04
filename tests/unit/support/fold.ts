// The breakdown's check (GDD §17.4): the shown factors folded in log space, independently of
// the engine's `foldFactors`, so a unit test can compare it with log10 m_k.
import type { Factor } from '../../../src/engine/effects.ts';
import { ONE, ZERO, log10Pos } from '../../../src/engine/num.ts';
import type { Num } from '../../../src/engine/num.ts';

/**
 * log10 m for factors folded as m = ((1 + Σ add) · Π mul) ^ (Π pow) (GDD §21.3), computed from
 * the factors alone: Π pow · (log10(1 + Σ add) + Σ log10 mul). `null` when a factor makes m ≤ 0
 * or invalid.
 */
export function foldLog10(factors: readonly Factor[]): number | null {
  let sumAdd: Num | null = null;
  let logMul = 0;
  let pw = 1;
  for (const f of factors) {
    if (f.kind === 'mul') {
      const l = log10Pos(f.value);
      if (l === null) return null;
      logMul += l;
    } else if (f.kind === 'add') {
      sumAdd = (sumAdd ?? ZERO).add(f.value);
    } else {
      pw *= f.value.toNumber();
    }
  }
  let l = logMul;
  if (sumAdd !== null) {
    const la = log10Pos(ONE.add(sumAdd));
    if (la === null) return null;
    l += la;
  }
  const out = pw * l;
  return Number.isFinite(out) ? out : null;
}
