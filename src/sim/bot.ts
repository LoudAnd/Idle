/**
 * The greedy bot (GDD §22.6) that checks early pacing (§15). It drives the engine only through
 * actions and 1 s exact steps (`step`), so its action log replays to the same state.
 *
 * Policy (the rule of `docs/prototypes/sim2.py`, which the §5.5 and §15 reference numbers come
 * from), repeated until nothing is affordable:
 * - take the highest affordable tier, searching G8 down to G1 (Buy 1);
 * - buy a global level instead when it is affordable and either no tier is affordable or it
 *   costs less than `GLOBAL_PREFERENCE` (3) times that tier's purchase.
 *
 * The policy has no exact ties to break: a global level costs a power of ten, 10^(2+L), and
 * 3 × a tier price 10^(e/10) never is one. So seeds vary only the reaction delay: after a round
 * in which it bought something, the bot waits 0–2 extra seconds (seeded) before it acts again.
 * A later policy that has real ties breaks them with the same seeded generator.
 *
 * Profiles: `active` may act every second; `idle` may act during the first 10 s of every 15 min
 * (the first check-in is at t = 0).
 */
import { log10Floor1, pow2 } from '../engine/num.ts';
import type { Num } from '../engine/num.ts';
import { applyAction } from '../engine/actions.ts';
import type { Action } from '../engine/actions.ts';
import { newGame, tierIndex } from '../engine/state.ts';
import type { GameState, Tier } from '../engine/state.ts';
import { globalCost, tierCost } from '../engine/systems/sum.ts';
import { step } from '../engine/tick.ts';
import { createRng } from './rng.ts';

export type Profile = 'active' | 'idle';
export const PROFILES: readonly Profile[] = Object.freeze(['active', 'idle'] as const);

/** A global level is preferred while it costs less than this many times the tier purchase. */
export const GLOBAL_PREFERENCE = 3;
/** The seeded extra wait after a round with purchases: 0 to this many seconds. */
export const MAX_REACTION_DELAY_S = 2;
/** The idle profile checks in every 15 min … */
export const IDLE_PERIOD_S = 900;
/** … for 10 s. */
export const IDLE_WINDOW_S = 10;
/** x ≥ 2^128, the first reset threshold (§15). */
export const REACH_LOG2 = 128;
/** The timeline also records every 10 decades of x (1e10, 1e20, …). */
export const DECADE_STEP = 10;
/** A guard against a runaway round (never reached in practice). */
const MAX_ACTIONS_PER_ROUND = 100_000;

export interface SimEvent {
  /** Simulated seconds since the start of the run. */
  readonly t: number;
  /** `unlock`: a tier's first purchase. `reach`: x first reached 2^log2 or 10^log10. */
  readonly kind: 'unlock' | 'reach';
  readonly tier?: Tier;
  readonly log2?: number;
  readonly log10?: number;
}

export interface BotOptions {
  readonly profile: Profile;
  readonly seed: number;
  /** Simulated seconds to run. */
  readonly seconds: number;
  /** Stop once x ≥ 2^stopAtLog2. */
  readonly stopAtLog2?: number;
  /** The state to start from (default: a new game). */
  readonly initial?: GameState;
}

export interface BotRun {
  readonly profile: Profile;
  readonly seed: number;
  /** Simulated seconds actually run. */
  readonly seconds: number;
  readonly initial: GameState;
  readonly events: readonly SimEvent[];
  readonly final: GameState;
  /** The actions of each simulated second (one entry per 1 s step). */
  readonly log: readonly (readonly Action[])[];
  /** Actions applied in total. */
  readonly purchases: number;
}

/** True when the profile may act at simulated second t. */
export function canAct(profile: Profile, t: number): boolean {
  return profile === 'active' || t % IDLE_PERIOD_S < IDLE_WINDOW_S;
}

/** The policy's next purchase, or `null` when nothing is affordable. Deterministic. */
export function nextAction(s: GameState): Action | null {
  const x = s.sum.x;
  let best: { readonly tier: Tier; readonly cost: Num } | null = null;
  for (let k = 8; k >= 1; k--) {
    const tier = k as Tier;
    const cost = tierCost(tier, s.sum.bought[tierIndex(tier)]);
    if (cost.lte(x)) {
      best = { tier, cost };
      break;
    }
  }
  const g = globalCost(s.sum.globalLevel);
  if (g.lte(x)) {
    if (best === null) return { type: 'buyGlobal', mode: 'one' };
    if (g.lt(best.cost.mul(GLOBAL_PREFERENCE))) return { type: 'buyGlobal', mode: 'one' };
  }
  return best === null ? null : { type: 'buy', tier: best.tier, mode: 'one' };
}

/** Runs the bot. Deterministic for a given profile, seed and initial state. */
export function runBot(o: BotOptions): BotRun {
  const rng = createRng(o.seed);
  const initial = o.initial ?? newGame();
  const reach = pow2(REACH_LOG2);
  const stop = o.stopAtLog2 === undefined ? null : pow2(o.stopAtLog2);
  const events: SimEvent[] = [];
  const log: (readonly Action[])[] = [];
  let state = initial;
  let purchases = 0;
  let nextActAt = 0;
  let reached = state.sum.x.gte(reach);
  let decade = Math.floor(log10Floor1(state.sum.x) / DECADE_STEP);
  let t = 0;
  while (t < o.seconds) {
    const actions: Action[] = [];
    if (canAct(o.profile, t) && t >= nextActAt) {
      let cur = state;
      for (let n = 0; n < MAX_ACTIONS_PER_ROUND; n++) {
        const a = nextAction(cur);
        if (a === null) break;
        const after = applyAction(cur, a);
        if (after === cur) break;
        if (a.type === 'buy' && cur.sum.bought[tierIndex(a.tier)] === 0) {
          events.push({ t, kind: 'unlock', tier: a.tier });
        }
        actions.push(a);
        cur = after;
      }
      if (actions.length > 0) nextActAt = t + 1 + rng.int(MAX_REACTION_DELAY_S + 1);
    }
    state = step(state, actions, 1);
    log.push(actions);
    purchases += actions.length;
    t++;
    const lx = log10Floor1(state.sum.x);
    while (lx >= (decade + 1) * DECADE_STEP) {
      decade++;
      events.push({ t, kind: 'reach', log10: decade * DECADE_STEP });
    }
    if (!reached && state.sum.x.gte(reach)) {
      reached = true;
      events.push({ t, kind: 'reach', log2: REACH_LOG2 });
    }
    if (stop !== null && state.sum.x.gte(stop)) break;
  }
  return {
    profile: o.profile,
    seed: o.seed,
    seconds: t,
    initial,
    events,
    final: state,
    log,
    purchases,
  };
}

/** Replays a bot's per-second action log with the same 1 s exact steps. */
export function replayLog(initial: GameState, log: readonly (readonly Action[])[]): GameState {
  let s = initial;
  for (const actions of log) s = step(s, actions, 1);
  return s;
}

/** The first time (in seconds) a tier was unlocked, or null. */
export function unlockTime(run: BotRun, tier: Tier): number | null {
  return run.events.find((e) => e.kind === 'unlock' && e.tier === tier)?.t ?? null;
}

/** The first time (in seconds) x reached 2^log2, or null (only `REACH_LOG2` is recorded). */
export function reachTime(run: BotRun, log2: number): number | null {
  return run.events.find((e) => e.kind === 'reach' && e.log2 === log2)?.t ?? null;
}
