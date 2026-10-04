/**
 * The frame clock (GDD §21.1, §21.4): wall time in milliseconds and animation frames. The loop
 * takes it as a parameter, so tests drive the game with a fake clock.
 */
export interface Clock {
  /** Milliseconds from an arbitrary origin (monotonic). */
  now(): number;
  requestFrame(cb: () => void): number;
  cancelFrame(id: number): void;
}

/** The browser's clock: `performance.now()` and `requestAnimationFrame`. */
export function browserClock(win: Window): Clock {
  return {
    now: () => win.performance.now(),
    requestFrame: (cb) => win.requestAnimationFrame(() => cb()),
    cancelFrame: (id) => win.cancelAnimationFrame(id),
  };
}
