/**
 * The fixed-timestep entry points (GDD §5.5, §21.2). Everything that changes game state goes
 * through these and `integrate`, so online play, the bot and replays run the same code.
 */
import { applyActions } from './actions.ts';
import type { Action } from './actions.ts';
import { withTable } from './effects.ts';
import { LAZY_FLUSH_MS, flush, integrate } from './integrate.ts';
import { TICK_MS } from './content/sum.ts';
import type { GameState } from './state.ts';

/**
 * One 50 ms tick: if there are actions, flush the pending time (an event flush) and apply them;
 * then add 50 ms to the pending time, and flush once 1 s is pending.
 *
 * Only an action that changes the state is an event: when every action is a no-op (an
 * unaffordable buy, as an autobuyer or a held hotkey sends every tick), the flush is discarded
 * and the pending time keeps accumulating, so sub-resolution growth is not lost (§5.5).
 */
export function tick(s: GameState, actions: readonly Action[]): GameState {
  let out = s;
  if (actions.length > 0) {
    const flushed = flush(out, { force: true });
    const applied = applyActions(flushed, actions);
    if (applied !== flushed) out = applied;
  }
  out = { ...out, pendingMs: out.pendingMs + TICK_MS };
  if (out.pendingMs >= LAZY_FLUSH_MS) out = flush(out, { force: false });
  return withTable(out);
}

/**
 * An exact step for the bot (GDD §22.6: "1 s exact steps"): flush the pending time, apply the
 * actions, then integrate `seconds` exactly. Unlike `tick`, the flush is kept even when the
 * actions change nothing: the step commits right after it anyway, so nothing is deferred here.
 */
export function step(s: GameState, actions: readonly Action[], seconds: number): GameState {
  return integrate(applyActions(flush(s, { force: true }), actions), seconds);
}

/**
 * Adds time that does not fit into whole ticks (the frame loop's remainder, §21.4) to the
 * pending time, and flushes once 1 s is pending.
 */
export function addTime(s: GameState, ms: number): GameState {
  if (!(ms > 0)) return s;
  const out = { ...s, pendingMs: s.pendingMs + ms };
  return out.pendingMs >= LAZY_FLUSH_MS ? flush(out, { force: false }) : out;
}

/** Replays an action log, one entry per tick. */
export function replay(s: GameState, log: readonly (readonly Action[])[]): GameState {
  let out = s;
  for (const actions of log) out = tick(out, actions);
  return out;
}
