/**
 * Player-visible chrome strings and tables (GDD §2). Each entry is at most 32 characters, with
 * `{placeholders}`, and no sentences; every code point is in the shipped font subsets or the
 * fallback allowlist (§16.5). `tests/arch/strings.test.ts` and `tests/arch/glyphs.test.ts`
 * enforce both, and `tests/arch/templates.test.ts` checks that every key that is an Appendix C
 * id (`slot.term`) holds exactly its template.
 *
 * M1 added the notation tables that `src/engine/format.ts` takes as a parameter; M2 the chrome
 * labels of the first playable screen; M3 the shell, the onboarding framework (Next goal,
 * breakdown, time-to-afford) and Settings. This file has no runtime imports, so Node can load
 * it directly.
 */
import type { NotationTables } from '../engine/format.ts';

/** Standard suffixes (GDD §4.2) and the spoken-form words. */
export const NOTATION_TABLES = {
  standard: {
    first: ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No'],
    units: ['', 'U', 'D', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No'],
    tens: ['', 'Dc', 'Vg', 'Tg', 'Qag', 'Qig', 'Sxg', 'Spg', 'Ocg', 'Nog'],
    hundred: 'Ce',
  },
  spoken: { timesTenToThe: 'times ten to the', tenToThe: 'ten to the' },
} as const satisfies NotationTables;

/**
 * Chrome labels and templates (GDD §2), keyed by id. `{name}` placeholders are filled by
 * `fill()` / `fillParts()` in `tpl.ts`. Content tables in `src/engine/content` reference these
 * keys in their `label:` fields (the `factor.*` rows of the breakdown).
 */
export const STRINGS = {
  // The page's heading (GDD §18; index.html's title, `tests/arch/html.test.ts`).
  'game.title': 'Integer Sequence Idle',
  // The Sum tab (M2) and its generator rows (M3, GDD §17.3).
  'sum.generator': 'Generator {k}',
  'sum.buy1': 'Buy 1',
  'sum.until10': 'Until 10',
  'sum.max': 'Max',
  'sum.maxAll': 'Max all',
  'sum.global': 'Global',
  'sum.x': 'x',
  'sum.amount': '{a} ({b} bought)',
  'sum.level': 'level {l}',
  'sum.mult': '×{m}',
  'sum.step': 'step {i} · {j}/10',
  'sum.col.amount': 'Amount',
  'sum.col.step': 'Step',
  'sum.col.mult': 'Multiplier',
  'sum.col.rate': 'Production',
  'sum.col.cost': 'Cost',
  'sum.cite.lambda': 'λ_k = {a}(k−1)',
  // Appendix C (GDD §5.2): the data horizon of a tier's curve.
  'slot.term': 'term {i} of {N}',
  // The header (GDD §17.1).
  'rate.perSecond': '+{r}/s',
  'header.growth': '×10^{y} /min',
  'header.growthSr': 'times ten to the {y} per minute',
  'header.goal': 'Next goal',
  'header.settings': 'Settings',
  // The Next goal chip (GDD §17.1).
  'goal.chip': '{goal} · {pct}%',
  'goal.buy': 'Buy G{k}',
  'goal.reach2': 'Reach 2^{n}',
  // Affordability and time-to-afford (GDD §17.4, §18).
  'afford.yes': '✓',
  'afford.sr': 'affordable',
  'afford.never': 'never',
  'time.approx': '≈ {t}',
  'time.s': '{n}s',
  'time.m': '{n}m',
  'time.h': '{n}h',
  'time.d': '{n}d',
  none: '—',
  // Breakdown tooltips (GDD §17.4, §21.3).
  'breakdown.title': '{name} production',
  'breakdown.owned': '{a} owned',
  'breakdown.mult': '= ×{m}',
  'breakdown.rate': '= {r} /s',
  'factor.beta': 'β {b}',
  'factor.global': 'global {g}^{l}',
  'factor.slot': '{a} a({i})',
  'factor.mul': '×{v}',
  'factor.add': '+{v}',
  'factor.pow': '^{v}',
  close: 'Close',
  // Tabs (GDD §17.2).
  'tabs.label': 'Tabs',
  'tab.new': 'new',
  'tab.sum': 'Sum',
  'tab.settings': 'Settings',
  // Settings (GDD §19).
  'settings.numbers': 'Numbers',
  'settings.display': 'Display',
  'settings.notation': 'Notation',
  'settings.precision': 'Precision',
  'settings.intThreshold': 'Integer threshold',
  'settings.intOption': '1e{e}',
  'settings.theme': 'Theme',
  'settings.uiFps': 'UI fps',
  'notation.scientific': 'Scientific',
  'notation.engineering': 'Engineering',
  'notation.logarithm': 'Logarithm',
  'notation.standard': 'Standard',
  'theme.dark': 'Dark',
  'theme.light': 'Light',
  // Recovery (GDD §21.8).
  'recovery.title': 'Error',
  'recovery.reload': 'Reload',
} as const satisfies Record<string, string>;

export type StringKey = keyof typeof STRINGS;

/** True when `key` is a `STRINGS` key (content `label:` fields must be). */
export function isStringKey(key: string): key is StringKey {
  return Object.prototype.hasOwnProperty.call(STRINGS, key);
}
