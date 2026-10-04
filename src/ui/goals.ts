/**
 * The Next goal chip (GDD §17.1): the nearest unlock and a log-scale percentage, such as
 * "Reach 2^128 · 43%".
 *
 * - **Goals**, in threshold order: the first purchase of G2…G8 (`kind: 'buy'`), then x ≥ 2^128
 *   (Product), 2^1024 (Power) and 2^65536 (Tower) (`kind: 'reach'`, from the engine's
 *   `LAYER_UNLOCKS`). The chip shows the first goal not yet done, so a goal skipped on the way
 *   stays the next one.
 * - **Done:** a goal is done once it has been met: a tier goal once that tier has been owned, an
 *   x goal once x has reached its threshold. Done goals are remembered in one monotone set
 *   (`mergeDone`, like reveals), so the chip does not flip back after Max all spends x below
 *   2^128, nor after a reset (M5) sets the bought counts back to 0.
 * - **Percentage:** (log10Floor1(x) − log10 start) / (log10 goal − log10 start), floored to an
 *   integer and clamped to 0–100, where start is the previous goal's threshold (x = 10 at the
 *   start of a new game for the first). x ≥ goal shows exactly 100; x = 0 shows 0.
 */
import { LAYER_UNLOCKS } from '../engine/content/layers.ts';
import type { LayerUnlock } from '../engine/content/layers.ts';
import { X_START } from '../engine/content/sum.ts';
import { isValidNum, log10Floor1, log10Pos, num } from '../engine/num.ts';
import type { Num } from '../engine/num.ts';
import { tierIndex } from '../engine/state.ts';
import type { Tier, Tuple8 } from '../engine/state.ts';
import { tierCost } from '../engine/systems/sum.ts';
import type { StringKey } from './strings.ts';

export type BuyGoalId = `goal.g${2 | 3 | 4 | 5 | 6 | 7 | 8}`;
export type ReachGoalId = `goal.${LayerUnlock['id']}`;
export type GoalId = BuyGoalId | ReachGoalId;

/** What a goal reads now: the previewed x and the bought counts. */
export interface GoalContext {
  readonly x: Num;
  readonly bought: Tuple8<number>;
}

export interface GoalDef {
  readonly id: GoalId;
  /** A first purchase (`buy`) or an x threshold (`reach`). */
  readonly kind: 'buy' | 'reach';
  /** The `strings.ts` template of the chip's goal text, and its parameters. */
  readonly key: StringKey;
  readonly params: Readonly<Record<string, number>>;
  readonly threshold: Num;
  /** The goal is met in this context (it is then done for good, `mergeDone`). */
  readonly met: (c: GoalContext) => boolean;
}

export interface GoalView {
  readonly id: GoalId;
  readonly key: StringKey;
  readonly params: Readonly<Record<string, number>>;
  /** 0–100, an integer. */
  readonly pct: number;
}

function buyGoal(k: Tier): GoalDef {
  return Object.freeze({
    id: `goal.g${k}` as BuyGoalId,
    kind: 'buy',
    key: 'goal.buy',
    params: Object.freeze({ k }),
    threshold: tierCost(k, 0),
    met: (c: GoalContext) => c.bought[tierIndex(k)] >= 1,
  });
}

function reachGoal(l: LayerUnlock): GoalDef {
  return Object.freeze({
    id: `goal.${l.id}` as const,
    kind: 'reach',
    key: 'goal.reach2',
    params: Object.freeze({ n: l.log2 }),
    threshold: l.threshold,
    met: (c: GoalContext) => isValidNum(c.x) && c.x.gte(l.threshold),
  });
}

const BUY_TIERS: readonly Tier[] = [2, 3, 4, 5, 6, 7, 8];

/** The goals in threshold order (GDD §5.2, §7, §8.1, §10.1). */
export const GOALS: readonly GoalDef[] = Object.freeze([
  ...BUY_TIERS.map(buyGoal),
  ...LAYER_UNLOCKS.map(reachGoal),
]);

/** Every goal id, in order. */
export const GOAL_IDS: readonly GoalId[] = Object.freeze(GOALS.map((g) => g.id));

/** True when `id` is a goal id (for validating stored memory, M4). */
export function isGoalId(id: unknown): id is GoalId {
  return typeof id === 'string' && (GOAL_IDS as readonly string[]).includes(id);
}

const START: Num = Object.freeze(num(X_START));

/** The log-scale progress from `start` to `goal`, an integer clamped to 0–100. */
export function goalPercent(x: Num, start: Num, goal: Num): number {
  if (isValidNum(x) && x.gte(goal)) return 100;
  const ls = log10Pos(start) ?? 0;
  const lg = log10Pos(goal) ?? 0;
  if (!(lg > ls)) return 0;
  const p = Math.floor((100 * (log10Floor1(x) - ls)) / (lg - ls));
  if (!Number.isFinite(p)) return 0;
  return Math.min(100, Math.max(0, p));
}

/**
 * The nearest goal neither done (`done`, the remembered set) nor met now, with its percentage;
 * `null` once every goal is done.
 */
export function nextGoal(c: GoalContext, done: ReadonlySet<GoalId>): GoalView | null {
  for (let i = 0; i < GOALS.length; i++) {
    const g = GOALS[i]!;
    if (done.has(g.id) || g.met(c)) continue;
    const start = i === 0 ? START : GOALS[i - 1]!.threshold;
    return { id: g.id, key: g.key, params: g.params, pct: goalPercent(c.x, start, g.threshold) };
  }
  return null;
}

/**
 * The goals done after seeing `c`: `prev` plus every goal met now. Monotone; returns `prev`
 * itself when nothing is new.
 */
export function mergeDone(prev: ReadonlySet<GoalId>, c: GoalContext): ReadonlySet<GoalId> {
  let next: Set<GoalId> | null = null;
  for (const g of GOALS) {
    if (prev.has(g.id) || !g.met(c)) continue;
    next ??= new Set(prev);
    next.add(g.id);
  }
  return next ?? prev;
}
