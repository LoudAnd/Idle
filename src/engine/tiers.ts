/**
 * Tier helpers (GDD §5.1): the generator tiers G1–G8, their `Tuple8` index and the count bound.
 * A leaf module with no imports, so content tables (`content/sum.ts`) can use the helpers as
 * values without an import cycle through `state.ts`. `state.ts` re-exports everything here.
 */

/** Generator tiers G1–G8. */
export type Tier = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
/** A tier's index into a `Tuple8` (tier − 1). */
export type TierIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
/** G1 … G8 in order. */
export const TIERS: readonly Tier[] = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8] as const);
/** One value per tier. Literal indices keep `T` (not `T | undefined`) under noUncheckedIndexedAccess. */
export type Tuple8<T> = readonly [T, T, T, T, T, T, T, T];

/**
 * Bought counts and levels stay at or below 2^53 (GDD §4.1, §20.1). The buy cap
 * (`systems/sum.ts`) and the invariant (`invariants.ts`) both read this one constant.
 */
export const MAX_COUNT = 2 ** 53;

/** tier − 1, typed as a literal index. */
export function tierIndex(t: Tier): TierIndex {
  return (t - 1) as TierIndex;
}

/** index + 1, the inverse of `tierIndex`. */
export function tierAt(i: TierIndex): Tier {
  return (i + 1) as Tier;
}

/** True for the integers 1–8. */
export function isTier(v: unknown): v is Tier {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 8;
}

/** Builds a `Tuple8` from a function of the index. */
export function map8<T>(f: (i: TierIndex) => T): Tuple8<T> {
  return [f(0), f(1), f(2), f(3), f(4), f(5), f(6), f(7)];
}

/** A copy of `t` with entry `i` replaced by `v`. */
export function set8<T>(t: Tuple8<T>, i: TierIndex, v: T): Tuple8<T> {
  return map8((j) => (j === i ? v : t[j]));
}
