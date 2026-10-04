/**
 * The effects pipeline (GDD §21.3). Content declares effects as data; this module folds them
 * into per-tier multipliers m_k.
 *
 * - **Event-constant** effects (`class: 'event'`) change only at discrete events (purchases,
 *   resets, unlocks, upgrades, loadout changes). They are folded into a cached table, which a
 *   purchase marks dirty (`table: null`) and the next query rebuilds.
 * - **State-dependent** effects (`class: 'state'`) are evaluated at the start of every
 *   integration step and held for that step (`stepMultipliers`). That is the only refresh rule.
 *
 * Fold order, per tier: m = ((1 + Σ add) · Π mul) ^ (Π pow), every factor taken in content
 * order, so the result is deterministic. Breakdown rows (`breakdown`) read the same factors, so
 * what is shown is what is computed.
 */
import { ONE, ZERO } from './num.ts';
import type { Num } from './num.ts';
import { SUM_EFFECTS } from './content/sum.ts';
import { map8, tierAt, tierIndex } from './tiers.ts';
import type { Tier, Tuple8 } from './tiers.ts';
import type { GameState } from './state.ts';

export type EffectClass = 'event' | 'state';
export type EffectKind = 'mul' | 'pow' | 'add';
export type EffectTarget = 'tierMult';

export interface EffectDef {
  /** A stable content id, e.g. `sum.beta`. */
  readonly id: string;
  readonly target: EffectTarget;
  readonly tiers: readonly Tier[] | 'all';
  readonly kind: EffectKind;
  readonly class: EffectClass;
  /** The factor for one tier. Pure: reads the state only. */
  readonly value: (s: GameState, tier: Tier) => Num;
  /** A `src/ui/strings.ts` key: the breakdown row's label (GDD §2). */
  readonly label: string;
  /**
   * The values for the label's `{placeholders}` (for example the step i and the A-number of
   * `A000079 a(5)`), from the same state as `value`, so the breakdown row needs nothing outside
   * the table. Pure, like `value`.
   */
  readonly labelParams?: (s: GameState, tier: Tier) => FactorParams;
  /**
   * The Appendix C template id. Only upgrades, milestones, challenges, rewards and achievements
   * have one; the Sum base factors (β, g^L, slot_k) do not.
   */
  readonly templateId?: string;
}

/** Values for a label's `{placeholders}`. */
export type FactorParams = Readonly<Record<string, string | number>>;

/** One evaluated factor of a tier's multiplier (a breakdown row). */
export interface Factor {
  readonly id: string;
  readonly label: string;
  /** The label's placeholder values (empty when the label has none). */
  readonly params: FactorParams;
  readonly kind: EffectKind;
  readonly value: Num;
}

export interface TierEffects {
  /** The fold of the event-constant factors. */
  readonly m: Num;
  /** The event-constant factors, in content order. */
  readonly factors: readonly Factor[];
}

export interface EffectTable {
  /** The content version the table was built for (test effects bump it). */
  readonly contentVersion: number;
  readonly tiers: Tuple8<TierEffects>;
}

// ---------------------------------------------------------------------------------------------
// Content registry. Production content is static; `installTestEffect` adds test-only effects
// and bumps the version, so cached tables built before the change are rebuilt.
// ---------------------------------------------------------------------------------------------

let testEffects: readonly EffectDef[] = [];
let contentVersion = 0;

function allEffects(): readonly EffectDef[] {
  return testEffects.length === 0 ? SUM_EFFECTS : [...SUM_EFFECTS, ...testEffects];
}

function hasStateEffects(): boolean {
  return allEffects().some((e) => e.class === 'state');
}

function applies(e: EffectDef, tier: Tier): boolean {
  return e.tiers === 'all' || e.tiers.includes(tier);
}

const NO_PARAMS: FactorParams = Object.freeze({});

function evaluate(e: EffectDef, s: GameState, tier: Tier): Factor {
  return {
    id: e.id,
    label: e.label,
    params: e.labelParams === undefined ? NO_PARAMS : e.labelParams(s, tier),
    kind: e.kind,
    value: e.value(s, tier),
  };
}

/**
 * TEST-ONLY hook (GDD §21.8): adds an effect after the content effects and returns a function
 * that removes it. Nothing in `src/` except this module may reference it
 * (`tests/arch/test-hooks.test.ts`), so the app bundle tree-shakes it.
 */
export function installTestEffect(def: EffectDef): () => void {
  testEffects = [...testEffects, def];
  contentVersion++;
  let installed = true;
  return () => {
    if (!installed) return;
    installed = false;
    testEffects = testEffects.filter((e) => e !== def);
    contentVersion++;
  };
}

// ---------------------------------------------------------------------------------------------
// Folding
// ---------------------------------------------------------------------------------------------

/** ((1 + Σ add) · Π mul) ^ (Π pow), in the order given. */
export function foldFactors(fs: readonly Factor[]): Num {
  let sumAdd: Num | null = null;
  let mul: Num = ONE;
  let pw: Num | null = null;
  for (const f of fs) {
    if (f.kind === 'mul') mul = mul.mul(f.value);
    else if (f.kind === 'add') sumAdd = (sumAdd ?? ZERO).add(f.value);
    else pw = (pw ?? ONE).mul(f.value);
  }
  let m = sumAdd === null ? mul : ONE.add(sumAdd).mul(mul);
  if (pw !== null) m = m.pow(pw);
  return m;
}

/** Evaluates every event-constant effect for every tier. */
export function buildEventTable(s: GameState): EffectTable {
  const events = allEffects().filter((e) => e.class === 'event');
  return {
    contentVersion,
    tiers: map8((i) => {
      const tier = tierAt(i);
      const factors = events.filter((e) => applies(e, tier)).map((e) => evaluate(e, s, tier));
      return { m: foldFactors(factors), factors };
    }),
  };
}

/** The state's cached table if it is current, otherwise a freshly built one. */
export function effectTable(s: GameState): EffectTable {
  return s.table !== null && s.table.contentVersion === contentVersion
    ? s.table
    : buildEventTable(s);
}

/** The state with a current effect table cached (the same object if it already has one). */
export function withTable(s: GameState): GameState {
  const t = effectTable(s);
  return t === s.table ? s : { ...s, table: t };
}

/** Every factor of one tier, in content order: cached event factors and state factors now. */
function tierFactors(t: EffectTable, s: GameState, tier: Tier): Factor[] {
  const cached = t.tiers[tierIndex(tier)].factors;
  const out: Factor[] = [];
  let next = 0;
  for (const e of allEffects()) {
    if (!applies(e, tier)) continue;
    if (e.class === 'event') {
      const f = cached[next++];
      if (f !== undefined) out.push(f);
    } else {
      out.push(evaluate(e, s, tier));
    }
  }
  return out;
}

/**
 * The multipliers m_1…m_8 for one integration step: the event table, folded with every
 * state-dependent effect evaluated now (once per step and tier). With no state-dependent
 * effects this is the cached table.
 */
export function stepMultipliers(s: GameState, table: EffectTable = effectTable(s)): Tuple8<Num> {
  if (!hasStateEffects()) return map8((i) => table.tiers[i].m);
  return map8((i) => foldFactors(tierFactors(table, s, tierAt(i))));
}

/** The factors of one tier's multiplier, in fold order (for breakdown tooltips, M3). */
export function breakdown(
  s: GameState,
  tier: Tier,
  table: EffectTable = effectTable(s),
): readonly Factor[] {
  return tierFactors(table, s, tier);
}

/**
 * The value of one effect's factor on a tier, read from the same table as production (so what is
 * shown is what is computed, §21.3), or `null` when that effect does not apply to the tier.
 */
export function factorValue(
  s: GameState,
  tier: Tier,
  id: string,
  table: EffectTable = effectTable(s),
): Num | null {
  return breakdown(s, tier, table).find((f) => f.id === id)?.value ?? null;
}
