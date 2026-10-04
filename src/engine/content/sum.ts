/**
 * Sum layer constants (GDD §5.1–5.3), frozen after M2 (§14.3; `tests/unit/frozen.test.ts`
 * snapshots every value), and the Sum layer's effect declarations (§21.3).
 *
 * This module holds ids and numbers only. Each effect's `label` is a `src/ui/strings.ts` key
 * (GDD §2); the Sum base factors are not Appendix C content, so they carry no `templateId`.
 * The default curve and the global multiplier are computed here in code, never read from data
 * (§5.2: Sum keeps full production when `oeis.json` fails to load).
 */
import { num, pow2 } from '../num.ts';
import type { Num } from '../num.ts';
import type { EffectDef } from '../effects.ts';
import type { GameState } from '../state.ts';
import { tierIndex } from '../tiers.ts';
import type { Tier } from '../tiers.ts';

/** λ_k = A000124(k−1) = 1, 2, 4, 7, 11, 16, 22, 29: the exponent of a tier's first cost. */
export const LAMBDA = Object.freeze([1, 2, 4, 7, 11, 16, 22, 29] as const);
/** The OEIS entry λ is cited from (central polygonal numbers); the Sum tab cites it. */
export const LAMBDA_ANUMBER = 'A000124';
/** ρ_k in tenths, (k+2): each purchase multiplies a tier's price by 10^(ρ_k). */
export const RHO_TENTHS = Object.freeze([3, 4, 5, 6, 7, 8, 9, 10] as const);
/** ρ_k = (k+2)/10 = 0.3 … 1.0. Costs are computed from `RHO_TENTHS` (exact tenths). */
export const RHO: readonly number[] = Object.freeze(RHO_TENTHS.map((t) => t / 10));
/** Base production β (§5.1). */
export const BETA = 2;
/** The global multiplier base g (§5.3). */
export const GLOBAL_BASE = 1.15;
/** The purchase made at global level L (0-based) costs 10^(offset + step·L) = 10^(2+L). */
export const GLOBAL_COST = Object.freeze({ offset: 2, step: 1 } as const);
/** Purchases per step: i_k = ⌊b_k / STEP_LENGTH⌋ (§5.2). */
export const STEP_LENGTH = 10;
/** x at the start of a new game (§5.1). */
export const X_START = 10;
/** The default curve, 2^min(i, 34): the 35 listed terms of A000079 (§5.2). */
export const DEFAULT_CURVE = Object.freeze({ base: 2, horizon: 34, anumber: 'A000079' } as const);
/** The fixed timestep of `tick` in milliseconds (§21.2). */
export const TICK_MS = 50;

/** The term of the default curve used at step i: min(i, 34), the data horizon (§5.2). */
export function curveIndex(i: number): number {
  return Math.min(Math.max(0, Math.floor(i)), DEFAULT_CURVE.horizon);
}

/** The default step multiplier at step i: 2^min(i, 34), computed in code (§5.2). */
export function defaultCurve(i: number): Num {
  return pow2(curveIndex(i));
}

/** The global multiplier at level L: g^L = 1.15^L (§5.3). */
export function globalMultiplier(level: number): Num {
  return num(GLOBAL_BASE).pow(level);
}

/** The step of a tier with b purchases: ⌊b / 10⌋. */
export function stepOf(bought: number): number {
  return Math.floor(bought / STEP_LENGTH);
}

const BETA_NUM: Num = Object.freeze(num(BETA));

/**
 * The Sum factors of m_k = β · g^L · slot_k (§5.1). All are event-constant: they change only
 * at purchases. Later layers append their effects after these.
 */
export const SUM_EFFECTS: readonly EffectDef[] = Object.freeze([
  Object.freeze({
    id: 'sum.beta',
    target: 'tierMult',
    tiers: 'all',
    kind: 'mul',
    class: 'event',
    label: 'factor.beta',
    value: () => BETA_NUM,
  }),
  Object.freeze({
    id: 'sum.global',
    target: 'tierMult',
    tiers: 'all',
    kind: 'mul',
    class: 'event',
    label: 'factor.global',
    value: (s: GameState) => globalMultiplier(s.sum.globalLevel),
  }),
  Object.freeze({
    id: 'sum.slot',
    target: 'tierMult',
    tiers: 'all',
    kind: 'mul',
    class: 'event',
    label: 'factor.slot',
    // `{a} a({i})`: the curve's A-number and the term used (M14: the equipped sequence's).
    labelParams: (s: GameState, t: Tier) => ({
      a: DEFAULT_CURVE.anumber,
      i: curveIndex(stepOf(s.sum.bought[tierIndex(t)])),
    }),
    value: (s: GameState, t: Tier) => defaultCurve(stepOf(s.sum.bought[tierIndex(t)])),
  }),
] satisfies EffectDef[]);
