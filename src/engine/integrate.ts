/**
 * The exact integrator (GDD §5.5), shared by online ticks, offline catch-up and the bot.
 *
 * Between events the chain dx/dt = A_1·m_1, dA_k/dt = A_(k+1)·m_(k+1) is a nilpotent linear ODE
 * with the exact solution, for a step Δ (with a_0 = x and a_j = A_j):
 *
 *   a_k(Δ) = Σ_{j≥k} a_j · (Π_{i=k+1..j} m_i) · Δ^(j−k)/(j−k)!
 *
 * The multipliers come from `stepMultipliers`: event-constant effects from the cached table,
 * state-dependent effects evaluated once at the start of the step and held for it. That is at
 * most 36 (k, j) pairs of 4 `Num` operations each. Before the cap lift, x is clamped to 2^1024
 * after every step.
 *
 * Lazy online integration: ticks only add to `pendingMs`; `flush` integrates the pending time at
 * an event (forced) or once it reaches 1 s. A periodic flush that would leave x unchanged while
 * the exact increment is positive (sub-resolution growth, §4.1) is deferred, keeping the pending
 * time, until x changes or 60 s have accumulated. Event flushes always commit.
 */
import { CAP, ONE, ZERO } from './num.ts';
import type { Num } from './num.ts';
import { effectTable, stepMultipliers } from './effects.ts';
import type { EffectTable } from './effects.ts';
import { map8 } from './state.ts';
import type { GameState, SumState, Tuple8 } from './state.ts';

/** A periodic flush happens once this much time is pending (§5.5). */
export const LAZY_FLUSH_MS = 1000;
/** Sub-resolution growth is deferred for at most this long (§5.5). */
export const DEFER_LIMIT_MS = 60_000;

interface Solved {
  /** x after the step, before the clamp. */
  readonly x: Num;
  /** The exact increment of x over the step (the k = 0 sum without x itself). */
  readonly inc: Num;
  readonly amounts: Tuple8<Num>;
  readonly table: EffectTable;
}

/** The exact solution over `seconds` (> 0), without committing anything. */
function solve(s: GameState, seconds: number): Solved {
  const table = effectTable(s);
  const m = stepMultipliers(s, table);
  const { x, amounts } = s.sum;
  // a[0] = x, a[j] = A_j; mm[j] = m_j (mm[0] unused).
  const a: readonly Num[] = [x, ...amounts];
  const mm: readonly Num[] = [ONE, ...m];
  // c[n] = Δ^n / n!
  const c: number[] = [1];
  for (let n = 1; n <= 8; n++) c.push(((c[n - 1] ?? 0) * seconds) / n);
  // The highest non-zero level: terms above it are 0.
  let top = 0;
  for (let j = 8; j >= 1; j--) {
    if ((a[j] as Num).sign !== 0) {
      top = j;
      break;
    }
  }
  const out: Num[] = [];
  let inc: Num = ZERO;
  for (let k = 0; k <= 8; k++) {
    let acc: Num | null = null;
    let p: Num = ONE;
    for (let j = k + 1; j <= top; j++) {
      p = p.mul(mm[j] as Num);
      const aj = a[j] as Num;
      if (aj.sign === 0) continue;
      const term = aj.mul(p).mul(c[j - k] as number);
      acc = acc === null ? term : acc.add(term);
    }
    if (k === 0) {
      if (acc !== null) inc = acc;
      out.push(acc === null ? x : x.add(acc));
    } else {
      const ak = a[k] as Num;
      out.push(acc === null ? ak : ak.add(acc));
    }
  }
  return {
    x: out[0] as Num,
    inc,
    amounts: map8((i) => out[i + 1] as Num),
    table,
  };
}

/** min(x, 2^1024): the pre-lift clamp (§5.5, §8.1). NaN stays NaN for the invariant to report. */
function clampX(x: Num): Num {
  return x.gt(CAP) ? CAP : x;
}

function commit(s: GameState, r: Solved, seconds: number, pendingMs: number): GameState {
  return {
    sum: { ...s.sum, x: clampX(r.x), amounts: r.amounts },
    time: s.time + seconds,
    pendingMs,
    table: r.table,
  };
}

/**
 * Advances the chain exactly by `seconds` and commits it: time += seconds, x clamped to 2^1024.
 * Pending time is left as it is. A non-positive (or NaN) step returns the state unchanged.
 */
export function integrate(s: GameState, seconds: number): GameState {
  if (!(seconds > 0)) return s;
  return commit(s, solve(s, seconds), seconds, s.pendingMs);
}

export interface FlushOptions {
  /** An event flush (action, reset, unlock): always commits. */
  readonly force: boolean;
}

/**
 * Integrates the pending time. A non-forced flush defers sub-resolution growth: when the step
 * would leave x unchanged while its exact increment is positive, x is below the cap and less
 * than 60 s are pending, the state is returned as it is and the time keeps accumulating.
 */
export function flush(s: GameState, opts: FlushOptions): GameState {
  if (!(s.pendingMs > 0)) return s;
  const seconds = s.pendingMs / 1000;
  const r = solve(s, seconds);
  if (
    !opts.force &&
    r.inc.sign > 0 &&
    r.x.eq(s.sum.x) &&
    s.pendingMs < DEFER_LIMIT_MS &&
    s.sum.x.lt(CAP)
  ) {
    return r.table === s.table ? s : { ...s, table: r.table };
  }
  return commit(s, r, seconds, 0);
}

/**
 * The Sum state at committed time + pending time, for display. Nothing is committed: x between
 * flushes is computed from the pending time (§5.5).
 */
export function previewSum(s: GameState): SumState {
  if (!(s.pendingMs > 0)) return s.sum;
  const r = solve(s, s.pendingMs / 1000);
  return { ...s.sum, x: clampX(r.x), amounts: r.amounts };
}
