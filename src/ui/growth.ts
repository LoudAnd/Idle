/**
 * The header's growth readout ×10^Y /min (GDD §17.1): Y is the change of log10 x over the
 * trailing 60 s of game time.
 *
 * - **Sampling:** at most one sample per whole second of game time, from the previewed x.
 *   Samples with x ≤ 0 are skipped (`log10Pos` returns `null`): x is exactly 0 right after the
 *   first purchase of G1.
 * - **Readout:** Y = lg(newest) − lg(oldest), where the oldest is the first stored sample within
 *   60 s of the newest. With fewer than 2 positive samples it is `null` (the header shows `—`).
 *   A window shorter than 60 s is not extrapolated: Y is the literal trailing change. Y can be
 *   negative after a purchase.
 */
import { log10Pos } from '../engine/num.ts';
import type { Num } from '../engine/num.ts';

export interface Sample {
  /** Game time in seconds. */
  readonly t: number;
  /** log10 x (x > 0). */
  readonly lg: number;
}

/** The readout's window, in seconds of game time. */
export const GROWTH_WINDOW_S = 60;

/**
 * The samples after seeing x at game time t: a new sample when t is in a later whole second
 * than the newest stored one and x > 0; samples older than the window are dropped. Returns
 * `samples` itself when nothing changes. A time before the newest sample (a new game) restarts
 * the series.
 */
export function addSample(samples: readonly Sample[], t: number, x: Num): readonly Sample[] {
  if (!Number.isFinite(t)) return samples;
  const last = samples[samples.length - 1];
  if (last !== undefined && t < last.t) return addSample([], t, x);
  if (last !== undefined && Math.floor(t) <= Math.floor(last.t)) return samples;
  const lg = log10Pos(x);
  if (lg === null || !Number.isFinite(lg)) return samples;
  const from = t - GROWTH_WINDOW_S;
  const kept = samples.filter((s) => s.t >= from);
  kept.push({ t, lg });
  return kept;
}

/** Y = Δlog10 x over the trailing 60 s, or `null` with fewer than 2 positive samples. */
export function growthPerMinute(samples: readonly Sample[]): number | null {
  const last = samples[samples.length - 1];
  if (last === undefined) return null;
  const first = samples.find((s) => s.t >= last.t - GROWTH_WINDOW_S);
  if (first === undefined || first === last) return null;
  const y = last.lg - first.lg;
  return Number.isFinite(y) ? y : null;
}
