/**
 * The Sum tab's view model, derived from the state by the game loop (inside its safe wrapper,
 * GDD §21.8). Displayed amounts are the preview at committed + pending time (§5.5); costs and
 * affordability are against the previewed x, which is what the next tick's flush commits before
 * it applies a purchase.
 *
 * - **Row state** (§17.3, §17.4): `owned` (a full row) once a tier has a purchase; `silhouette`
 *   from its reveal (half its first cost, `reveal.ts`) until then; `hidden` before. Generator 1
 *   is always a full row. The global row uses the same rule with its level.
 * - **Time-to-afford** (§17.4) on every button of a shown row: 0 when affordable, otherwise the
 *   seconds until x reaches that button's cost with nothing bought (`forecast.ts`), or `null`
 *   when it never does. Never `Infinity`: `checkValues` would fault on it.
 * - **Breakdown** (§17.4, §21.3): the factors of m_k from the same effect table production
 *   uses, so what is shown is what is computed.
 */
import { breakdown, effectTable, factorValue, stepMultipliers } from '../../engine/effects.ts';
import type { EffectTable, Factor } from '../../engine/effects.ts';
import { DEFAULT_CURVE, STEP_LENGTH, curveIndex } from '../../engine/content/sum.ts';
import { timeToReach, xSeries } from '../../engine/forecast.ts';
import { previewSum } from '../../engine/integrate.ts';
import { ONE } from '../../engine/num.ts';
import type { Num } from '../../engine/num.ts';
import { map8, tierAt } from '../../engine/state.ts';
import type { GameState, SumState, Tier, Tuple8 } from '../../engine/state.ts';
import {
  globalCost,
  stepOf,
  tierCost,
  tierPrice,
  totalCost,
  untilTenCount,
} from '../../engine/systems/sum.ts';
import type { RevealId } from '../reveal.ts';

/** The effect whose factor the Global row shows (GDD §5.3, `content/sum.ts`). */
const GLOBAL_EFFECT = 'sum.global';

export type RowState = 'hidden' | 'silhouette' | 'owned';

/** One buy button's status (GDD §17.4, §18). */
export interface ButtonStatus {
  /** x covers the button's full price (solid border and ✓). */
  readonly affordable: boolean;
  /** The button would buy at least one. */
  readonly enabled: boolean;
  /** Seconds until x covers the full price: 0 when affordable, `null` when never. */
  readonly eta: number | null;
}

export interface TierRowView {
  readonly tier: Tier;
  readonly state: RowState;
  readonly amount: Num;
  readonly bought: number;
  /** m_k for the current step. */
  readonly mult: Num;
  /** A_k · m_k: what the tier produces per second (x for G1, A_(k−1) otherwise; §5.1). */
  readonly production: Num;
  /** The step i_k = ⌊b_k/10⌋ and the purchases into it, b_k mod 10 (0–9). */
  readonly step: number;
  readonly stepFill: number;
  /** The curve term the step uses and the curve's data horizon: "term 14 of 34" (§5.2). */
  readonly term: number;
  readonly horizon: number;
  /** The factors of m_k in fold order (the breakdown rows). */
  readonly factors: readonly Factor[];
  /** The cost of the next purchase (Buy 1). */
  readonly cost: Num;
  /** The full cost of the purchases to the next multiple of 10 (Until 10). */
  readonly untilTenCost: Num;
  /** Buy 1 and Max (`enabled`: the next purchase is affordable, so every button buys one). */
  readonly buy1: ButtonStatus;
  readonly until10: ButtonStatus;
  readonly max: ButtonStatus;
}

export interface GlobalRowView {
  readonly state: RowState;
  readonly level: number;
  /** The global factor g^L, read from the effect table that production uses (§21.3). */
  readonly mult: Num;
  readonly cost: Num;
  readonly buy1: ButtonStatus;
  readonly max: ButtonStatus;
}

export interface SumView {
  readonly x: Num;
  readonly tiers: Tuple8<TierRowView>;
  readonly levels: GlobalRowView;
  /**
   * Max all is revealed (`shown`), and its status (§17.3): ✓ and enabled when it would buy
   * something, otherwise the time until the cheapest next purchase of a shown row.
   */
  readonly maxAll: ButtonStatus & { readonly shown: boolean };
}

/** What `buildSumView` derives from: the preview, the effect table and the step multipliers. */
export interface SumBasis {
  readonly sum: SumState;
  readonly table: EffectTable;
  readonly m: Tuple8<Num>;
}

/** The preview, effect table and multipliers of a state (shared by the shell's deriver). */
export function sumBasis(s: GameState): SumBasis {
  const table = effectTable(s);
  return { sum: previewSum(s), table, m: stepMultipliers(s, table) };
}

function rowState(owned: boolean, revealed: boolean): RowState {
  if (owned) return 'owned';
  return revealed ? 'silhouette' : 'hidden';
}

const NO_REVEALS: ReadonlySet<RevealId> = new Set();

export function buildSumView(
  s: GameState,
  revealed: ReadonlySet<RevealId> = NO_REVEALS,
  basis: SumBasis = sumBasis(s),
): SumView {
  const { sum, table, m } = basis;
  const x = sum.x;
  const series = xSeries(sum, m);
  /** The status of a button costing `full`, which buys something once x ≥ `first`. */
  const status = (shown: boolean, first: Num, full: Num): ButtonStatus => {
    const affordable = x.gte(full);
    return {
      affordable,
      enabled: x.gte(first),
      eta: affordable ? 0 : shown ? timeToReach(series, full) : null,
    };
  };
  const tiers = map8((i): TierRowView => {
    const tier = tierAt(i);
    const b = sum.bought[i];
    // Generator 1 is always a full row (§17.4: a new game shows it with all its controls).
    const state = tier === 1 ? 'owned' : rowState(b >= 1, revealed.has(`tier.${tier}` as RevealId));
    const shown = state !== 'hidden';
    const cost = tierCost(tier, b);
    const untilTen = untilTenCount(b);
    const untilTenCost = totalCost(tierPrice(tier), b, untilTen);
    const step = stepOf(b);
    const buy1 = status(shown, cost, cost);
    return {
      tier,
      state,
      amount: sum.amounts[i],
      bought: b,
      mult: m[i],
      production: sum.amounts[i].mul(m[i]),
      step,
      stepFill: b % STEP_LENGTH,
      term: curveIndex(step),
      horizon: DEFAULT_CURVE.horizon,
      factors: breakdown(s, tier, table),
      cost,
      untilTenCost,
      buy1,
      until10: status(shown, cost, untilTenCost),
      max: buy1,
    };
  });
  const level = sum.globalLevel;
  const levelCost = globalCost(level);
  const globalState = rowState(level >= 1, revealed.has('global'));
  const globalBuy = status(globalState !== 'hidden', levelCost, levelCost);
  const levels: GlobalRowView = {
    state: globalState,
    level,
    mult: factorValue(s, 1, GLOBAL_EFFECT, table) ?? ONE,
    cost: levelCost,
    buy1: globalBuy,
    max: globalBuy,
  };
  const buys = [levels.buy1, ...tiers.map((r) => r.buy1)];
  const anyAffordable = buys.some((b) => b.enabled);
  // The cheapest next purchase is the one x reaches first: the smallest known time.
  const etas = buys.map((b) => b.eta).filter((t): t is number => t !== null);
  return {
    x,
    tiers,
    levels,
    maxAll: {
      shown: revealed.has('maxAll'),
      affordable: anyAffordable,
      enabled: anyAffordable,
      eta: anyAffordable ? 0 : etas.length > 0 ? Math.min(...etas) : null,
    },
  };
}
