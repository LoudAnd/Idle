/**
 * Serializable actions (GDD §21.2). The UI, hotkeys, autobuyers and the bot all send these; they
 * are applied at the next tick boundary. An action log can be stored as JSON and replayed.
 */
import { buyGlobal, buyTier, maxAll } from './systems/sum.ts';
import type { GlobalBuyMode, TierBuyMode } from './systems/sum.ts';
import { isTier } from './state.ts';
import type { GameState, Tier } from './state.ts';

export type BuyMode = TierBuyMode;

export type Action =
  | { readonly type: 'buy'; readonly tier: Tier; readonly mode: BuyMode }
  | { readonly type: 'buyGlobal'; readonly mode: GlobalBuyMode }
  | { readonly type: 'maxAll' };

const TIER_MODES: readonly unknown[] = ['one', 'until10', 'max'] satisfies BuyMode[];
const GLOBAL_MODES: readonly unknown[] = ['one', 'max'] satisfies GlobalBuyMode[];

/** True for a well-formed action (guards replay logs and dev hooks). */
export function isAction(v: unknown): v is Action {
  if (typeof v !== 'object' || v === null) return false;
  const a = v as Record<string, unknown>;
  switch (a.type) {
    case 'buy':
      return isTier(a.tier) && TIER_MODES.includes(a.mode);
    case 'buyGlobal':
      return GLOBAL_MODES.includes(a.mode);
    case 'maxAll':
      return true;
    default:
      return false;
  }
}

/** Applies one action. A malformed or unaffordable action is a no-op; this never throws. */
export function applyAction(s: GameState, a: Action): GameState {
  if (!isAction(a)) return s;
  switch (a.type) {
    case 'buy':
      return buyTier(s, a.tier, a.mode);
    case 'buyGlobal':
      return buyGlobal(s, a.mode);
    case 'maxAll':
      return maxAll(s);
  }
}

/** Applies actions in order. */
export function applyActions(s: GameState, actions: readonly Action[]): GameState {
  let out = s;
  for (const a of actions) out = applyAction(out, a);
  return out;
}
