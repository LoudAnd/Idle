/**
 * Sum layer costs and buying (GDD §5.2–5.4).
 *
 * Prices are exponents in exact tenths: the n-th purchase (n from 0) costs
 * 10^((10·e0 + tenths·n) / 10), so every integer exponent is exact (`cost(G3, 10)` = 1e9, not
 * 10^(4 + 0.5·10) evaluated in floating point). A tier's model is {e0: λ_k, tenths: k + 2}; the
 * global level's is {e0: 2, tenths: 10}, so the purchase at level L costs 10^(2+L).
 *
 * Buy-max uses the closed-form geometric sum (binary search on n around the log estimate). Near
 * a boundary, where the closed form's rounding could disagree with repeated single buys (the
 * total of n purchases within `BOUNDARY_REL` below x, or that of n + 1 within it above x), the
 * purchases are replayed one at a time with their exact costs instead, so buy-max never buys
 * more than single buys would (it never overspends). Otherwise the last purchase is checked
 * with its exact cost: if the x left after n − 1 purchases cannot pay purchase n, n is reduced
 * by 1. Every purchase goes through `subClamp`, so x is never negative. A buy that purchases
 * nothing returns the same state object (the effect table stays valid).
 */
import { ONE, ZERO, isValidNum, log10Pos, pow10, subClamp } from '../num.ts';
import type { Num } from '../num.ts';
import {
  GLOBAL_COST,
  LAMBDA,
  RHO_TENTHS,
  STEP_LENGTH,
  globalMultiplier,
  stepOf,
} from '../content/sum.ts';
import { withSum } from '../state.ts';
import type { GameState } from '../state.ts';
import { MAX_COUNT, map8, set8, tierIndex } from '../tiers.ts';
import type { Tier, Tuple8 } from '../tiers.ts';

export { MAX_COUNT, globalMultiplier, stepOf };

/**
 * The relative width of buy-max's boundary zone (GDD §5.4): when the closed-form total of the n
 * purchases found is within this of x from below, or that of n + 1 from above, the plan replays
 * single buys. It is the 1e-12 of §22 item 2, well above the closed form's rounding (a few
 * 1e-14 at layer 1) and the single buys' accumulated rounding.
 */
export const BOUNDARY_REL = 1e-12;
/** The longest single-buy replay. Below the cap n ≤ 1,024, so every boundary case replays. */
const REPLAY_MAX = 4096;

/** A geometric price: purchase n (from 0) costs 10^((10·e0 + tenths·n) / 10). */
export interface PriceModel {
  readonly e0: number;
  readonly tenths: number;
}

const TIER_PRICES: Tuple8<PriceModel> = Object.freeze(
  map8((i) => Object.freeze({ e0: LAMBDA[i], tenths: RHO_TENTHS[i] })),
);

/** The price model of a tier: {e0: λ_k, tenths: k + 2}. */
export function tierPrice(t: Tier): PriceModel {
  return TIER_PRICES[tierIndex(t)];
}

/** The global level's price model: the purchase at level L costs 10^(2+L). */
export const GLOBAL_PRICE: PriceModel = Object.freeze({
  e0: GLOBAL_COST.offset,
  tenths: GLOBAL_COST.step * 10,
});

/** log10 of purchase n's cost, from integer tenths (exact whenever the result is an integer). */
export function costExponent(p: PriceModel, n: number): number {
  return (10 * p.e0 + p.tenths * n) / 10;
}

/** The cost of purchase n (from 0). */
export function costAt(p: PriceModel, n: number): Num {
  return pow10(costExponent(p, n));
}

/** The cost of a tier's purchase n: 10^(λ_k + ρ_k·n). */
export function tierCost(t: Tier, n: number): Num {
  return costAt(tierPrice(t), n);
}

/** The cost of the purchase made at global level L: 10^(2+L). */
export function globalCost(level: number): Num {
  return costAt(GLOBAL_PRICE, level);
}

/** 10^ρ − 1, the denominator of the geometric sum. */
function ratioMinusOne(p: PriceModel): number {
  return Math.pow(10, p.tenths / 10) - 1;
}

/**
 * The cost of n purchases starting at count b, in closed form:
 * cost(b) · (10^(ρn) − 1) / (10^ρ − 1). One purchase is exactly cost(b); none costs 0.
 */
export function totalCost(p: PriceModel, b: number, n: number): Num {
  if (!(n > 0)) return ZERO;
  if (n === 1) return costAt(p, b);
  const growth = pow10((p.tenths * n) / 10).sub(ONE);
  return costAt(p, b).mul(growth).div(ratioMinusOne(p));
}

/** Purchases until the next multiple of 10 of b: 1 to 10 (GDD §5.4, Until 10). */
export function untilTenCount(b: number): number {
  return STEP_LENGTH - (b % STEP_LENGTH);
}

interface BuyPlan {
  /** Purchases made. */
  readonly n: number;
  /** x after the purchases (x itself when n is 0). */
  readonly rest: Num;
}

/** Repeated single buys from count b, at most `cap`: the reference buy-max must not exceed. */
function replayBuys(p: PriceModel, b: number, x: Num, cap: number): BuyPlan {
  let rest = x;
  let n = 0;
  while (n < cap) {
    const c = costAt(p, b + n);
    if (rest.lt(c)) break;
    rest = subClamp(rest, c);
    n++;
  }
  return { n, rest };
}

/**
 * The most purchases from count b that x pays for, at most `limit`, and the x left after them.
 * The closed form finds n; near a boundary single buys are replayed, otherwise the last
 * purchase is checked with its exact cost.
 */
function planBuy(p: PriceModel, b: number, x: Num, limit: number): BuyPlan {
  const cap = Math.floor(Math.min(limit, MAX_COUNT - b));
  if (!(cap >= 1) || !isValidNum(x)) return { n: 0, rest: x };
  const first = costAt(p, b);
  if (x.lt(first)) return { n: 0, rest: x };
  if (cap === 1) return { n: 1, rest: subClamp(x, first) }; // Buy 1: one exact purchase
  const lx = log10Pos(x);
  if (lx === null) return { n: 0, rest: x };
  // total(b, n) ≤ x  ⟺  n ≤ log10(1 + x·(10^ρ − 1)/cost(b)) / ρ.
  const q = lx + Math.log10(ratioMinusOne(p)) - costExponent(p, b);
  const est = (q > 15 ? q : Math.log10(1 + Math.pow(10, q))) / (p.tenths / 10);
  const guess = Number.isFinite(est) ? Math.floor(est) : cap;
  let hi = Math.max(1, Math.min(cap, guess + 2));
  let lo = Math.max(1, Math.min(hi, guess - 1));
  if (lo > 1 && totalCost(p, b, lo).gt(x)) lo = 1;
  // The largest n in [lo, hi] with total(b, n) ≤ x; lo is affordable.
  while (lo < hi) {
    const mid = lo + Math.ceil((hi - lo) / 2);
    if (totalCost(p, b, mid).lte(x)) lo = mid;
    else hi = mid - 1;
  }
  let n = lo;
  // The boundary zone: replay single buys, so rounding can never buy one more than they would.
  const low = totalCost(p, b, n).gte(x.mul(1 - BOUNDARY_REL));
  const high = !low && n < cap && totalCost(p, b, n + 1).lte(x.mul(1 + BOUNDARY_REL));
  if (low || high) {
    if (n + 1 <= REPLAY_MAX) return replayBuys(p, b, x, Math.min(cap, n + 1));
    if (low) n--; // too long to replay: keep the smaller n
  }
  if (n <= 1) return { n: 1, rest: subClamp(x, first) };
  // Exact last-purchase check: x after n − 1 purchases must pay purchase n.
  const before = subClamp(x, totalCost(p, b, n - 1));
  const last = costAt(p, b + n - 1);
  if (before.lt(last)) {
    n--;
    if (n === 1) return { n: 1, rest: subClamp(x, first) };
    const prev = subClamp(x, totalCost(p, b, n - 1));
    return { n, rest: subClamp(prev, costAt(p, b + n - 1)) };
  }
  return { n, rest: subClamp(before, last) };
}

/**
 * The most purchases from count b that x pays for, at most `limit` (where hold caps plug in,
 * M7). 0 when x is invalid or cannot pay the first purchase.
 */
export function maxAffordable(p: PriceModel, b: number, x: Num, limit = Infinity): number {
  return planBuy(p, b, x, limit).n;
}

export type TierBuyMode = 'one' | 'until10' | 'max';
export type GlobalBuyMode = 'one' | 'max';

function modeLimit(mode: TierBuyMode, b: number, limit: number): number {
  if (mode === 'one') return Math.min(1, limit);
  if (mode === 'until10') return Math.min(untilTenCount(b), limit);
  return limit;
}

/**
 * Buys tier t: Buy 1, Until 10 (up to the next multiple of 10, or as many of those as are
 * affordable) or Max. `limit` caps the purchases (hold caps, M7).
 */
export function buyTier(s: GameState, t: Tier, mode: TierBuyMode, limit = Infinity): GameState {
  const i = tierIndex(t);
  const b = s.sum.bought[i];
  const plan = planBuy(tierPrice(t), b, s.sum.x, modeLimit(mode, b, limit));
  if (plan.n === 0) return s;
  return withSum(s, {
    ...s.sum,
    x: plan.rest,
    bought: set8(s.sum.bought, i, b + plan.n),
    amounts: set8(s.sum.amounts, i, s.sum.amounts[i].add(plan.n)),
  });
}

/** Buys global levels: one, or as many as are affordable. */
export function buyGlobal(s: GameState, mode: GlobalBuyMode, limit = Infinity): GameState {
  const level = s.sum.globalLevel;
  const plan = planBuy(GLOBAL_PRICE, level, s.sum.x, mode === 'one' ? Math.min(1, limit) : limit);
  if (plan.n === 0) return s;
  return withSum(s, { ...s.sum, x: plan.rest, globalLevel: level + plan.n });
}

/** Max all (GDD §5.4): buy max of G8, then G7, down to G1, then max global levels. */
export function maxAll(s: GameState): GameState {
  let out = s;
  for (let k = 8; k >= 1; k--) out = buyTier(out, k as Tier, 'max');
  return buyGlobal(out, 'max');
}
