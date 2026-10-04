// Shared setup for the jsdom UI tests: a game loop on a fake clock with the shell's deriver, the
// App rendered around it, and small DOM helpers.
import { act, render } from '@testing-library/preact';
import { vi } from 'vitest';
import type { GameState } from '../../../src/engine/state.ts';
import type { ErrorHub } from '../../../src/platform/errors.ts';
import { createGameLoop } from '../../../src/platform/loop.ts';
import type { GameLoop } from '../../../src/platform/loop.ts';
import type { SettingsStore } from '../../../src/platform/settingsStore.ts';
import { App } from '../../../src/ui/App.tsx';
import { loadSettings } from '../../../src/ui/settings/settings.ts';
import { checkShellView, createShellDeriver } from '../../../src/ui/shell/view.ts';
import type { ShellView } from '../../../src/ui/shell/view.ts';
import { createFakeClock } from './fakeClock.ts';

export interface SetupOptions {
  readonly hub?: ErrorHub;
  readonly settingsStore?: SettingsStore;
  /** Wraps the loop before the App gets it (for example to spy on `enqueue`). */
  readonly wrap?: (loop: GameLoop<ShellView>) => GameLoop<ShellView>;
  /** Start the loop (default true). */
  readonly start?: boolean;
}

export function shellLoop(initial?: GameState, hub?: ErrorHub) {
  const clock = createFakeClock();
  const deriver = createShellDeriver();
  const loop = createGameLoop({
    clock,
    derive: deriver.derive,
    observe: deriver.observe,
    checkView: checkShellView,
    initial,
    hub,
  });
  return { clock, loop, deriver };
}

export function setupApp(initial?: GameState, opts: SetupOptions = {}) {
  const { clock, loop, deriver } = shellLoop(initial, opts.hub);
  const onReload = vi.fn();
  const used = opts.wrap ? opts.wrap(loop) : loop;
  // As main.tsx does: the settings are loaded once, before the App mounts.
  const initialSettings =
    opts.settingsStore === undefined ? undefined : loadSettings(opts.settingsStore.load()).settings;
  const r = render(
    <App
      loop={used}
      shell={deriver}
      onReload={onReload}
      settingsStore={opts.settingsStore}
      initialSettings={initialSettings}
    />,
  );
  if (opts.start !== false) act(() => loop.start());
  const advance = (ms: number) => act(() => clock.advance(ms));
  return { ...r, clock, loop, deriver, advance, onReload };
}

/** A loop whose `enqueue` records the actions instead of queueing them. */
export function spyLoop(loop: GameLoop<ShellView>, sent: unknown[]): GameLoop<ShellView> {
  return {
    hub: loop.hub,
    get running() {
      return loop.running;
    },
    get uiFps() {
      return loop.uiFps;
    },
    state: loop.state,
    view: loop.view,
    subscribe: loop.subscribe,
    enqueue: (a) => {
      sent.push(a);
    },
    setUiFps: loop.setUiFps,
    start: loop.start,
    stop: loop.stop,
  };
}

/** The visible text of a number cell (without the screen-reader form). */
export function shown(el: Element | null): string {
  if (el === null) throw new Error('missing element');
  const visible = el.querySelector('[aria-hidden="true"]');
  return (visible ?? el).textContent ?? '';
}

export function row(container: Element, tier: number): Element {
  const el = container.querySelector(`tr[data-tier="${tier}"]`);
  if (el === null) throw new Error(`no row for G${tier}`);
  return el;
}

export function button(container: Element, selector: string): HTMLButtonElement {
  const el = container.querySelector<HTMLButtonElement>(selector);
  if (el === null) throw new Error(`no button ${selector}`);
  return el;
}

/** The tiers of the rendered generator rows. */
export function tiersShown(container: Element): string[] {
  return [...container.querySelectorAll('tr[data-tier]')].map((r) => r.getAttribute('data-tier')!);
}
