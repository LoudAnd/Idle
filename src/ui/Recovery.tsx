/**
 * The recovery panel and the per-tab error boundary (GDD §21.8).
 *
 * - `Recovery` is the panel: its title and Reload (labels from `strings.ts`). M4 adds Export
 *   current and Export last good. On a fault the panel takes the focus (`focusOnMount`), since
 *   the rest of the screen is paused.
 * - `TabBoundary` wraps one tab panel. A render error inside it replaces only that panel with
 *   the recovery panel; it is logged, and the game loop keeps running.
 */
import { Component } from 'preact';
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { STRINGS } from './strings.ts';

const RELOAD = 'reload';

export interface RecoveryProps {
  readonly onReload: () => void;
  /** Moves the focus to Reload when the panel opens. */
  readonly focusOnMount?: boolean;
}

export function Recovery({ onReload, focusOnMount = false }: RecoveryProps) {
  const reload = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focusOnMount) reload.current?.focus();
  }, [focusOnMount]);
  return (
    <section role="alert" data-recovery>
      <h2>{STRINGS['recovery.title']}</h2>
      <button type="button" data-action={RELOAD} ref={reload} onClick={onReload}>
        {STRINGS['recovery.reload']}
      </button>
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
