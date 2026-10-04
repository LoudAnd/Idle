/**
 * A WAI-ARIA tablist (GDD §17.2, §18): native buttons with `role="tab"`, a roving `tabindex`
 * (only the selected tab is in the tab order), Arrow Left/Right and Up/Down to move, Home and
 * End, and automatic activation (moving to a tab selects it). A tab with `badge` shows a dot
 * until visited, with a visually hidden "new" for screen readers.
 *
 * It renders nothing for fewer than 2 items: a list with one tab is noise (a new game has only
 * Sum, §17.4). The shell's tabs and the Settings sub-tabs both use it; each panel is labelled by
 * its tab through `tabId` / `panelId`.
 */
import { useRef } from 'preact/hooks';
import { STRINGS } from '../strings.ts';

export interface TabItem {
  readonly id: string;
  readonly label: string;
  /** Shows the dot badge (not visited yet). */
  readonly badge?: boolean;
}

export interface TabsProps {
  readonly items: readonly TabItem[];
  readonly selected: string;
  readonly onSelect: (id: string) => void;
  /** The tablist's accessible name. */
  readonly label: string;
  /** Prefix of the tab and panel ids (unique per tablist). */
  readonly idPrefix: string;
  readonly orientation?: 'horizontal' | 'vertical';
  readonly disabled?: boolean;
}

export const tabId = (prefix: string, id: string): string => `${prefix}-tab-${id}`;
export const panelId = (prefix: string, id: string): string => `${prefix}-panel-${id}`;

const NEXT = new Set(['ArrowRight', 'ArrowDown']);
const PREV = new Set(['ArrowLeft', 'ArrowUp']);

export function Tabs({
  items,
  selected,
  onSelect,
  label,
  idPrefix,
  orientation = 'horizontal',
  disabled = false,
}: TabsProps) {
  const list = useRef<HTMLDivElement>(null);
  if (items.length < 2) return null;
  const at = Math.max(
    0,
    items.findIndex((t) => t.id === selected),
  );
  const move = (to: number): void => {
    const n = items.length;
    const i = ((to % n) + n) % n;
    const item = items[i];
    if (item === undefined) return;
    onSelect(item.id);
    list.current?.querySelectorAll<HTMLElement>('[role="tab"]')[i]?.focus();
  };
  const onKeyDown = (e: KeyboardEvent): void => {
    let to: number | null = null;
    if (NEXT.has(e.key)) to = at + 1;
    else if (PREV.has(e.key)) to = at - 1;
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = items.length - 1;
    if (to === null) return;
    e.preventDefault();
    move(to);
  };
  return (
    <div
      role="tablist"
      aria-label={label}
      aria-orientation={orientation}
      ref={list}
      onKeyDown={onKeyDown}
    >
      {items.map((t, i) => {
        const isSelected = i === at;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={tabId(idPrefix, t.id)}
            aria-selected={isSelected}
            aria-controls={panelId(idPrefix, t.id)}
            tabIndex={isSelected ? 0 : -1}
            data-badge={t.badge === true ? '' : undefined}
            disabled={disabled}
            onClick={() => onSelect(t.id)}
          >
            {t.label}
            {t.badge === true && <span class="sr-only">{STRINGS['tab.new']}</span>}
          </button>
        );
      })}
    </div>
  );
}
