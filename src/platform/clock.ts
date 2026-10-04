/**
 * Clocks (GDD §20.2, §21.1, §21.4).
 *
 * - The **frame clock** (`Clock`): monotonic milliseconds and animation frames. The loop and the
 *   offline runner take it as a parameter, so tests drive the game with a fake clock.
 * - The **wall clock** (`WallClock`): epoch milliseconds, for the save's `savedAt` and
 *   `maxSeenAt` and the offline credit. It can jump (the player sets the clock), which is why the
 *   credit is measured from the highest time ever seen (§20.2).
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

export interface WallClock {
  /** Epoch milliseconds (`Date.now()`); may jump in either direction. */
  now(): number;
}

/** The browser's wall clock. */
export function browserWallClock(): WallClock {
  return { now: () => Date.now() };
}
