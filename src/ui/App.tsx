/**
 * The app shell (M2): the header with x, the recovery panel on a fault, and the Sum tab inside
 * its error boundary. M3 replaces this with the real shell (header, tabs, layout).
 *
 * On a fault (GDD §21.8) the last good view stays on screen, paused: every buy control is
 * disabled and the focus moves to the panel's Reload, the only control that still acts.
 */
import { useEffect, useState } from 'preact/hooks';
import type { ErrorHub, Fault } from '../platform/errors.ts';
import type { GameLoop } from '../platform/loop.ts';
import { Num } from './Num.tsx';
import { Recovery, TabBoundary } from './Recovery.tsx';
import { STRINGS } from './strings.ts';
import { SumTab } from './sum/SumTab.tsx';
import type { SumView } from './sum/view.ts';

const TAB_SUM = 'sum';

/** Re-renders on every new view of the loop and returns the current one. */
function useGameView<V>(loop: GameLoop<V>): V | null {
  const [, setVersion] = useState(0);
  useEffect(() => loop.subscribe(() => setVersion((n) => n + 1)), [loop]);
  return loop.view();
}

/** The hub's fault, updated when one is reported. */
function useFault(hub: ErrorHub): Fault | null {
  const [fault, setFault] = useState<Fault | null>(hub.fault);
  useEffect(() => {
    setFault(hub.fault);
    return hub.subscribe(setFault);
  }, [hub]);
  return fault;
}

function reloadPage(): void {
  window.location.reload();
}

export interface AppProps {
  readonly loop: GameLoop<SumView>;
  readonly onReload?: () => void;
}

export function App({ loop, onReload = reloadPage }: AppProps) {
  const view = useGameView(loop);
  const fault = useFault(loop.hub);
  return (
    <main>
      <header>
        {STRINGS['sum.x']}
        {' = '}
        <span data-x>{view !== null && <Num value={view.x} />}</span>
      </header>
      {fault !== null && <Recovery onReload={onReload} focusOnMount />}
      {view !== null && (
        <section data-tab={TAB_SUM} aria-label={STRINGS['tab.sum']}>
          <TabBoundary onReload={onReload}>
            <SumTab view={view} enqueue={loop.enqueue} paused={fault !== null} />
          </TabBoundary>
        </section>
      )}
    </main>
  );
}
