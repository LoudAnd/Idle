/**
 * The offline runner (GDD §20.2): runs an `advance()` job in time slices of at most 8 ms, one
 * per animation frame, so the page stays responsive behind the progress modal. Each slice runs
 * pieces while less than `sliceMs` has passed and fewer than `maxStepsPerSlice` have run (the
 * second bound ends a slice on a clock that does not move inside a frame, such as a test's
 * fake clock). Every piece goes through `safeTick` (§21.8): an exception or a failed invariant
 * reports a fault and ends the run with `null`, as does `cancel()` or a fault reported
 * elsewhere.
 */
import { checkInvariants } from '../engine/invariants.ts';
import { continueAdvance } from '../engine/offline.ts';
import type { AdvanceJob } from '../engine/offline.ts';
import type { GameState } from '../engine/state.ts';
import type { Clock } from './clock.ts';
import { safeTick } from './errors.ts';
import type { ErrorHub } from './errors.ts';

/** A slice ends once this much time has passed (§20.2). */
export const SLICE_MS = 8;
/** … or after this many pieces. */
export const MAX_STEPS_PER_SLICE = 64;

export interface RunnerOptions {
  readonly clock: Clock;
  readonly hub: ErrorHub;
  readonly sliceMs?: number;
  readonly maxStepsPerSlice?: number;
  /** After every slice: pieces done and in all. */
  readonly onProgress?: (done: number, total: number) => void;
}

export interface OfflineRun {
  /** The state after the whole job, or `null` after a fault or `cancel()`. */
  readonly done: Promise<GameState | null>;
  cancel(): void;
}

export function runOffline(job: AdvanceJob, o: RunnerOptions): OfflineRun {
  const sliceMs = o.sliceMs ?? SLICE_MS;
  const maxSteps = o.maxStepsPerSlice ?? MAX_STEPS_PER_SLICE;
  let current = job;
  let frameId: number | null = null;
  let finished = false;
  let resolve: (s: GameState | null) => void = () => {};
  const done = new Promise<GameState | null>((r) => {
    resolve = r;
  });
  const finish = (s: GameState | null): void => {
    if (finished) return;
    finished = true;
    if (frameId !== null) o.clock.cancelFrame(frameId);
    frameId = null;
    resolve(s);
  };
  const slice = (): void => {
    frameId = null;
    if (finished) return;
    if (o.hub.fault !== null) return finish(null);
    const start = o.clock.now();
    let steps = 0;
    while (!current.done && steps < maxSteps && (steps === 0 || o.clock.now() - start < sliceMs)) {
      const from = current;
      const next = safeTick(
        o.hub,
        () => continueAdvance(from, 1),
        (j) => checkInvariants(j.state),
      );
      if (next === null) return finish(null);
      current = next;
      steps++;
    }
    try {
      o.onProgress?.(current.index, current.total);
    } catch {
      // progress is display only
    }
    if (current.done) return finish(current.state);
    frameId = o.clock.requestFrame(slice);
  };
  if (current.done) {
    finish(current.state);
  } else {
    frameId = o.clock.requestFrame(slice);
  }
  return { done, cancel: () => finish(null) };
}
