/**
 * Time-to-afford (GDD §17.4, §5.5): how long until x reaches a target, if nothing is bought.
 *
 * Between events the chain is nilpotent, so x is a polynomial in the time t from now:
 *
 *   x(t) = Σ_{j=0..8} c_j · t^j,  c_0 = x,  c_j = A_j · Π_{i≤j} m_i / j!
 *
 * (the k = 0 row of `integrate.ts`'s exact solution). Every c_j is ≥ 0, so x(t) is increasing
 * and the first t with x(t) ≥ T is unique. It is found in log space: with l_j = log10 c_j,
 * log10 x(10^u) = LSE_j(l_j + j·u), a log-sum-exp of doubles that is increasing in u, and the
 * root of LSE(u) = log10 T is bisected on u = log10 t ∈ [−12, 300]. Nothing here commits time or
 * changes a state; the UI calls it on the previewed amounts (`previewSum`).
 */
import { CAP, log10Pos } from './num.ts';
import type { Num } from './num.ts';
import type { SumState, TierIndex, Tuple8 } from './state.ts';

/** The search range of u = log10 t, in seconds: 1e-12 s to 1e300 s. */
const U_MIN = -12;
const U_MAX = 300;
/** Bisection steps: 312 / 2^80 is far below a double's resolution of u. */
const STEPS = 80;

/**
 * The coefficients c_0…c_8 of x(t) for the Sum state `sum` with multipliers m_1…m_8: c_0 = x
 * and c_j = A_j · m_1 ⋯ m_j / j!.
 */
export function xSeries(sum: SumState, m: Tuple8<Num>): readonly Num[] {
  const out: Num[] = [sum.x];
  let prod: Num | null = null;
  let fact = 1;
  for (let j = 1; j <= 8; j++) {
    const i = (j - 1) as TierIndex;
    prod = prod === null ? m[i] : prod.mul(m[i]);
    fact *= j;
    out.push(sum.amounts[i].mul(prod).div(fact));
  }
  return out;
}

/** log10 Σ 10^(a_j), with the maximum taken out first so nothing overflows. */
function logSumExp(terms: readonly number[]): number {
  let max = Number.NEGATIVE_INFINITY;
  for (const t of terms) if (t > max) max = t;
  if (max === Number.NEGATIVE_INFINITY) return max;
  let s = 0;
  for (const t of terms) s += Math.pow(10, t - max);
  return max + Math.log10(s);
}

/**
 * Seconds until x(t) ≥ `target`, for the series of `xSeries`: 0 when x already reaches it, and
 * `null` when it never does (nothing produces x, the target is above `cap`, which x cannot pass
 * before the cap lift, or it is not reached within 1e300 s). The result is always a finite
 * number ≥ 0 or `null`, never NaN or Infinity, so a view holding it passes `checkValues`.
 */
export function timeToReach(series: readonly Num[], target: Num, cap: Num = CAP): number | null {
  const x = series[0];
  if (x === undefined) return null;
  if (x.gte(target)) return 0;
  if (target.gt(cap)) return null;
  const lt = log10Pos(target);
  if (lt === null) return 0; // a target ≤ 0 is reached by any x ≥ 0
  const logs: { readonly l: number; readonly j: number }[] = [];
  let producing = false;
  series.forEach((c, j) => {
    const l = log10Pos(c);
    if (l === null) return;
    logs.push({ l, j });
    if (j >= 1) producing = true;
  });
  if (!producing) return null;
  const f = (u: number): number => logSumExp(logs.map((t) => t.l + t.j * u));
  if (!(f(U_MAX) >= lt)) return null;
  if (f(U_MIN) >= lt) return Math.pow(10, U_MIN);
  let lo = U_MIN;
  let hi = U_MAX;
  for (let i = 0; i < STEPS; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) >= lt) hi = mid;
    else lo = mid;
  }
  const t = Math.pow(10, hi);
  return Number.isFinite(t) ? t : null;
}
