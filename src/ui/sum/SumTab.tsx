/**
 * The Sum tab (GDD §5, §17.3, §17.4): the generator rows that are revealed (`GeneratorRow.tsx`),
 * the global row by the same silhouette rule, Max all once revealed (floating up to 640 px), and
 * at most one open breakdown. The `data-tier`, `data-global`, `data-mode`, `data-amount`,
 * `data-bought` and `data-level` hooks of M2 stay for the playtests.
 *
 * - Column headers come from `strings.ts`; the cost header cites λ's A-number (§5.2).
 * - Max all shows its status like every buy button (§17.3): ✓ when it buys something,
 *   otherwise `≈ t` until the cheapest next purchase of a shown row.
 * - New rows and Max all fade in once (`data-reveal`, 150 ms, §17.4): a row that has finished
 *   its fade never fades again, so showing the tab after Settings does not re-fade every row.
 * - `paused` (after a fault, §21.8) disables every control and closes the breakdown, so the
 *   recovery panel is the only thing that can be acted on.
 * - `SumTab.css` lays the rows out as a table with fixed column widths when the tab is wide
 *   enough (no sideways jumps as numbers grow, §21.4) and as cards otherwise (§17.6: no
 *   horizontal scroll at 375 px).
 */
import { useId, useRef, useState } from 'preact/hooks';
import type { Action } from '../../engine/actions.ts';
import { LAMBDA_ANUMBER } from '../../engine/content/sum.ts';
import type { Tier } from '../../engine/state.ts';
import { Breakdown } from '../Breakdown.tsx';
import { STRINGS } from '../strings.ts';
import { fill } from '../tpl.ts';
import { GlobalRow, Status, TierRow, rowHeaderId } from './GeneratorRow.tsx';
import type { SumView } from './view.ts';
import './SumTab.css';

const MAX_ALL = 'maxAll';
const SEP = ' · ';
const SPACE = ' ';
/** The fade's keyframes (theme.css); only its end marks an element as seen. */
const REVEAL_ANIMATION = 'reveal-in';

/**
 * Fade-once bookkeeping: `fresh(key)` is true until the element's reveal fade has ended
 * (`onFaded`). The set lives as long as the tab is mounted.
 */
function useFadeOnce() {
  const seen = useRef(new Set<string>());
  return {
    fresh: (key: string): boolean => !seen.current.has(key),
    onFaded:
      (key: string) =>
      (e: AnimationEvent): void => {
        if (e.target === e.currentTarget && e.animationName === REVEAL_ANIMATION) {
          seen.current.add(key);
        }
      },
  };
}

export interface SumTabProps {
  readonly view: SumView;
  readonly enqueue: (a: Action) => void;
  /** True after a fault: every control is disabled (the loop ignores actions anyway). */
  readonly paused?: boolean;
}

export function SumTab({ view, enqueue, paused = false }: SumTabProps) {
  const prefix = useId();
  const panelId = `${prefix}-breakdown`;
  const [openTier, setOpenTier] = useState<Tier | null>(null);
  const fade = useFadeOnce();
  const shownTier = paused ? null : openTier;
  const open = shownTier === null ? null : view.tiers[shownTier - 1];
  const triggerId = (tier: Tier): string => `${rowHeaderId(prefix, `g${tier}`)}-mult`;
  const close = (restoreFocus: boolean): void => {
    // Back to the trigger (GDD §18: focus is restored); the row stays mounted. A press outside
    // the panel keeps the focus where the press put it.
    if (restoreFocus && openTier !== null) document.getElementById(triggerId(openTier))?.focus();
    setOpenTier(null);
  };
  const rows = view.tiers.filter((r) => r.state !== 'hidden');
  const maxAll = view.maxAll;
  return (
    <div class="sum-tab" data-paused={paused || undefined}>
      <div class="sum-rows">
        <table class="sum-table">
          <colgroup>
            <col class="c-tier" />
            <col class="c-amount" />
            <col class="c-step" />
            <col class="c-mult" />
            <col class="c-rate" />
            <col class="c-one" />
            <col class="c-until" />
            <col class="c-max" />
          </colgroup>
          <thead>
            <tr>
              <td />
              <th scope="col" class="num-col">
                {STRINGS['sum.col.amount']}
              </th>
              <th scope="col">{STRINGS['sum.col.step']}</th>
              <th scope="col" class="num-col">
                {STRINGS['sum.col.mult']}
              </th>
              <th scope="col" class="num-col">
                {STRINGS['sum.col.rate']}
              </th>
              <th scope="col" colSpan={3}>
                {STRINGS['sum.col.cost']}
                {SEP}
                <span data-cite>{fill(STRINGS['sum.cite.lambda'], { a: LAMBDA_ANUMBER })}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <TierRow
                key={row.tier}
                row={row}
                idPrefix={prefix}
                enqueue={enqueue}
                paused={paused}
                open={shownTier === row.tier}
                panelId={panelId}
                fresh={fade.fresh(`g${row.tier}`)}
                onFaded={fade.onFaded(`g${row.tier}`)}
                onBreakdown={() => setOpenTier((t) => (t === row.tier ? null : row.tier))}
              />
            ))}
            {view.levels.state !== 'hidden' && (
              <GlobalRow
                row={view.levels}
                idPrefix={prefix}
                enqueue={enqueue}
                paused={paused}
                fresh={fade.fresh('global')}
                onFaded={fade.onFaded('global')}
              />
            )}
          </tbody>
        </table>
      </div>
      {maxAll.shown && (
        <p
          class="sum-maxall"
          data-reveal={fade.fresh(MAX_ALL) ? '' : undefined}
          onAnimationEnd={fade.onFaded(MAX_ALL)}
        >
          <button
            type="button"
            class="buy"
            data-mode={MAX_ALL}
            data-afford={maxAll.affordable ? 'yes' : 'no'}
            disabled={paused || !maxAll.enabled}
            onClick={() => enqueue({ type: 'maxAll' })}
          >
            <span class="label">{STRINGS['sum.maxAll']}</span>
            {SPACE}
            <Status status={maxAll} />
          </button>
        </p>
      )}
      {open !== null && open !== undefined && open.state === 'owned' && (
        <Breakdown
          key={open.tier}
          id={panelId}
          name={fill(STRINGS['sum.generator'], { k: open.tier })}
          amount={open.amount}
          factors={open.factors}
          mult={open.mult}
          rate={open.production}
          anchorId={triggerId(open.tier)}
          onClose={close}
        />
      )}
    </div>
  );
}
