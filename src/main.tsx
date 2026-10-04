import { render } from 'preact';
import { browserClock } from './platform/clock.ts';
import { createErrorHub, installGlobalHandlers } from './platform/errors.ts';
import type { Fault } from './platform/errors.ts';
import { createGameLoop } from './platform/loop.ts';
import { browserStorage, createSettingsStore } from './platform/settingsStore.ts';
import { App } from './ui/App.tsx';
import { loadSettings } from './ui/settings/settings.ts';
import { checkShellView, createShellDeriver } from './ui/shell/view.ts';
import './ui/fonts.css';
import './ui/theme.css';

function logFault(f: Fault): void {
  console.error('game paused:', f.kind, f.error ?? f.problems);
}

const hub = createErrorHub({ onFault: logFault });
installGlobalHandlers(window, hub);
const deriver = createShellDeriver();
const loop = createGameLoop({
  clock: browserClock(window),
  derive: deriver.derive,
  // Reveals and goals see every tick's starting state, not only the derived ones (GDD §17.4).
  observe: deriver.observe,
  checkView: checkShellView,
  hub,
});
const settingsStore = createSettingsStore(browserStorage(window));
// The settings are loaded once, here (GDD §19). The theme and UI fps apply before the first
// frame, so a light theme never flashes dark; App applies later changes.
const settings = loadSettings(settingsStore.load()).settings;
document.documentElement.dataset.theme = settings.theme;
loop.setUiFps(settings.uiFps);

const root = document.getElementById('app');
if (root) {
  render(
    <App loop={loop} shell={deriver} settingsStore={settingsStore} initialSettings={settings} />,
    root,
  );
  loop.start();
}
