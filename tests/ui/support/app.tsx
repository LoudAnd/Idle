// Shared setup for the jsdom UI tests: a game loop on a fake clock with the shell's deriver, a
// save session (GDD §20) on memory storage with a fake channel and a fake wall clock, the App
// rendered around them, and small DOM helpers. Every session made here is disposed after each
// test.
import { act, render } from '@testing-library/preact';
import { afterEach, vi } from 'vitest';
import type { GameState } from '../../../src/engine/state.ts';
import { createErrorHub } from '../../../src/platform/errors.ts';
import type { ErrorHub } from '../../../src/platform/errors.ts';
import { createGameLoop } from '../../../src/platform/loop.ts';
import type { GameLoop } from '../../../src/platform/loop.ts';
import { createSession } from '../../../src/platform/session.ts';
import type { Session, SessionWindow } from '../../../src/platform/session.ts';
import { memoryStorage } from '../../../src/platform/storage.ts';
import type { KeyValueStore, SettingsStore, StorageMode } from '../../../src/platform/storage.ts';
import type { ChannelLike } from '../../../src/platform/tablock.ts';
import { App } from '../../../src/ui/App.tsx';
import { memoryFromIds, memoryToIds } from '../../../src/ui/onboarding.ts';
import { loadSettings } from '../../../src/ui/settings/settings.ts';
import { checkShellView, createShellDeriver } from '../../../src/ui/shell/view.ts';
import type { ShellView } from '../../../src/ui/shell/view.ts';
import { createChannelHub } from '../../unit/support/fakeChannel.ts';
import { createFakeClock } from './fakeClock.ts';

/** The fake wall clock's start: 2026-09-21T14:13:20Z. */
export const WALL_T0 = 1_790_000_000_000;

export interface FakeWall {
  now(): number;
  set(ms: number): void;
  advance(ms: number): void;
}

export function createFakeWall(start = WALL_T0): FakeWall {
  let t = start;
  return {
    now: () => t,
    set: (ms) => void (t = ms),
    advance: (ms) => void (t += ms),
  };
}

const live: (() => void)[] = [];
afterEach(() => {
  for (const d of live.splice(0).reverse()) d();
});

export interface SetupOptions {
  readonly hub?: ErrorHub;
  readonly settingsStore?: SettingsStore;
  /** Wraps the loop before the App gets it (for example to spy on `enqueue`). */
  readonly wrap?: (loop: GameLoop<ShellView>) => GameLoop<ShellView>;
  /** Start the session (or the loop, without one; default true). */
  readonly start?: boolean;
  /** No session at all (the App without saves). */
  readonly session?: false;
  /** The save storage (default: a fresh memory store). */
  readonly storage?: KeyValueStore;
  readonly storageMode?: StorageMode;
  readonly wall?: FakeWall;
  /** The tab lock's channel (default: a fresh fake one; `null` for none). */
  readonly channel?: ChannelLike | null;
  /** The window of autosave, visibility and storage events (default: jsdom's). */
  readonly win?: SessionWindow | null;
  readonly tabId?: string;
  /** Where the App's container is mounted (default: document.body). */
  readonly baseElement?: HTMLElement;
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
  const clock = createFakeClock();
  const hub = opts.hub ?? createErrorHub();
  const wall = opts.wall ?? createFakeWall();
  let session: Session | undefined;
  if (opts.session !== false) {
    session = createSession({
      kv: opts.storage ?? memoryStorage(),
      storageMode: opts.storageMode,
      wall,
      clock,
      hub,
      win: opts.win === undefined ? window : opts.win,
      channel: opts.channel === undefined ? createChannelHub().channel() : opts.channel,
      tabId: opts.tabId,
      gameVersion: '0.4.0',
    });
  }
  const deriver = createShellDeriver(
    session === undefined ? undefined : memoryFromIds(session.loaded.save.onboarding),
  );
  const loop = createGameLoop({
    clock,
    derive: deriver.derive,
    observe: deriver.observe,
    checkView: checkShellView,
    initial: initial ?? session?.loaded.save.game,
    hub,
    onGap: session?.onGap,
  });
  session?.attach(loop, {
    ids: () => memoryToIds(deriver.memory()),
    reset: (ids) => deriver.reset(memoryFromIds(ids)),
  });
  const onReload = vi.fn();
  const used = opts.wrap ? opts.wrap(loop) : loop;
  // As main.tsx does: the settings are loaded once, before the App mounts.
  const initialSettings =
    opts.settingsStore === undefined ? undefined : loadSettings(opts.settingsStore.load()).settings;
  const container =
    opts.baseElement === undefined
      ? undefined
      : opts.baseElement.appendChild(document.createElement('div'));
  const r = render(
    <App
      loop={used}
      shell={deriver}
      session={session}
      onReload={onReload}
      settingsStore={opts.settingsStore}
      initialSettings={initialSettings}
    />,
    container === undefined ? undefined : { container },
  );
  live.push(() => {
    session?.dispose();
    loop.stop();
  });
  if (opts.start !== false) {
    act(() => {
      if (session === undefined) loop.start();
      else void session.start();
    });
  }
  const advance = (ms: number) => act(() => clock.advance(ms));
  return { ...r, clock, loop, deriver, advance, onReload, session, wall, hub };
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
    clearQueue: loop.clearQueue,
    replace: loop.replace,
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

/** The headline x as a number (its visible text, digits only: x below 1e6 in the tests). */
export function readX(container: Element): number {
  const text = shown(container.querySelector('[data-x]'));
  const v = Number(text.replace(/,/g, ''));
  if (!Number.isFinite(v)) throw new Error(`x is not a plain number: ${text}`);
  return v;
}
