/**
 * The Sum tab (GDD §5, M2): plain rows of amount (with the bought count, §17.3), multiplier,
 * Buy 1, Until 10 and Max; the global level; Max all; x. M3 replaces the rows with the full
 * generator row (§17.3) and the reveal rule (§17.4); the `data-tier`, `data-mode`, `data-x`,
 * `data-amount`, `data-bought` and `data-level` hooks stay for the playtests.
 *
 * - Column headers come from `strings.ts`; the cost header cites λ's A-number (§5.2).
 * - Each button's accessible name starts with its row's header ("Generator 3 Max"), through
 *   `aria-labelledby`, so the names are templated, never literal attributes (§2, §18).
 * - `paused` (after a fault, §21.8) disables every buy control, so the recovery panel is the only
 *   thing that can be acted on.
 * - `SumTab.css` gives the columns fixed widths (no sideways jumps as numbers grow) and turns
 *   rows into 2-line cards below 640 px (§17.6: no horizontal scroll at 375 px).
 */
import { useId } from 'preact/hooks';
import type { Action, BuyMode } from '../../engine/actions.ts';
import { LAMBDA_ANUMBER } from '../../engine/content/sum.ts';
import type { Num as NumValue } from '../../engine/num.ts';
import { Num } from '../Num.tsx';
import { STRINGS } from '../strings.ts';
import { fill, fillParts } from '../tpl.ts';
import type { GlobalRowView, SumView, TierRowView } from './view.ts';
import './SumTab.css';

const BUY_ONE: BuyMode = 'one';
const UNTIL_TEN: BuyMode = 'until10';
const BUY_MAX: BuyMode = 'max';
const MAX_ALL = 'maxAll';
const SEP = ' · ';
const SPACE = ' ';
const DOT = '· ';

export interface SumTabProps {
  readonly view: SumView;
  readonly enqueue: (a: Action) => void;
  /** True after a fault: every control is disabled (the loop ignores actions anyway). */
  readonly paused?: boolean;
}

interface BuyButtonProps {
  /** The id of the row header the accessible name starts with. */
  readonly rowId: string;
  readonly mode: string;
  readonly label: string;
  /** The cost shown after the label, if any. */
  readonly cost?: NumValue;
  readonly disabled: boolean;
  readonly onClick: () => void;
}

/** A buy button: "label · cost", named "<row header> label · cost" for screen readers. */
function BuyButton({ rowId, mode, label, cost, disabled, onClick }: BuyButtonProps) {
  const id = `${rowId}-${mode}`;
  return (
    <button
      type="button"
      id={id}
      data-mode={mode}
      aria-labelledby={`${rowId} ${id}`}
      disabled={disabled}
      onClick={onClick}
    >
      <span class="label">{label}</span>
      {cost !== undefined && (
        <>
          {/* The one wrap point: "Until 10" / "· 2.47e38", never the dot alone. */}
          {SPACE}
          <span class="cost">
            {DOT}
            <Num value={cost} />
          </span>
        </>
      )}
    </button>
  );
}

interface RowProps<R> {
  readonly row: R;
  readonly enqueue: (a: Action) => void;
  readonly paused: boolean;
}

function TierRow({ row, enqueue, paused }: RowProps<TierRowView>) {
  const rowId = `${useId()}-g${row.tier}`;
  const off = paused || !row.affordable;
  const buy = (mode: BuyMode) => () => enqueue({ type: 'buy', tier: row.tier, mode });
  return (
    <tr data-tier={row.tier}>
      <th scope="row" id={rowId}>
        {fill(STRINGS['sum.generator'], { k: row.tier })}
      </th>
      <td>
        {fillParts(STRINGS['sum.amount'], {
          a: (
            <span data-amount>
              <Num value={row.amount} />
            </span>
          ),
          b: (
            <span data-bought>
              <Num value={row.bought} />
            </span>
          ),
        })}
      </td>
      <td data-mult>{fillParts(STRINGS['sum.mult'], { m: <Num value={row.mult} /> })}</td>
      <td>
        <BuyButton
          rowId={rowId}
          mode={BUY_ONE}
          label={STRINGS['sum.buy1']}
          cost={row.cost}
          disabled={off}
          onClick={buy(BUY_ONE)}
        />
      </td>
      <td>
        <BuyButton
          rowId={rowId}
          mode={UNTIL_TEN}
          label={STRINGS['sum.until10']}
          cost={row.untilTenCost}
          disabled={off}
          onClick={buy(UNTIL_TEN)}
        />
      </td>
      <td>
        <BuyButton
          rowId={rowId}
          mode={BUY_MAX}
          label={STRINGS['sum.max']}
          disabled={off}
          onClick={buy(BUY_MAX)}
        />
      </td>
    </tr>
  );
}

function GlobalRow({ row, enqueue, paused }: RowProps<GlobalRowView>) {
  const rowId = `${useId()}-global`;
  const off = paused || !row.affordable;
  return (
    <tr data-global>
      <th scope="row" id={rowId}>
        {STRINGS['sum.global']}
      </th>
      <td>
        {fillParts(STRINGS['sum.level'], {
          l: (
            <span data-level>
              <Num value={row.level} />
            </span>
          ),
        })}
      </td>
      <td data-mult>{fillParts(STRINGS['sum.mult'], { m: <Num value={row.mult} /> })}</td>
      <td>
        <BuyButton
          rowId={rowId}
          mode={BUY_ONE}
          label={STRINGS['sum.buy1']}
          cost={row.cost}
          disabled={off}
          onClick={() => enqueue({ type: 'buyGlobal', mode: 'one' })}
        />
      </td>
      <td />
      <td>
        <BuyButton
          rowId={rowId}
          mode={BUY_MAX}
          label={STRINGS['sum.max']}
          disabled={off}
          onClick={() => enqueue({ type: 'buyGlobal', mode: 'max' })}
        />
      </td>
    </tr>
  );
}

export function SumTab({ view, enqueue, paused = false }: SumTabProps) {
  return (
    <div class="sum-tab" data-paused={paused || undefined}>
      <table>
        <colgroup>
          <col class="c-tier" />
          <col class="c-amount" />
          <col class="c-mult" />
          <col class="c-one" />
          <col class="c-until" />
          <col class="c-max" />
        </colgroup>
        <thead>
          <tr>
            <td />
            <th scope="col">{STRINGS['sum.col.amount']}</th>
            <th scope="col">{STRINGS['sum.col.mult']}</th>
            <th scope="col" colSpan={3}>
              {STRINGS['sum.col.cost']}
              {SEP}
              <span data-cite>{fill(STRINGS['sum.cite.lambda'], { a: LAMBDA_ANUMBER })}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {view.tiers.map((row) => (
            <TierRow key={row.tier} row={row} enqueue={enqueue} paused={paused} />
          ))}
          <GlobalRow row={view.levels} enqueue={enqueue} paused={paused} />
        </tbody>
      </table>
      <p>
        <button
          type="button"
          data-mode={MAX_ALL}
          disabled={paused || !view.anyAffordable}
          onClick={() => enqueue({ type: 'maxAll' })}
        >
          {STRINGS['sum.maxAll']}
        </button>
      </p>
      <p data-tab-x>
        {STRINGS['sum.x']}
        {' = '}
        <Num value={view.x} />
      </p>
    </div>
  );
}
