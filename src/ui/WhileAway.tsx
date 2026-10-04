/**
 * Offline progress (GDD §20.2): the progress modal while a catch-up runs, then the "While away"
 * summary with the before and after values of x and of each generator that is owned or
 * revealed.
 *
 * - `OfflineProgress`: a dialog with a progressbar labelled "Catching up" (pieces done of all).
 * - `WhileAway`: a dialog labelled "While away" that shows the credited time ("+2.00h") and a
 *   Before/After table. Close takes the focus when it opens; Escape or Close dismiss it (a
 *   dismiss layer, `dismiss.ts`) and return the focus to where it was. Focus trapping comes with
 *   M16's accessibility pass.
 */
import { useEffect, useId, useRef } from 'preact/hooks';
import type { AwaySummary } from '../platform/session.ts';
import { TIERS, tierIndex } from '../engine/state.ts';
import type { Tier } from '../engine/state.ts';
import { useDismissLayer } from './dismiss.ts';
import { formatDuration } from './duration.ts';
import { useFormat } from './fmt.ts';
import { Num } from './Num.tsx';
import type { RevealId } from './reveal.ts';
import { STRINGS } from './strings.ts';
import { fill } from './tpl.ts';
import './WhileAway.css';

export interface OfflineProgressProps {
  readonly progress: { readonly done: number; readonly total: number };
}

export function OfflineProgress({ progress }: OfflineProgressProps) {
  const id = useId();
  const pct = progress.total > 0 ? Math.floor((100 * progress.done) / progress.total) : 0;
  return (
    <div class="modal-backdrop" data-modal>
      <div class="modal" role="dialog" aria-modal={true} aria-labelledby={id} data-offline-progress>
        <h2 id={id}>{STRINGS['away.progress']}</h2>
        <div
          class="modal-bar"
          role="progressbar"
          aria-labelledby={id}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <span style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

/** The tiers the summary shows: owned before or after, revealed, and always Generator 1. */
export function awayTiers(summary: AwaySummary, revealed: readonly RevealId[]): Tier[] {
  return TIERS.filter((k) => {
    const i = tierIndex(k);
    return (
      k === 1 ||
      summary.before.bought[i] > 0 ||
      summary.after.bought[i] > 0 ||
      revealed.includes(`tier.${k}` as RevealId)
    );
  });
}

export interface WhileAwayProps {
  readonly summary: AwaySummary;
  /** The reveals so far (the shell view's), for the generator rows. */
  readonly revealed: readonly RevealId[];
  readonly onClose: () => void;
  /**
   * Where the focus goes back to on close: the element that had it before the catch-up
   * disabled the controls (default: whatever had it when this opened).
   */
  readonly returnFocus?: Element | null;
}

export function WhileAway({ summary, revealed, onClose, returnFocus = null }: WhileAwayProps) {
  const id = useId();
  const { format } = useFormat();
  const close = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(null);
  useEffect(() => {
    opener.current = document.activeElement;
    close.current?.focus();
  }, []);
  const dismiss = (): void => {
    const back = returnFocus ?? opener.current;
    onClose();
    if (back instanceof HTMLElement && back.isConnected && back !== document.body) back.focus();
  };
  useDismissLayer({ onEscape: dismiss });
  const tiers = awayTiers(summary, revealed);
  return (
    <div class="modal-backdrop" data-modal>
      <div class="modal" role="dialog" aria-modal={true} aria-labelledby={id} data-while-away>
        <h2 id={id}>{STRINGS['away.title']}</h2>
        <p data-away-time>
          {fill(STRINGS['away.time'], { t: formatDuration(summary.seconds, format) })}
        </p>
        <table class="away-table">
          <thead>
            <tr>
              <td />
              <th scope="col">{STRINGS['away.before']}</th>
              <th scope="col">{STRINGS['away.after']}</th>
            </tr>
          </thead>
          <tbody>
            <tr data-row="x">
              <th scope="row">{STRINGS['sum.x']}</th>
              <td data-before>
                <Num value={summary.before.x} />
              </td>
              <td data-after>
                <Num value={summary.after.x} />
              </td>
            </tr>
            {tiers.map((k) => (
              <tr key={k} data-row={`g${k}`}>
                <th scope="row">{fill(STRINGS['sum.generator'], { k })}</th>
                <td data-before>
                  <Num value={summary.before.amounts[tierIndex(k)]} />
                </td>
                <td data-after>
                  <Num value={summary.after.amounts[tierIndex(k)]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          <button type="button" data-close ref={close} onClick={dismiss}>
            {STRINGS.close}
          </button>
        </p>
      </div>
    </div>
  );
}
