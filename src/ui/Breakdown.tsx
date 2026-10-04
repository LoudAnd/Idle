/**
 * Breakdown tooltips (GDD §17.4, §21.3): every factor of a tier's multiplier, in fold order,
 * then the multiplier m_k and the production A_k · m_k they give.
 *
 * ```
 * Generator 1 production
 *   23 owned
 *   β 2                 ×2
 *   global 1.15^12      ×5.35
 *   A000079 a(5)        ×32
 *   = ×342
 *   = 7.87e3 /s
 * ```
 *
 * The rows read the effect table production uses (`breakdown()`), and each label is a
 * `strings.ts` template filled from the factor's own `params`, so what is shown is what is
 * computed. A unit test folds the shown factors in log space and checks the result equals
 * log10 m_k within 1e-9 (`tests/unit/support/fold.ts`).
 *
 * A disclosure panel (`SumTab.css`):
 * - from 641 px a popover anchored to its trigger, the row's `×m` button: just below it, its
 *   right edge on the trigger's, so it covers the information columns, never the buy buttons
 *   of the table layout; up to 640 px a bottom sheet;
 * - Escape or Close closes it and returns the focus to the trigger. A pointer press outside the
 *   panel and the trigger closes it too (light dismiss), leaving the focus where the press put
 *   it, so the buy buttons stay one click away. Presses in the page's `<header>` do not count:
 *   its Settings button opens Settings over the breakdown, which is still open beneath it;
 * - it is a dismiss layer (`dismiss.ts`): while Settings is open over it, Escape and outside
 *   presses go to Settings, and the breakdown is still open when Settings closes.
 */
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { useDismissLayer } from './dismiss.ts';
import type { Factor } from '../engine/effects.ts';
import type { Num as NumValue } from '../engine/num.ts';
import { Num } from './Num.tsx';
import { STRINGS, isStringKey } from './strings.ts';
import type { StringKey } from './strings.ts';
import { fill, fillParts } from './tpl.ts';

const KIND_KEY: Readonly<Record<Factor['kind'], StringKey>> = Object.freeze({
  mul: 'factor.mul',
  add: 'factor.add',
  pow: 'factor.pow',
});

/** A factor's label, filled from its params (or `—` for a label that is not a strings key). */
export function factorLabel(f: Factor): string {
  return isStringKey(f.label) ? fill(STRINGS[f.label], f.params) : STRINGS.none;
}

export interface BreakdownProps {
  readonly id: string;
  /** "Generator 3". */
  readonly name: string;
  readonly amount: NumValue;
  readonly factors: readonly Factor[];
  readonly mult: NumValue;
  readonly rate: NumValue;
  /** The id of the trigger the panel is anchored to (the row's `×m` button). */
  readonly anchorId: string;
  /** Closes the panel; `restoreFocus` is false for a press outside it (light dismiss). */
  readonly onClose: (restoreFocus: boolean) => void;
}

/** The gap between the trigger and the popover, in px. */
const GAP_PX = 4;

/**
 * Places the popover under its anchor through `--anchor-top` / `--anchor-left`, relative to the
 * panel's offset parent (`.sum-tab`). The bottom sheet's CSS ignores them.
 */
function anchor(panel: HTMLElement, anchorId: string): void {
  const trigger = document.getElementById(anchorId);
  const host = panel.offsetParent;
  if (trigger === null || host === null) return;
  const t = trigger.getBoundingClientRect();
  const h = host.getBoundingClientRect();
  const width = panel.offsetWidth;
  const left = Math.max(0, Math.min(t.right - h.left - width, h.width - width));
  panel.style.setProperty('--anchor-top', `${Math.round(t.bottom - h.top + GAP_PX)}px`);
  panel.style.setProperty('--anchor-left', `${Math.round(left)}px`);
}

export function Breakdown({
  id,
  name,
  amount,
  factors,
  mult,
  rate,
  anchorId,
  onClose,
}: BreakdownProps) {
  const panel = useRef<HTMLElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const titleId = `${id}-title`;
  useEffect(() => close.current?.focus(), []);
  // Rows above the trigger can change height (a silhouette becomes a row), so re-anchor on every
  // render, and on resize.
  useLayoutEffect(() => {
    if (panel.current !== null) anchor(panel.current, anchorId);
  });
  useEffect(() => {
    const onResize = (): void => {
      if (panel.current !== null) anchor(panel.current, anchorId);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [anchorId]);
  useDismissLayer({
    onEscape: () => onClose(true),
    onPointerDown: (target) => {
      const inside = (el: Element | null): boolean =>
        el !== null && target instanceof Node && el.contains(target);
      if (inside(panel.current) || inside(document.getElementById(anchorId))) return;
      if (target instanceof Element && target.closest('header') !== null) return;
      onClose(false);
    },
  });
  return (
    <section
      id={id}
      ref={panel}
      class="breakdown"
      data-breakdown-panel
      role="region"
      aria-labelledby={titleId}
    >
      <h3 id={titleId}>{fill(STRINGS['breakdown.title'], { name })}</h3>
      <p data-owned>{fillParts(STRINGS['breakdown.owned'], { a: <Num value={amount} /> })}</p>
      <table>
        <tbody>
          {factors.map((f) => (
            <tr key={f.id} data-factor={f.id}>
              <th scope="row">{factorLabel(f)}</th>
              <td>{fillParts(STRINGS[KIND_KEY[f.kind]], { v: <Num value={f.value} /> })}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p data-total>{fillParts(STRINGS['breakdown.mult'], { m: <Num value={mult} /> })}</p>
      <p data-total-rate>{fillParts(STRINGS['breakdown.rate'], { r: <Num value={rate} /> })}</p>
      <button type="button" ref={close} data-close onClick={() => onClose(true)}>
        {STRINGS.close}
      </button>
    </section>
  );
}
