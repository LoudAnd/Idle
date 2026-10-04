// A fake `Clock` (src/platform/clock.ts) for loop and UI tests: time moves only through
// `advance`, which runs the requested animation frames at a fixed frame length.
import type { Clock } from '../../../src/platform/clock.ts';

export interface FakeClock extends Clock {
  /** Moves time forward by `ms`, running one frame every `frameMs` (the last one may be shorter). */
  advance(ms: number, frameMs?: number): void;
  /** Runs one frame after `ms` (for example a single long frame or a gap). */
  frame(ms: number): void;
  /** Animation frames currently requested. */
  readonly pendingFrames: number;
}

export function createFakeClock(start = 0): FakeClock {
  let now = start;
  let nextId = 1;
  const frames = new Map<number, () => void>();
  const runFrames = (): void => {
    const due = [...frames.values()];
    frames.clear();
    for (const cb of due) cb();
  };
  return {
    now: () => now,
    requestFrame(cb) {
      const id = nextId++;
      frames.set(id, cb);
      return id;
    },
    cancelFrame(id) {
      frames.delete(id);
    },
    advance(ms, frameMs = 50) {
      let left = ms;
      while (left > 0) {
        const d = Math.min(frameMs, left);
        now += d;
        left -= d;
        runFrames();
      }
    },
    frame(ms) {
      now += ms;
      runFrames();
    },
    get pendingFrames() {
      return frames.size;
    },
  };
}
