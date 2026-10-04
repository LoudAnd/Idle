/**
 * Start-up (GDD §19, §20, §21.4, §21.9): the optional dev hooks, storage and the settings, the
 * session (which claims the tab, loads the save and computes the offline credit before the loop
 * exists), the shell's deriver with the loaded onboarding memory, the game loop from the loaded
 * state, the App, and then `session.start()` (the catch-up, the first save, the loop and
 * autosave).
 *
 * The dev hooks (`?fixture=&speed=`) exist only where `import.meta.env.DEV` is true or the build
 * sets `VITE_DEV_HOOKS=1` (`npm run build:playtest`): the dynamic import below is the only
 * reference to `platform/devhooks.ts`, and Vite drops it from a production build.
 */
import { render } from 'preact';
import { browserClock, browserWallClock } from './platform/clock.ts';
import { createErrorHub, installGlobalHandlers } from './platform/errors.ts';
import type { Fault } from './platform/errors.ts';
import { GAP_MS, createGameLoop } from './platform/loop.ts';
import { createSession } from './platform/session.ts';
import { createSettingsStore, memoryStorage, openStorage } from './platform/storage.ts';
import { CHANNEL_NAME } from './platform/tablock.ts';
import type { ChannelLike } from './platform/tablock.ts';
import { App } from './ui/App.tsx';
import { memoryFromIds, memoryToIds } from './ui/onboarding.ts';
import { loadSettings } from './ui/settings/settings.ts';
import { checkShellView, createShellDeriver } from './ui/shell/view.ts';
import './ui/fonts.css';
import './ui/theme.css';

function logFault(f: Fault): void {
  console.error('game paused:', f.kind, f.error ?? f.problems);
}

/** The tab lock's channel, where the browser has one (§20.1). */
function openChannel(): ChannelLike | null {
  try {
    return typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL_NAME) : null;
  } catch {
    return null;
  }
}

async function boot(): Promise<void> {
  const frameClock = browserClock(window);
  let clock = frameClock;
  let gapMs = GAP_MS;
  let fixture: string | null = null;
  if (import.meta.env.DEV || import.meta.env.VITE_DEV_HOOKS === '1') {
    const hooks = await import('./platform/devhooks.ts');
    hooks.markDevHooks(document);
    const wanted = hooks.readDevHooks(window.location.search);
    if (wanted !== null) {
      if (wanted.fixture !== null) fixture = await hooks.loadDevFixture(wanted.fixture);
      if (wanted.speed !== 1) {
        clock = hooks.scaledClock(frameClock, wanted.speed);
        gapMs = GAP_MS * wanted.speed;
      }
    }
  }

  const hub = createErrorHub({ onFault: logFault });
  installGlobalHandlers(window, hub);
  const storage = openStorage(window);
  // A fixture session keeps its saves in memory, so it never overwrites the real save (§21.9).
  const session = createSession({
    kv: fixture === null ? storage.kv : memoryStorage(),
    storageMode: fixture === null ? storage.mode : 'storage',
    wall: browserWallClock(),
    clock: frameClock,
    hub,
    win: window,
    channel: fixture === null ? openChannel() : null,
    fixture,
    isolated: fixture !== null,
  });
  const deriver = createShellDeriver(memoryFromIds(session.loaded.save.onboarding));
  const loop = createGameLoop({
    clock,
    derive: deriver.derive,
    // Reveals and goals see every tick's starting state, not only the derived ones (GDD §17.4).
    observe: deriver.observe,
    checkView: checkShellView,
    hub,
    initial: session.loaded.save.game,
    onGap: session.onGap,
    gapMs,
  });
  session.attach(loop, {
    ids: () => memoryToIds(deriver.memory()),
    reset: (ids) => deriver.reset(memoryFromIds(ids)),
  });

  const settingsStore = createSettingsStore(storage.kv);
  // The settings are loaded once, here (GDD §19). The theme and UI fps apply before the first
  // frame, so a light theme never flashes dark; App applies later changes.
  const settings = loadSettings(settingsStore.load()).settings;
  document.documentElement.dataset.theme = settings.theme;
  loop.setUiFps(settings.uiFps);

  const root = document.getElementById('app');
  if (root) {
    render(
      <App
        loop={loop}
        shell={deriver}
        session={session}
        settingsStore={settingsStore}
        initialSettings={settings}
      />,
      root,
    );
    await session.start();
  }
}

boot().catch((e: unknown) => console.error('start failed:', e));
