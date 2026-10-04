/**
 * The tab table (GDD §17.2). Each tab appears when its reveal rule first holds (`reveal.ts`) and
 * shows a dot badge until visited. M3 has only Sum, so the tab list is not rendered (a new game
 * shows only the header, the Generator 1 row and Settings); later milestones append their tabs,
 * for example `{ id: 'product', labelKey: 'tab.product', reveal: 'tab.product' }` in M5.
 *
 * Settings is not in this table: it is the header's button (§17.1) and opens its panel in the
 * main area.
 */
import type { RevealId } from '../reveal.ts';
import type { StringKey } from '../strings.ts';

export interface TabDef {
  readonly id: string;
  readonly labelKey: StringKey;
  /** The reveal that shows the tab, or `null` for a tab shown from the start. */
  readonly reveal: RevealId | null;
}

export const TAB_DEFS: readonly TabDef[] = Object.freeze([
  Object.freeze({ id: 'sum', labelKey: 'tab.sum', reveal: null }),
]);

/** The tabs shown for these reveals, in table order. */
export function visibleTabs(
  revealed: ReadonlySet<RevealId> | readonly RevealId[],
  defs: readonly TabDef[] = TAB_DEFS,
): TabDef[] {
  const has = (id: RevealId): boolean =>
    Array.isArray(revealed)
      ? (revealed as readonly RevealId[]).includes(id)
      : (revealed as ReadonlySet<RevealId>).has(id);
  return defs.filter((d) => d.reveal === null || has(d.reveal));
}

/**
 * The mobile bottom bar (§17.6: 5 tabs plus More): the first `n` tabs in the bar, the rest
 * behind More (empty when everything fits). The More menu ships with the first milestone that
 * has more than 5 tabs.
 */
export function splitTabs<T>(items: readonly T[], n = 5): { bar: T[]; more: T[] } {
  return { bar: items.slice(0, n), more: items.slice(n) };
}
