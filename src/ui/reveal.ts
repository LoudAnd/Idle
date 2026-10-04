/**
 * Reveal at half price (GDD §17.4): the one rule by which hidden elements appear. An element is
 * revealed once its resource first reaches half its cost or threshold, value ≥ threshold/2; for
 * the 2^n layer thresholds that is 2^(n−1) (Product at 2^127, Power at 2^1023, Tower at
 * 2^65535). An owned element counts as revealed.
 *
 * Reveals are remembered: `mergeReveals` is a monotone union over every state the shell observes,
 * so an element stays revealed after a purchase spends x below its half. The memory lives in
 * the UI (`onboarding.ts`), not in the game state; M4 persists it with the save.
 *
 * Generator 1 and Settings are always shown and have no rule. The half is derived from the
 * threshold in one place each: `threshold.div(2)` for costs (`rule`), and 2^(n−1) for the 2^n
 * layer thresholds, taken from the engine's `LAYER_UNLOCKS` (shared with `goals.ts`).
 */
import { LAYER_UNLOCKS } from '../engine/content/layers.ts';
import type { LayerUnlock } from '../engine/content/layers.ts';
import type { RevealId } from '../engine/content/onboarding.ts';
import { isValidNum } from '../engine/num.ts';
import type { Num } from '../engine/num.ts';
import { globalCost, tierCost } from '../engine/systems/sum.ts';
import type { Tier, Tuple8 } from '../engine/state.ts';

/** The stable reveal ids are the engine's (`content/onboarding.ts`), so saves can validate them. */
export type { RevealId };
export type TierRevealId = Extract<RevealId, `tier.${number}`>;
export type LayerRevealId = Extract<RevealId, `tab.${LayerUnlock['id']}`>;

/** What a reveal reads: the previewed x, the bought counts and the global level. */
export interface RevealContext {
  readonly x: Num;
  readonly bought: Tuple8<number>;
  readonly globalLevel: number;
}

export interface RevealRule {
  readonly id: RevealId;
  /** The cost or threshold the element is about. */
  readonly threshold: Num;
  /** threshold / 2, computed once: the element is revealed when x reaches it. */
  readonly half: Num;
  /** Owned items count as revealed (a bought tier, a global level). */
  readonly owned?: (c: RevealContext) => boolean;
  /** Revealed together with any of these (Max all comes with the first purchasable extra). */
  readonly with?: readonly RevealId[];
}

/** value ≥ half, for a valid value (NaN, infinite and negative values never reveal anything). */
export function halfReached(value: Num, half: Num): boolean {
  return isValidNum(value) && value.gte(half);
}

type Extra = Pick<RevealRule, 'owned' | 'with'>;

/** A rule for a cost: revealed at cost / 2. */
function rule(id: RevealId, threshold: Num, extra: Extra = {}): RevealRule {
  return Object.freeze({ id, threshold, half: threshold.div(2), ...extra });
}

/** A layer tab: revealed at 2^(n−1) of its 2^n unlock (M5, M13, M21 add their reset counts). */
function layerRule(l: LayerUnlock): RevealRule {
  return Object.freeze({
    id: `tab.${l.id}` as LayerRevealId,
    threshold: l.threshold,
    half: l.half,
  });
}

const LATER_TIERS: readonly Tier[] = [3, 4, 5, 6, 7, 8];

/**
 * Generator k: half its first cost 10^λ_k (50, 5e3, 5e6, 5e10, 5e15, 5e21, 5e28). Owning it, or
 * any higher tier (whose cost x passed on the way, so the reveal must have happened), counts.
 */
function tierRule(k: Tier): RevealRule {
  return rule(`tier.${k}` as TierRevealId, tierCost(k, 0), {
    owned: (c) => c.bought.some((b, i) => i >= k - 1 && b > 0),
  });
}

const GLOBAL_FIRST = globalCost(0);

/** Every reveal rule, in threshold order (GDD §5.2, §5.3, §7, §8.1, §10.1, §17.2). */
export const REVEAL_RULES: readonly RevealRule[] = Object.freeze([
  tierRule(2),
  rule('global', GLOBAL_FIRST, { owned: (c) => c.globalLevel > 0 }),
  // Max all buys G2+ and global levels too: it appears with the cheaper of them (both cost 100).
  rule('maxAll', GLOBAL_FIRST, { with: ['tier.2', 'global'] }),
  ...LATER_TIERS.map(tierRule),
  ...LAYER_UNLOCKS.map(layerRule),
]);

/** Every reveal id, in rule order. */
export const REVEAL_IDS: readonly RevealId[] = Object.freeze(REVEAL_RULES.map((r) => r.id));

/** True when `id` is a reveal id of these rules (stored memory is validated by the engine). */
export function isRevealId(id: unknown): id is RevealId {
  return typeof id === 'string' && (REVEAL_IDS as readonly string[]).includes(id);
}

/** The ids revealed by this context alone (no memory). */
export function revealedNow(c: RevealContext): RevealId[] {
  const out = new Set<RevealId>();
  for (const r of REVEAL_RULES) {
    if (halfReached(c.x, r.half) || (r.owned?.(c) ?? false)) out.add(r.id);
  }
  for (const r of REVEAL_RULES) {
    if (r.with?.some((id) => out.has(id))) out.add(r.id);
  }
  return REVEAL_IDS.filter((id) => out.has(id));
}

/**
 * The remembered reveals after seeing `c`: `prev` plus everything revealed now (and whatever
 * comes `with` a remembered id). Monotone: nothing is ever removed. Returns `prev` itself when
 * nothing is new, so a caller can compare by identity.
 */
export function mergeReveals(prev: ReadonlySet<RevealId>, c: RevealContext): ReadonlySet<RevealId> {
  let next: Set<RevealId> | null = null;
  const add = (id: RevealId): void => {
    if (prev.has(id) || next?.has(id)) return;
    next ??= new Set(prev);
    next.add(id);
  };
  for (const id of revealedNow(c)) add(id);
  for (const r of REVEAL_RULES) {
    if (r.with?.some((id) => prev.has(id) || (next?.has(id) ?? false))) add(r.id);
  }
  return next ?? prev;
}
