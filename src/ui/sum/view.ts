/**
 * The Sum tab's view model, derived from the state by the game loop (inside its safe wrapper,
 * GDD §21.8). Displayed amounts are the preview at committed + pending time (§5.5); costs and
 * affordability are against the previewed x, which is what the next tick's flush commits before
 * it applies a purchase.
 */
import { ONE } from '../../engine/num.ts';
import type { Num } from '../../engine/num.ts';
import { effectTable, factorValue, stepMultipliers } from '../../engine/effects.ts';
import { previewSum } from '../../engine/integrate.ts';
import { checkValues } from '../../engine/invariants.ts';
import { map8, tierAt } from '../../engine/state.ts';
import type { GameState, Tier, Tuple8 } from '../../engine/state.ts';
import {
  globalCost,
  tierCost,
  tierPrice,
  totalCost,
  untilTenCount,
} from '../../engine/systems/sum.ts';

/** The effect whose factor the Global row shows (GDD §5.3, `content/sum.ts`). */
const GLOBAL_EFFECT = 'sum.global';

export interface TierRowView {
  readonly tier: Tier;
  readonly amount: Num;
  readonly bought: number;
  /** m_k for the current step. */
  readonly mult: Num;
  /** The cost of the next purchase (Buy 1). */
  readonly cost: Num;
  /** Purchases to the next multiple of 10 (Until 10), and their full cost. */
  readonly untilTen: number;
  readonly untilTenCost: Num;
  /** The next purchase is affordable (so Buy 1, Until 10 and Max each buy at least one). */
  readonly affordable: boolean;
}

export interface GlobalRowView {
  readonly level: number;
  /** The global factor g^L, read from the effect table that production uses (§21.3). */
  readonly mult: Num;
  readonly cost: Num;
  readonly affordable: boolean;
}

export interface SumView {
  readonly x: Num;
  readonly tiers: Tuple8<TierRowView>;
  readonly levels: GlobalRowView;
  /** Max all would buy something. */
  readonly anyAffordable: boolean;
}

export function buildSumView(s: GameState): SumView {
  const sum = previewSum(s);
  const table = effectTable(s);
  const m = stepMultipliers(s, table);
  const x = sum.x;
  const tiers = map8((i): TierRowView => {
    const tier = tierAt(i);
    const b = sum.bought[i];
    const cost = tierCost(tier, b);
    const untilTen = untilTenCount(b);
    return {
      tier,
      amount: sum.amounts[i],
      bought: b,
      mult: m[i],
      cost,
      untilTen,
      untilTenCost: totalCost(tierPrice(tier), b, untilTen),
      affordable: x.gte(cost),
    };
  });
  const level = sum.globalLevel;
  const levelCost = globalCost(level);
  const levels: GlobalRowView = {
    level,
    mult: factorValue(s, 1, GLOBAL_EFFECT, table) ?? ONE,
    cost: levelCost,
    affordable: x.gte(levelCost),
  };
  return {
    x,
    tiers,
    levels,
    anyAffordable: levels.affordable || tiers.some((r) => r.affordable),
  };
}

/**
 * Every invalid value in the view (GDD §4.2: never render NaN): the generic walk of
 * `checkValues`, so every `Num` and number in the view is covered, including fields added later.
 */
export function checkSumView(v: SumView): readonly string[] {
  return checkValues(v, 'view');
}
