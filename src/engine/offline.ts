/**
 * Offline progress (GDD §20.2): `advance(state, seconds, schedule?)` catches up any span of
 * time, with the exact integrator (§5.5) over at most 2,000 macro-steps.
 *
 * **Schedule** (`macroSteps`, exact; `docs/prototypes/macro_steps.py`). For credited time Δ:
 * N = max(1, min(2000, ⌈Δ / 0.05 − 1e-9⌉)). If N · 0.05 ≥ Δ (every Δ ≤ 100 s, so any credit of
 * at most 1 s is "fine 50 ms ticks": steps of at most 50 ms), the N steps are equal, Δ/N.
 * Otherwise step i is min(r_i, h_max) with r_0 = 0.05 and r_i = r_(i−1) · 1.01 (iterated
 * multiplication, the same on every engine), and h_max is bisected on [0.05, Δ] for 100
 * iterations so the steps sum to Δ. In both branches the last step is the residual
 * Δ − (h_0 + … + h_(N−2)), summed left to right, so the left-fold sum of the steps is exactly Δ
 * (Sterbenz: that difference is exact).
 *
 * **Steps.** Each piece is `step(state, actions, h)` from `tick.ts` (flush, apply, integrate
 * exactly), the bot's 1 s reference step, so offline and online semantics are identical.
 * State-dependent effects use the values at the start of each step (§5.5). A scheduled time t
 * inside a step splits it: the part up to t, then t's actions, then the rest. Actions at the
 * start of a step apply before it; actions at t = Δ apply after the last step; entries at a
 * negative, non-finite or later time are ignored. The schedule is sorted by time, stably. (M5
 * adds the offline autobuyers at every boundary.)
 *
 * **Jobs.** `startAdvance` plans the pieces and `continueAdvance` runs up to k of them, so the
 * platform's runner can work in time slices (≤ 8 ms, §20.2) and show progress; `advance` runs
 * a job to the end. Slicing never changes the result.
 *
 * **Credit** (`creditedSeconds`): max(0, now − maxSeenAt), capped, never now − savedAt, so
 * setting the clock back earns nothing (§20.2).
 */
import type { Action } from './actions.ts';
import {
  OFFLINE_BISECT_ITERATIONS,
  OFFLINE_CAP_S,
  OFFLINE_FINE_STEP_S,
  OFFLINE_MAX_STEPS,
  OFFLINE_STEP_GROWTH,
} from './content/offline.ts';
import type { GameState } from './state.ts';
import { step } from './tick.ts';

/** The tolerance of the step count (the prototype's): Δ = 0.15 s is 3 steps, not 4. */
const COUNT_EPS = 1e-9;
/** The equal branch also takes Δ a hair above N · 0.05 s. */
const EQUAL_EPS = 1e-12;

/** True for a positive, finite span of seconds. */
function isSpan(seconds: number): boolean {
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0;
}

/**
 * The macro-step lengths for credited time `seconds` (empty for 0, a negative, NaN or infinite
 * span): at most 2,000 steps whose left-fold sum is exactly `seconds`.
 */
export function macroSteps(seconds: number): readonly number[] {
  if (!isSpan(seconds)) return Object.freeze([]);
  const n = Math.max(
    1,
    Math.min(OFFLINE_MAX_STEPS, Math.ceil(seconds / OFFLINE_FINE_STEP_S - COUNT_EPS)),
  );
  const steps = new Array<number>(n);
  if (n * OFFLINE_FINE_STEP_S >= seconds - EQUAL_EPS) {
    steps.fill(seconds / n);
  } else {
    const ramp = new Array<number>(n);
    let r = OFFLINE_FINE_STEP_S;
    for (let i = 0; i < n; i++) {
      ramp[i] = r;
      r *= OFFLINE_STEP_GROWTH;
    }
    const total = (h: number): number => {
      let sum = 0;
      for (let i = 0; i < n; i++) sum += Math.min(ramp[i] as number, h);
      return sum;
    };
    let lo = OFFLINE_FINE_STEP_S;
    let hi = seconds;
    for (let k = 0; k < OFFLINE_BISECT_ITERATIONS; k++) {
      const mid = (lo + hi) / 2;
      if (total(mid) < seconds) lo = mid;
      else hi = mid;
    }
    const hMax = (lo + hi) / 2;
    for (let i = 0; i < n; i++) steps[i] = Math.min(ramp[i] as number, hMax);
  }
  // The last step takes the residual, so the left-fold sum is exactly `seconds`.
  let acc = 0;
  for (let i = 0; i < n - 1; i++) acc += steps[i] as number;
  steps[n - 1] = seconds - acc;
  return Object.freeze(steps);
}

/**
 * Seconds of offline credit: max(0, now − maxSeenAt) / 1000, capped at `capS`. Invalid input
 * gives 0. 30 h away with the 24 h cap gives exactly 86,400.
 */
export function creditedSeconds(nowMs: number, maxSeenAtMs: number, capS: number): number {
  if (!Number.isFinite(nowMs) || !Number.isFinite(maxSeenAtMs)) return 0;
  if (!(capS >= 0) || !Number.isFinite(capS)) return 0;
  return Math.min(capS, Math.max(0, nowMs - maxSeenAtMs) / 1000);
}

/** The offline cap of a state: 24 h in M4 (72 h from M13's `power.offline72`, 7 days M21). */
export function offlineCap(_s: GameState): number {
  return OFFLINE_CAP_S;
}

/** Actions to apply `at` seconds after the start of the span (tests' scripted events). */
export interface ScheduledActions {
  readonly at: number;
  readonly actions: readonly Action[];
}

/** One `step`: apply `actions`, then integrate `seconds` (0 for actions at the very end). */
export interface AdvancePiece {
  readonly seconds: number;
  readonly actions: readonly Action[];
}

export interface AdvanceJob {
  /** The state after the pieces run so far. */
  readonly state: GameState;
  readonly done: boolean;
  /** Pieces run so far. */
  readonly index: number;
  /** Pieces in all. */
  readonly total: number;
  readonly pieces: readonly AdvancePiece[];
}

const NO_ACTIONS: readonly Action[] = Object.freeze([]);

/** The pieces of a span: its macro-steps, split at the scheduled times. */
function plan(seconds: number, schedule: readonly ScheduledActions[]): AdvancePiece[] {
  const steps = macroSteps(seconds);
  const events = schedule
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => typeof e.at === 'number' && Number.isFinite(e.at))
    .filter(({ e }) => e.at >= 0 && e.at <= seconds)
    .sort((a, b) => a.e.at - b.e.at || a.i - b.i)
    .map(({ e }) => e);
  const pieces: AdvancePiece[] = [];
  let next = 0;
  let pending: Action[] = [];
  const due = (t: number): void => {
    while (next < events.length && (events[next] as ScheduledActions).at <= t) {
      pending.push(...(events[next] as ScheduledActions).actions);
      next++;
    }
  };
  const piece = (h: number): void => {
    pieces.push({ seconds: h, actions: pending.length > 0 ? pending : NO_ACTIONS });
    pending = [];
  };
  let elapsed = 0;
  for (const h of steps) {
    const end = elapsed + h;
    due(elapsed);
    let start = elapsed;
    while (next < events.length && (events[next] as ScheduledActions).at < end) {
      const t = (events[next] as ScheduledActions).at;
      piece(t - start);
      due(t);
      start = t;
    }
    piece(end - start);
    elapsed = end;
  }
  due(Number.POSITIVE_INFINITY);
  if (pending.length > 0) piece(0);
  return pieces;
}

/**
 * Plans the catch-up of `seconds` from `s`. A non-positive, NaN or infinite span gives a job
 * that is already done with `s` unchanged.
 */
export function startAdvance(
  s: GameState,
  seconds: number,
  schedule: readonly ScheduledActions[] = [],
): AdvanceJob {
  const pieces = isSpan(seconds) ? plan(seconds, schedule) : [];
  return { state: s, done: pieces.length === 0, index: 0, total: pieces.length, pieces };
}

/**
 * Runs up to `maxSteps` more pieces (at least 1; all that remain for a non-finite count).
 * Returns a new job; the input is never changed.
 */
export function continueAdvance(job: AdvanceJob, maxSteps: number): AdvanceJob {
  if (job.done) return job;
  const k = Number.isFinite(maxSteps) ? Math.max(1, Math.floor(maxSteps)) : job.total;
  const stop = Math.min(job.total, job.index + k);
  let s = job.state;
  for (let i = job.index; i < stop; i++) {
    const p = job.pieces[i] as AdvancePiece;
    s = step(s, p.actions, p.seconds);
  }
  return { ...job, state: s, index: stop, done: stop >= job.total };
}

/**
 * Advances `s` by `seconds` through the macro-step schedule, applying `schedule`'s actions at
 * their times. A non-positive, NaN or infinite span returns `s` itself.
 */
export function advance(
  s: GameState,
  seconds: number,
  schedule: readonly ScheduledActions[] = [],
): GameState {
  const job = startAdvance(s, seconds, schedule);
  return job.done ? job.state : continueAdvance(job, Number.POSITIVE_INFINITY).state;
}
