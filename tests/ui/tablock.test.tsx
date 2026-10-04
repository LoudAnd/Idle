// GDD §20.1, ROADMAP M4 (jsdom): two game instances sharing one fake storage and one fake
// BroadcastChannel. Only the newer one ticks and saves; the older one shows "Open in another
// tab" with its controls disabled; "Use here" moves ownership and reloads the latest save; a
// write from a non-owner is refused. The same suite runs without a channel (storage events).
import { act, cleanup, fireEvent } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { decodeSave } from '../../src/engine/save/envelope.ts';
import { makeState, serializeState } from '../../src/engine/state.ts';
import type { SessionWindow } from '../../src/platform/session.ts';
import { KEYS } from '../../src/platform/storage.ts';
import { STRINGS } from '../../src/ui/strings.ts';
import { createChannelHub } from '../unit/support/fakeChannel.ts';
import type { ChannelHub } from '../unit/support/fakeChannel.ts';
import { createStorageArea } from '../unit/support/fakeStorage.ts';
import type { StorageArea, StorageEventTarget } from '../unit/support/fakeStorage.ts';
import { createFakeWall, setupApp } from './support/app.tsx';
import type { FakeWall } from './support/app.tsx';

afterEach(() => {
  cleanup();
});

/** A tab's own window for storage and page events; timers and the document are jsdom's. */
function tabWindow(): SessionWindow & StorageEventTarget {
  const events = new EventTarget();
  return {
    document,
    setInterval: (fn: () => void, ms: number) => window.setInterval(fn, ms),
    clearInterval: (id: number | undefined) => window.clearInterval(id),
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
    Event,
  } as unknown as SessionWindow & StorageEventTarget;
}

/** Runs a session call inside act, so its re-render happens before the next assertion. */
function inAct<T>(f: () => T): T {
  let out: T | undefined;
  act(() => {
    out = f();
  });
  return out as T;
}

/**
 * A tab, started and settled: a tab that opens after another one has saved is credited the
 * time since that save (§20.2), so its first frames run that short catch-up.
 */
async function tab(area: StorageArea, hub: ChannelHub | null, wall: FakeWall, id: string) {
  const win = tabWindow();
  const ctx = setupApp(makeState({ x: 10, amounts: [2], bought: [2] }), {
    storage: area.connect(win),
    channel: hub === null ? null : hub.channel(),
    win,
    wall,
    tabId: id,
  });
  await act(async () => {
    hub?.deliver();
    ctx.clock.advance(100);
  });
  return ctx;
}

const banner = (c: Element) => c.querySelector('[data-banner="tab"]');
const stored = (area: StorageArea) => {
  const meta = JSON.parse(area.data.get(KEYS.meta)!) as { active: 'a' | 'b'; owner: string };
  const r = decodeSave(area.data.get(KEYS[meta.active]));
  if (r.kind !== 'ok') throw new Error('no save');
  return { owner: meta.owner, game: r.save.game };
};

describe.each([
  ['with BroadcastChannel', true],
  ['with storage events only', false],
])('the one-active-tab lock (GDD §20.1), %s', (_name, withChannel) => {
  async function two() {
    const area = createStorageArea();
    const hub = withChannel ? createChannelHub() : null;
    const wall = createFakeWall();
    const older = await tab(area, hub, wall, 'tab-old');
    wall.advance(1000);
    const newer = await tab(area, hub, wall, 'tab-new');
    return { area, hub, wall, older, newer };
  }

  it('only the newer instance ticks and saves', async () => {
    const { area, older, newer } = await two();
    const olderTime = older.loop.state().time;
    older.advance(3000);
    newer.advance(3000);
    expect(older.loop.running).toBe(false);
    expect(older.loop.state().time).toBe(olderTime);
    expect(newer.loop.running).toBe(true);
    expect(newer.loop.state().time).toBeGreaterThan(2);
    expect(inAct(() => newer.session!.saveNow())).toEqual({ ok: true });
    expect(stored(area).owner).toBe('tab-new');
    expect(serializeState(stored(area).game)).toBe(serializeState(newer.loop.state()));
  });

  it('the older one shows Open in another tab, with its game controls disabled', async () => {
    const { older, newer } = await two();
    older.advance(100);
    expect(banner(older.container)?.textContent).toContain(STRINGS['banner.tab']);
    expect(banner(newer.container)).toBeNull();
    const controls = [...older.container.querySelectorAll<HTMLButtonElement>('[data-tab] button')];
    expect(controls.length).toBeGreaterThan(0);
    for (const c of controls) expect(c.disabled).toBe(true);
    expect(older.container.querySelector<HTMLButtonElement>('[data-settings]')!.disabled).toBe(
      true,
    );
    const useHere = banner(older.container)!.querySelector<HTMLButtonElement>('button')!;
    expect(useHere.textContent).toBe(STRINGS['banner.useHere']);
    expect(useHere.disabled).toBe(false);
  });

  it('a write from a non-owner is refused and storage is unchanged', async () => {
    const { area, older } = await two();
    const before = area.snapshot();
    expect(inAct(() => older.session!.saveNow())).toEqual({ ok: false, reason: 'notOwner' });
    expect(area.snapshot()).toEqual(before);
  });

  it('Use here moves ownership and reloads the latest save', async () => {
    const { area, hub, older, newer } = await two();
    // The newer tab plays and saves progress the older tab never saw.
    newer.advance(5000);
    act(() => newer.loop.enqueue({ type: 'maxAll' }));
    newer.advance(100);
    inAct(() => newer.session!.saveNow());
    const latest = serializeState(stored(area).game);
    expect(serializeState(older.loop.state())).not.toBe(latest);
    await act(async () => {
      fireEvent.click(banner(older.container)!.querySelector('button')!);
    });
    await act(async () => {
      hub?.deliver();
      older.clock.advance(50);
      newer.clock.advance(50);
    });
    // Ownership moved: the older tab plays from the newer tab's save, the newer one yields.
    expect(older.loop.running).toBe(true);
    expect(newer.loop.running).toBe(false);
    expect(banner(older.container)).toBeNull();
    expect(banner(newer.container)?.textContent).toContain(STRINGS['banner.tab']);
    expect(stored(area).owner).toBe('tab-old');
    expect(older.loop.state().sum.bought).toEqual(stored(area).game.sum.bought);
    // It saved at once, from the newer tab's save: the same progress, now owned by it.
    expect(serializeState(stored(area).game)).toBe(latest);
    expect(inAct(() => newer.session!.saveNow())).toEqual({ ok: false, reason: 'notOwner' });
  });
});

describe('the lock survives a lost message (GDD §20.1)', () => {
  it('the older tab that missed the hello is refused at its next write and yields', async () => {
    const area = createStorageArea();
    const hub = createChannelHub();
    const wall = createFakeWall();
    // The older tab's window gets no storage events and the newer tab's hello is lost.
    const older = setupApp(makeState({ amounts: [1], bought: [1] }), {
      storage: area.connect(),
      channel: hub.channel(),
      win: tabWindow(),
      wall,
      tabId: 'tab-old',
    });
    wall.advance(1000);
    const newer = setupApp(makeState({ amounts: [1], bought: [1] }), {
      storage: area.connect(),
      channel: hub.channel(),
      win: tabWindow(),
      wall,
      tabId: 'tab-new',
    });
    hub.drop();
    await act(async () => {
      newer.clock.advance(100); // the newer tab's 1 s catch-up
    });
    older.advance(1000);
    expect(older.loop.running).toBe(true); // it has not heard
    const before = area.snapshot();
    expect(inAct(() => older.session!.saveNow())).toEqual({ ok: false, reason: 'notOwner' });
    expect(area.snapshot()).toEqual(before);
    older.advance(100);
    expect(older.loop.running).toBe(false);
    expect(banner(older.container)).not.toBeNull();
    expect(newer.loop.running).toBe(true);
  });
});
