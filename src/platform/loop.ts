/**
 * The UI loop (GDD §21.4). Animation frames feed an accumulator that runs at most 40 fine ticks
 * of 50 ms per frame; time beyond that is added to the pending integration time and integrated
 * exactly (§5.5), so a slow frame never drops time. A gap longer than 60 s (a suspended laptop,
 * a hidden tab) is integrated in one exact forced flush; M4 routes gaps through `advance()`.
 *
 * Every engine call goes through `safeTick` (§21.8): an exception or a failed invariant pauses
 * the loop for good. The last good state and view are kept, frames stop and enqueued actions
 * are ignored. The view is derived from the state at most `uiFps` times per second (the UI fps
 * setting, 30 by default, `setUiFps`), also inside the safe wrapper, with a function the UI
 * supplies (the platform never imports UI code).
 *
 * `observe`, also from the UI, sees the state at every tick boundary, before that tick's actions
 * (so x before a queued purchase spends it). The UI's onboarding memory (reveals and goals,
 * GDD §17.4) is kept from it, so nothing crossed between two derives is missed at a low UI fps.
 */
import type { Action } from '../engine/actions.ts';
import { TICK_MS } from '../engine/content/sum.ts';
import { flush } from '../engine/integrate.ts';
import { checkInvariants, checkValues } from '../engine/invariants.ts';
import { newGame } from '../engine/state.ts';
import type { GameState } from '../engine/state.ts';
import { addTime, tick } from '../engine/tick.ts';
import type { Clock } from './clock.ts';
import { createErrorHub, safeTick } from './errors.ts';
import type { ErrorHub } from './errors.ts';

/** At most this many 50 ms ticks per frame. */
export const MAX_TICKS_PER_FRAME = 40;
/** A frame gap longer than this is caught up in one exact step. */
export const GAP_MS = 60_000;
/** The default UI fps: the view is derived at most this many times per second (GDD §19). */
export const UI_FPS = 30;
/** The UI fps setting is clamped to this range (GDD §19). */
export const UI_FPS_RANGE = Object.freeze({ min: 10, max: 60 } as const);

/** A UI fps setting clamped to [10, 60]; a non-finite value gives the default 30. */
export function clampUiFps(fps: number): number {
  if (!Number.isFinite(fps)) return UI_FPS;
  return Math.min(UI_FPS_RANGE.max, Math.max(UI_FPS_RANGE.min, fps));
}

export interface FramePlan {
  /** Fine ticks to run. */
  readonly ticks: number;
  /** Time beyond the ticks, added to the pending integration time (or the whole gap). */
  readonly extraMs: number;
  /** The accumulator carried to the next frame (always below 50 ms). */
  readonly accMs: number;
  /** True when the frame gap exceeded `GAP_MS`. */
  readonly gap: boolean;
}

/**
 * Splits accumulated time plus a frame's dt into fine ticks, extra time and the new accumulator.
 * A negative or invalid dt counts as 0. No time is dropped:
 * ticks·50 + extraMs + accMs = accMs(previous) + dt.
 */
export function planFrame(accMs: number, dtMs: number): FramePlan {
  const dt = Number.isFinite(dtMs) && dtMs > 0 ? dtMs : 0;
  const acc = Number.isFinite(accMs) && accMs > 0 ? accMs : 0;
  if (dt > GAP_MS) return { ticks: 0, extraMs: acc + dt, accMs: 0, gap: true };
  const t = acc + dt;
  const ticks = Math.min(MAX_TICKS_PER_FRAME, Math.floor(t / TICK_MS));
  if (ticks === MAX_TICKS_PER_FRAME) {
    return { ticks, extraMs: t - ticks * TICK_MS, accMs: 0, gap: false };
  }
  return { ticks, extraMs: 0, accMs: t - ticks * TICK_MS, gap: false };
}

export interface GameLoop<V> {
  readonly hub: ErrorHub;
  /** True between `start()` and `stop()` or a fault. */
  readonly running: boolean;
  /** The current (last good) state. */
  state(): GameState;
  /** The last good view, or `null` if none could be derived. */
  view(): V | null;
  /** Calls `fn` after every new view and on a fault. Returns the unsubscribe function. */
  subscribe(fn: () => void): () => void;
  /** Queues an action for the next tick (ignored after a fault). */
  enqueue(a: Action): void;
  /** Sets the UI fps (the view's derive rate), clamped to [10, 60]. */
  setUiFps(fps: number): void;
  /** The current UI fps. */
  readonly uiFps: number;
  start(): void;
  stop(): void;
}

export interface GameLoopOptions<V> {
  readonly clock: Clock;
  /** Builds the view from the state (inside the safe wrapper). */
  readonly derive: (s: GameState) => V;
  /**
   * The view's problems (for example a NaN); a non-empty result is an invariant fault. The
   * default, `checkValues`, walks the whole view, so a new view field is checked without a list.
   */
  readonly checkView?: (v: V) => readonly string[];
  /**
   * Sees the state at every tick boundary, before the tick applies its actions (inside the safe
   * wrapper: a throw is a `view` fault). For memory the UI keeps outside the view.
   */
  readonly observe?: (s: GameState) => void;
  readonly initial?: GameState;
  readonly hub?: ErrorHub;
}

const NO_PROBLEMS = (): readonly string[] => [];

export function createGameLoop<V>(o: GameLoopOptions<V>): GameLoop<V> {
  const hub = o.hub ?? createErrorHub();
  const checkView = o.checkView ?? ((v: V) => checkValues(v));
  const listeners = new Set<() => void>();
  let state = o.initial ?? newGame();
  let view: V | null = null;
  let queue: Action[] = [];
  let acc = 0;
  let last = 0;
  let lastDerive = Number.NEGATIVE_INFINITY;
  let frameId: number | null = null;
  let running = false;
  let uiFps = UI_FPS;

  const notify = (): void => {
    for (const l of [...listeners]) l();
  };

  const halt = (): void => {
    running = false;
    queue = [];
    if (frameId !== null) {
      o.clock.cancelFrame(frameId);
      frameId = null;
    }
  };

  // Any fault, from the engine or the global handlers, pauses the loop.
  hub.subscribe(() => {
    halt();
    notify();
  });

  const derive = (): boolean => {
    const v = safeTick(hub, () => o.derive(state), checkView, 'view');
    if (v === null) return false;
    view = v;
    return true;
  };

  /** Shows the current state to `observe` (if any). False after a fault. */
  const observe = (): boolean => {
    const fn = o.observe;
    if (fn === undefined) return true;
    return safeTick(hub, () => fn(state), NO_PROBLEMS, 'view') !== null;
  };

  /** Runs one engine call; commits its result only if it ran cleanly and passes the invariant. */
  const run = (f: () => GameState): boolean => {
    const next = safeTick(hub, f, checkInvariants);
    if (next === null) return false;
    state = next;
    return true;
  };

  const frame = (): void => {
    frameId = null;
    if (!running) return;
    const now = o.clock.now();
    const plan = planFrame(acc, now - last);
    last = now;
    acc = plan.accMs;
    let ok = true;
    if (plan.gap) {
      ok = run(() => flush(addTime(state, plan.extraMs), { force: true }));
    } else {
      for (let i = 0; i < plan.ticks && ok; i++) {
        // The state this tick starts from, before its actions spend x (GDD §17.4).
        ok = observe();
        if (!ok) break;
        const actions = i === 0 ? queue.splice(0) : [];
        ok = run(() => tick(state, actions));
      }
      if (ok && plan.extraMs > 0) ok = run(() => addTime(state, plan.extraMs));
    }
    if (!ok) return; // the hub has paused the loop and notified
    if (now - lastDerive >= 1000 / uiFps - 1) {
      lastDerive = now;
      if (!derive()) return;
      notify();
    }
    if (running) frameId = o.clock.requestFrame(frame);
  };

  derive();

  return {
    hub,
    get running() {
      return running;
    },
    get uiFps() {
      return uiFps;
    },
    setUiFps(fps) {
      uiFps = clampUiFps(fps);
    },
    state: () => state,
    view: () => view,
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    enqueue(a) {
      if (hub.fault !== null) return;
      queue.push(a);
    },
    start() {
      if (running || hub.fault !== null) return;
      running = true;
      last = o.clock.now();
      acc = 0;
      frameId = o.clock.requestFrame(frame);
    },
    stop() {
      running = false;
      if (frameId !== null) {
        o.clock.cancelFrame(frameId);
        frameId = null;
      }
    },
  };
}
