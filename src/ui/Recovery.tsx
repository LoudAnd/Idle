/**
 * The recovery panel and the per-tab error boundary (GDD §21.8).
 *
 * - `Recovery` is the panel: its title, Export current (the in-memory state, marked
 *   unverified: it may be the very state that failed), Export last good (the last saved blob,
 *   byte for byte; disabled when there is none) and Reload (labels from `strings.ts`). Each
 *   export opens an `ExportBox` with Copy and Download. On a fault the panel takes the focus
 *   (`focusOnMount`) on Reload, since the rest of the screen is paused.
 * - `TabBoundary` wraps one tab panel. A render error inside it replaces only that panel with
 *   the recovery panel; it is logged, and the game loop keeps running.
 */
import { Component } from 'preact';
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { ExportBox } from './settings/ExportBox.tsx';
import { STRINGS } from './strings.ts';
import { fill } from './tpl.ts';

const RELOAD = 'reload';

export interface RecoveryProps {
  readonly onReload: () => void;
  /** Moves the focus to Reload when the panel opens. */
  readonly focusOnMount?: boolean;
  /** The in-memory state as a save text, unverified (GDD §21.8). */
  readonly exportCurrent?: () => string;
  /** The last good save, byte for byte, or `null` when there is none. */
  readonly exportLastGood?: () => string | null;
}

type Shown = { readonly which: 'current' | 'lastGood'; readonly text: string } | null;

export function Recovery({
  onReload,
  focusOnMount = false,
  exportCurrent,
  exportLastGood,
}: RecoveryProps) {
  const reload = useRef<HTMLButtonElement>(null);
  const [shown, setShown] = useState<Shown>(null);
  useEffect(() => {
    if (focusOnMount) reload.current?.focus();
  }, [focusOnMount]);
  const lastGood = exportLastGood?.() ?? null;
  return (
    <section role="alert" data-recovery>
      <h2>{STRINGS['recovery.title']}</h2>
      <div class="save-actions">
        {exportCurrent !== undefined && (
          <button
            type="button"
            data-action="export-current"
            onClick={() => setShown({ which: 'current', text: exportCurrent() })}
          >
            {STRINGS['recovery.exportCurrent']}
          </button>
        )}
        {exportLastGood !== undefined && (
          <button
            type="button"
            data-action="export-last-good"
            disabled={lastGood === null}
            onClick={() => {
              const text = exportLastGood();
              if (text !== null) setShown({ which: 'lastGood', text });
            }}
          >
            {STRINGS['recovery.exportLastGood']}
          </button>
        )}
        <button type="button" data-action={RELOAD} ref={reload} onClick={onReload}>
          {STRINGS['recovery.reload']}
        </button>
      </div>
      {shown !== null && (
        <ExportBox
          label={
            shown.which === 'current'
              ? STRINGS['recovery.unverified']
              : STRINGS['recovery.exportLastGood']
          }
          text={shown.text}
          filename={fill(STRINGS[shown.which === 'current' ? 'file.current' : 'file.save'], {
            t: Date.now(),
          })}
        />
      )}
    </section>
  );
}

export interface TabBoundaryProps {
  readonly children?: ComponentChildren;
  readonly onReload: () => void;
}

interface TabBoundaryState {
  readonly failed: boolean;
}

export class TabBoundary extends Component<TabBoundaryProps, TabBoundaryState> {
  override state: TabBoundaryState = { failed: false };

  static override getDerivedStateFromError(): TabBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    console.error(error);
  }

  override render() {
    return this.state.failed ? <Recovery onReload={this.props.onReload} /> : this.props.children;
  }
}
