/**
 * The app shell (GDD §17): the header, the tabs once more than one is revealed, the main panel
 * and the Settings panel, all inside `FormatContext` (the player's Numbers settings).
 *
 * - **Tabs** (§17.2): only Sum exists in M3, so a new game shows the header, the Generator 1 row
 *   and the Settings button, and no tab list. Each tab panel is inside its own error boundary
 *   (§21.8).
 * - **Settings** (§19): the header's button opens the panel in the main area, over the hidden
 *   tab; changes apply at once and are saved through the settings store (`isi.settings`). The
 *   settings are loaded once, by `main.tsx` before the first frame (`initialSettings`), and
 *   written only when the player changes one, so a newer build's payload is kept until then.
 *   The theme is set on `<html data-theme>`, the UI fps on the loop.
 * - **Tab visits** go to the shell's onboarding memory (`shell.visit`), with the reveals and
 *   goals; the badges read `view.visited`.
 * - **Headings** (§18): the header's visually hidden `h1`, then each panel's `h2` (the Sum
 *   tab's is visually hidden and names the panel while there is no tab list).
 * - **Hotkeys** (§18) are installed on `window` for the app's lifetime.
 * - **On a fault** (§21.8) the last good view stays on screen, paused: every control is disabled
 *   and the focus moves to the recovery panel's Reload, the only control that still acts.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'preact/hooks';
import type { ErrorHub, Fault } from '../platform/errors.ts';
import type { GameLoop } from '../platform/loop.ts';
import { createSettingsStore } from '../platform/settingsStore.ts';
import type { SettingsStore } from '../platform/settingsStore.ts';
import { FormatContext } from './fmt.ts';
import { installHotkeys } from './hotkeys.ts';
import { Recovery, TabBoundary } from './Recovery.tsx';
import { SettingsPanel } from './settings/SettingsPanel.tsx';
import { DEFAULT_SETTINGS, formatOptions, settingsBlob } from './settings/settings.ts';
import type { Settings } from './settings/settings.ts';
import { Header } from './shell/Header.tsx';
import { Layout } from './shell/Layout.tsx';
import { Tabs, panelId, tabId } from './shell/Tabs.tsx';
import { visibleTabs } from './shell/tabs.ts';
import type { ShellDeriver, ShellView } from './shell/view.ts';
import { STRINGS } from './strings.ts';
import { SumTab } from './sum/SumTab.tsx';

const TAB_SUM = 'sum';
const TABS_ID = 'tabs';
const SETTINGS_PANEL = 'settings-panel';

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
  readonly loop: GameLoop<ShellView>;
  /** The shell's onboarding memory, which records tab visits (`shell/view.ts`). */
  readonly shell: Pick<ShellDeriver, 'visit'>;
  /** The settings loaded at start (`main.tsx`, `loadSettings`); default: the defaults. */
  readonly initialSettings?: Settings;
  /** Where settings changes are stored (default: memory only). */
  readonly settingsStore?: SettingsStore;
  readonly onReload?: () => void;
}

export function App({
  loop,
  shell,
  initialSettings = DEFAULT_SETTINGS,
  settingsStore,
  onReload = reloadPage,
}: AppProps) {
  const store = useMemo(() => settingsStore ?? createSettingsStore(null), [settingsStore]);
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState(TAB_SUM);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const sumHeading = useId();
  const view = useGameView(loop);
  const fault = useFault(loop.hub);
  const paused = fault !== null;

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);
  useEffect(() => loop.setUiFps(settings.uiFps), [loop, settings.uiFps]);
  useEffect(() => installHotkeys(window, (a) => loop.enqueue(a)), [loop]);

  const format = useMemo(() => formatOptions(settings), [settings]);
  const changeSettings = (next: Settings): void => {
    setSettings(next);
    store.save(settingsBlob(next));
  };
  const closeSettings = (): void => {
    setSettingsOpen(false);
    settingsButton.current?.focus();
  };
  const selectTab = (id: string): void => {
    setSelectedTab(id);
    setSettingsOpen(false);
    shell.visit(id);
  };

  const visited = new Set(view?.visited ?? [TAB_SUM]);
  const tabs = visibleTabs(view?.revealed ?? []);
  const shownTab = tabs.some((t) => t.id === selectedTab) ? selectedTab : TAB_SUM;
  const tabList =
    tabs.length >= 2 ? (
      <Tabs
        items={tabs.map((t) => ({
          id: t.id,
          label: STRINGS[t.labelKey],
          badge: !visited.has(t.id),
        }))}
        selected={shownTab}
        onSelect={selectTab}
        label={STRINGS['tabs.label']}
        idPrefix={TABS_ID}
        orientation="vertical"
        disabled={paused}
      />
    ) : null;
  /** A tab panel's attributes: labelled by its tab, or by its own heading without a tab list. */
  const tabPanel = (id: string, headingId: string) =>
    tabList === null
      ? { 'aria-labelledby': headingId }
      : {
          role: 'tabpanel' as const,
          id: panelId(TABS_ID, id),
          'aria-labelledby': tabId(TABS_ID, id),
        };

  return (
    <FormatContext.Provider value={format}>
      <Layout
        header={
          <Header
            view={view}
            settingsOpen={settingsOpen}
            settingsPanelId={SETTINGS_PANEL}
            onSettings={() => (settingsOpen ? closeSettings() : setSettingsOpen(true))}
            settingsRef={settingsButton}
            paused={paused}
          />
        }
        tabs={tabList}
      >
        {fault !== null && <Recovery onReload={onReload} focusOnMount />}
        {settingsOpen && (
          <TabBoundary onReload={onReload}>
            <SettingsPanel
              id={SETTINGS_PANEL}
              settings={settings}
              onChange={changeSettings}
              onClose={closeSettings}
              paused={paused}
            />
          </TabBoundary>
        )}
        {/* The tab stays mounted (hidden) under Settings, so closing Settings neither re-fades
            its rows nor loses its open breakdown. */}
        {view !== null && shownTab === TAB_SUM && (
          <section data-tab={TAB_SUM} hidden={settingsOpen} {...tabPanel(TAB_SUM, sumHeading)}>
            <h2 id={sumHeading} class="sr-only">
              {STRINGS['tab.sum']}
            </h2>
            <TabBoundary onReload={onReload}>
              <SumTab view={view.sum} enqueue={loop.enqueue} paused={paused} />
            </TabBoundary>
          </section>
        )}
      </Layout>
    </FormatContext.Provider>
  );
}
