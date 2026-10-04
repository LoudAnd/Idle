/**
 * Player-visible chrome strings and tables (GDD §2). Each entry is at most 32 characters, with
 * `{placeholders}`, and no sentences.
 *
 * M1 added the notation tables that `src/engine/format.ts` takes as a parameter; M2 adds the
 * chrome labels of the first playable screen. This file has no runtime imports, so Node can load
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
 * `fill()` in `tpl.ts`. Content tables in `src/engine/content` reference these keys in their
 * `label:` fields (the `factor.*` rows of the breakdown, M3).
 */
export const STRINGS = {
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
  'sum.col.amount': 'Amount',
  'sum.col.mult': 'Multiplier',
  'sum.col.cost': 'Cost',
  'sum.cite.lambda': 'λ_k = {a}(k−1)',
  'tab.sum': 'Sum',
  'factor.beta': 'β',
  'factor.global': 'global',
  'factor.slot': '{a} a({i})',
  'recovery.title': 'Error',
  'recovery.reload': 'Reload',
} as const satisfies Record<string, string>;

export type StringKey = keyof typeof STRINGS;

/** True when `key` is a `STRINGS` key (content `label:` fields must be). */
export function isStringKey(key: string): key is StringKey {
  return Object.prototype.hasOwnProperty.call(STRINGS, key);
}
