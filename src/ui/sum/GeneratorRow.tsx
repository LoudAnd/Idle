/**
 * A generator row (GDD §17.3):
 *
 * ```
 * Generator 3 | 145 (140 bought) | step 14 · 0/10 ▮▯ term 14 of 34 | ×6.4e4 | +1.2e4/s | Buy 1 · 1e9 ≈ 8s | Until 10 · 3.2e13 ≈ 2m | Max ≈ 8s
 * ```
 *
 * - **Silhouette** (`data-silhouette`, §17.3): from the reveal until the first purchase the row
 *   shows only Buy 1 with its cost and status, dimmed. Its row header stays in the DOM, visually
 *   hidden, so the button's accessible name still starts with "Generator k".
 * - **Buttons** show their status (§17.4, §18): ✓ (with a visually hidden "affordable") and a
 *   solid border when x covers the full price, otherwise `≈ t` (or `—`, read as "never") and a
 *   dashed border
 *   (`data-afford`). A button is enabled whenever it buys at least one, so Until 10 can be
 *   enabled with a dashed border (it buys part of the set, §5.4). Disabled buttons are at 70%.
 * - Each button's accessible name starts with its row header ("Generator 3 Max …"), through
 *   `aria-labelledby`, so names are templated, never literal attributes (§2, §18).
 * - The `×m` cell is the breakdown trigger (`data-breakdown`, a disclosure, §17.4).
 * - New rows fade in once (`fresh` sets `data-reveal` until the fade ends, `SumTab.tsx`).
 * - The buy cells carry `buy-one`, `buy-until` and `buy-max`, so the card layout puts every
 *   row's Buy 1 and Max in the same columns (the global row included).
 * - `paused` (after a fault, §21.8) disables every control.
 */
import type { Action, BuyMode } from '../../engine/actions.ts';
import type { Num as NumValue } from '../../engine/num.ts';
import { formatEta } from '../duration.ts';
import { useFormat } from '../fmt.ts';
import { Num } from '../Num.tsx';
import { STRINGS } from '../strings.ts';
import { fill, fillParts } from '../tpl.ts';
import type { ButtonStatus, GlobalRowView, TierRowView } from './view.ts';

const BUY_ONE: BuyMode = 'one';
const UNTIL_TEN: BuyMode = 'until10';
const BUY_MAX: BuyMode = 'max';
const SPACE = ' ';
const DOT = '· ';
/** The step bar's segments (one per purchase of a step). */
const SEGMENTS = 10;

/** The id of row `key`'s header, the start of every accessible name in the row. */
export const rowHeaderId = (prefix: string, key: string): string => `${prefix}-${key}`;

interface StatusProps {
  readonly status: ButtonStatus;
}

/** ✓ (read as "affordable"), `≈ t`, or `—` (read as "never") (GDD §17.4, §18). */
export function Status({ status }: StatusProps) {
  const { format } = useFormat();
  if (status.affordable) {
    return (
      <span class="status" data-status="yes">
        <span aria-hidden="true">{STRINGS['afford.yes']}</span>
        <span class="sr-only">{STRINGS['afford.sr']}</span>
      </span>
    );
  }
  if (status.eta === null) {
    return (
      <span class="status" data-status="never">
        <span aria-hidden="true">{STRINGS.none}</span>
        <span class="sr-only">{STRINGS['afford.never']}</span>
      </span>
    );
  }
  return (
    <span class="status" data-status="eta">
      {formatEta(status.eta, format)}
    </span>
  );
}

export interface BuyButtonProps {
  /** The id of the row header the accessible name starts with. */
  readonly rowId: string;
  readonly mode: string;
  readonly label: string;
  /** The cost shown after the label, if any. */
  readonly cost?: NumValue;
  readonly status: ButtonStatus;
  readonly paused: boolean;
  readonly onClick: () => void;
}

/** A buy button: "label · cost" and its status, named "<row header> label · cost status". */
export function BuyButton({ rowId, mode, label, cost, status, paused, onClick }: BuyButtonProps) {
  const id = `${rowId}-${mode}`;
  return (
    <button
      type="button"
      id={id}
      class="buy"
      data-mode={mode}
      data-afford={status.affordable ? 'yes' : 'no'}
      aria-labelledby={`${rowId} ${id}`}
      disabled={paused || !status.enabled}
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
      {SPACE}
      <Status status={status} />
    </button>
  );
}

interface StepProps {
  readonly row: TierRowView;
}

/** `step 14 · 3/10`, a bar of the purchases into the step, and `term 14 of 34` (§5.2, §17.3). */
function StepCell({ row }: StepProps) {
  return (
    <td class="step" data-step>
      <span class="step-text">{fill(STRINGS['sum.step'], { i: row.step, j: row.stepFill })}</span>
      <span class="step-bar" aria-hidden="true">
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span key={i} data-on={i < row.stepFill ? '' : undefined} />
        ))}
      </span>
      <span class="term" data-term>
        {fill(STRINGS['slot.term'], { i: row.term, N: row.horizon })}
      </span>
    </td>
  );
}

export interface TierRowProps {
  readonly row: TierRowView;
  readonly idPrefix: string;
  readonly enqueue: (a: Action) => void;
  readonly paused: boolean;
  /** The breakdown of this row is open. */
  readonly open: boolean;
  /** The id of the breakdown panel the trigger controls. */
  readonly panelId: string;
  readonly onBreakdown: () => void;
  /** The row has not finished its reveal fade yet. */
  readonly fresh?: boolean;
  readonly onFaded?: (e: AnimationEvent) => void;
}

export function TierRow({
  row,
  idPrefix,
  enqueue,
  paused,
  open,
  panelId,
  onBreakdown,
  fresh = false,
  onFaded,
}: TierRowProps) {
  const rowId = rowHeaderId(idPrefix, `g${row.tier}`);
  const name = fill(STRINGS['sum.generator'], { k: row.tier });
  const buy = (mode: BuyMode) => () => enqueue({ type: 'buy', tier: row.tier, mode });
  if (row.state === 'silhouette') {
    return (
      <tr
        data-tier={row.tier}
        data-silhouette
        class="row silhouette"
        data-reveal={fresh ? '' : undefined}
        onAnimationEnd={onFaded}
      >
        <th scope="row" id={rowId}>
          <span class="sr-only">{name}</span>
        </th>
        <td class="gap" colSpan={4} />
        <td class="buy-one">
          <BuyButton
            rowId={rowId}
            mode={BUY_ONE}
            label={STRINGS['sum.buy1']}
            cost={row.cost}
            status={row.buy1}
            paused={paused}
            onClick={buy(BUY_ONE)}
          />
        </td>
        <td class="gap" colSpan={2} />
      </tr>
    );
  }
  const triggerId = `${rowId}-mult`;
  return (
    <tr
      data-tier={row.tier}
      class="row"
      data-reveal={fresh ? '' : undefined}
      onAnimationEnd={onFaded}
    >
      <th scope="row" id={rowId}>
        {name}
      </th>
      <td class="amount">
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
      <StepCell row={row} />
      <td data-mult>
        <button
          type="button"
          id={triggerId}
          class="mult"
          data-breakdown
          aria-expanded={open}
          aria-controls={panelId}
          aria-labelledby={`${rowId} ${triggerId}`}
          disabled={paused}
          onClick={onBreakdown}
        >
          {fillParts(STRINGS['sum.mult'], { m: <Num value={row.mult} /> })}
        </button>
      </td>
      <td class="rate" data-production>
        {fillParts(STRINGS['rate.perSecond'], { r: <Num value={row.production} /> })}
      </td>
      <td class="buy-one">
        <BuyButton
          rowId={rowId}
          mode={BUY_ONE}
          label={STRINGS['sum.buy1']}
          cost={row.cost}
          status={row.buy1}
          paused={paused}
          onClick={buy(BUY_ONE)}
        />
      </td>
      <td class="buy-until">
        <BuyButton
          rowId={rowId}
          mode={UNTIL_TEN}
          label={STRINGS['sum.until10']}
          cost={row.untilTenCost}
          status={row.until10}
          paused={paused}
          onClick={buy(UNTIL_TEN)}
        />
      </td>
      <td class="buy-max">
        <BuyButton
          rowId={rowId}
          mode={BUY_MAX}
          label={STRINGS['sum.max']}
          status={row.max}
          paused={paused}
          onClick={buy(BUY_MAX)}
        />
      </td>
    </tr>
  );
}

export interface GlobalRowProps {
  readonly row: GlobalRowView;
  readonly idPrefix: string;
  readonly enqueue: (a: Action) => void;
  readonly paused: boolean;
  /** The row has not finished its reveal fade yet. */
  readonly fresh?: boolean;
  readonly onFaded?: (e: AnimationEvent) => void;
}

/** The global multiplier's row (§5.3): level, ×g^L, Buy 1 and Max; the same silhouette rule. */
export function GlobalRow({
  row,
  idPrefix,
  enqueue,
  paused,
  fresh = false,
  onFaded,
}: GlobalRowProps) {
  const rowId = rowHeaderId(idPrefix, 'global');
  const buyOne = (
    <BuyButton
      rowId={rowId}
      mode={BUY_ONE}
      label={STRINGS['sum.buy1']}
      cost={row.cost}
      status={row.buy1}
      paused={paused}
      onClick={() => enqueue({ type: 'buyGlobal', mode: 'one' })}
    />
  );
  if (row.state === 'silhouette') {
    return (
      <tr
        data-global
        data-silhouette
        class="row silhouette"
        data-reveal={fresh ? '' : undefined}
        onAnimationEnd={onFaded}
      >
        {/* Unlike a tier silhouette (§17.3), the global row keeps its header visible: two
            unlabelled "Buy 1 · 100" buttons would be indistinguishable. */}
        <th scope="row" id={rowId}>
          {STRINGS['sum.global']}
        </th>
        <td class="gap" colSpan={4} />
        <td class="buy-one">{buyOne}</td>
        <td class="gap" colSpan={2} />
      </tr>
    );
  }
  return (
    <tr data-global class="row" data-reveal={fresh ? '' : undefined} onAnimationEnd={onFaded}>
      <th scope="row" id={rowId}>
        {STRINGS['sum.global']}
      </th>
      <td class="amount">
        {fillParts(STRINGS['sum.level'], {
          l: (
            <span data-level>
              <Num value={row.level} />
            </span>
          ),
        })}
      </td>
      <td class="gap" />
      <td data-mult>
        <span class="mult">{fillParts(STRINGS['sum.mult'], { m: <Num value={row.mult} /> })}</span>
      </td>
      <td class="gap" />
      <td class="buy-one">{buyOne}</td>
      <td class="gap" />
      <td class="buy-max">
        <BuyButton
          rowId={rowId}
          mode={BUY_MAX}
          label={STRINGS['sum.max']}
          status={row.max}
          paused={paused}
          onClick={() => enqueue({ type: 'buyGlobal', mode: 'max' })}
        />
      </td>
    </tr>
  );
}
