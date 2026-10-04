/**
 * Offline progress constants (GDD §20.2), frozen after M4 (§14.3; `tests/unit/frozen.test.ts`).
 *
 * The macro-step schedule for credited time Δ: N = min(2000, ⌈Δ / 0.05 s⌉) steps; equal steps of
 * Δ/N when N · 0.05 s ≥ Δ, otherwise step i is min(0.05 s · 1.01^i, h_max) with h_max found by
 * 100 bisection iterations so the steps sum to Δ (`src/engine/offline.ts`,
 * `docs/prototypes/macro_steps.py`).
 *
 * Credited time is capped at 24 h. The longer caps are bought later: 72 h with the Power
 * upgrade `power.offline72` (M13) and 7 days with the Tower upgrade `tower.u1b` (M21).
 */

/** The fine step and the first macro-step, in seconds. */
export const OFFLINE_FINE_STEP_S = 0.05;
/** The most macro-steps one catch-up takes. */
export const OFFLINE_MAX_STEPS = 2000;
/** Each ramp step is this many times the previous one (0.05 s · 1.01^i). */
export const OFFLINE_STEP_GROWTH = 1.01;
/** Bisection iterations for the largest step h_max. */
export const OFFLINE_BISECT_ITERATIONS = 100;
/** The offline cap in M4: 24 h of credited time. */
export const OFFLINE_CAP_S = 86_400;
/** Every cap by the upgrade that grants it (the longer two from M13 and M21). */
export const OFFLINE_CAPS_S = Object.freeze({
  base: 86_400,
  power72: 259_200,
  tower7d: 604_800,
} as const satisfies Record<string, number>);
