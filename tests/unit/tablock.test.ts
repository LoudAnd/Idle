// @vitest-environment node
// GDD §20.1: the one-active-tab lock at the platform level, on two independent jsdom windows
// that share one fake storage and one fake BroadcastChannel: the newer tab owns, a newer hello
// makes a tab yield, an older hello is answered, the storage-event fallback works without a
// channel, a lost message cannot break the lock (owner checks), and "Use here" moves ownership.
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it } from 'vitest';
import { KEYS, createSaveStore } from '../../src/platform/storage.ts';
import { createTabLock, isNewer, newTabId } from '../../src/platform/tablock.ts';
import type { TabLock } from '../../src/platform/tablock.ts';
import { createChannelHub } from './support/fakeChannel.ts';
import type { ChannelHub } from './support/fakeChannel.ts';
import { createStorageArea } from './support/fakeStorage.ts';
import type { StorageArea } from './support/fakeStorage.ts';
import { sampleBlob } from './support/invalidSaves.ts';

let disposers: (() => void)[] = [];
afterEach(() => {
  for (const d of disposers) d();
  disposers = [];
});

interface Tab {
  readonly lock: TabLock;
  readonly store: ReturnType<typeof createSaveStore>;
  readonly lost: number[];
  readonly win: Window;
}

function tab(area: StorageArea, hub: ChannelHub | null, id: string, startedAt: number): Tab {
  const win = new JSDOM('', { url: 'https://isi.test/' }).window;
  const store = createSaveStore(area.connect(win), { ownerId: id });
  const lost: number[] = [];
  const lock = createTabLock({
    id,
    startedAt,
    channel: hub === null ? null : hub.channel(),
    store,
    win,
    onLost: () => lost.push(startedAt),
  });
  // As the session does: claim the save, then announce.
  store.claimOwner(id);
  lock.announce();
  disposers.push(() => lock.dispose());
  return { lock, store, lost, win };
}

describe('the tab lock (GDD §20.1)', () => {
  it('newer means a higher startedAt, then a higher id', () => {
    expect(isNewer({ id: 'a', startedAt: 2 }, { id: 'z', startedAt: 1 })).toBe(true);
    expect(isNewer({ id: 'b', startedAt: 1 }, { id: 'a', startedAt: 1 })).toBe(true);
    expect(isNewer({ id: 'a', startedAt: 1 }, { id: 'a', startedAt: 1 })).toBe(false);
    expect(newTabId()).not.toBe(newTabId());
    expect(newTabId({})).toMatch(/^[0-9a-z]+-[0-9a-z]+-[0-9a-z]+$/);
  });

  it('the newer tab owns; the older one yields on its hello and cannot write', () => {
    const area = createStorageArea();
    const hub = createChannelHub();
    const older = tab(area, hub, 'tab-1', 1000);
    hub.deliver();
    expect(older.lock.owner).toBe(true);
    expect(older.store.write(sampleBlob(), 1)).toMatchObject({ ok: true });
    const newer = tab(area, hub, 'tab-2', 2000);
    hub.deliver();
    expect(newer.lock.owner).toBe(true);
    expect(older.lock.owner).toBe(false);
    expect(older.lost).toHaveLength(1);
    const before = area.snapshot();
    expect(older.store.write(sampleBlob(), 2)).toEqual({ ok: false, reason: 'notOwner' });
    expect(area.snapshot()).toEqual(before);
    expect(newer.store.write(sampleBlob(), 2)).toMatchObject({ ok: true });
  });

  it('an older hello is answered, so a tab that announces late still learns it must stop', () => {
    const area = createStorageArea();
    const hub = createChannelHub();
    const newer = tab(area, hub, 'tab-2', 2000);
    // The older tab's hello arrives after the newer one's (it was slow to start).
    const olderWin = new JSDOM('', { url: 'https://isi.test/' }).window;
    const olderStore = createSaveStore(area.connect(olderWin), { ownerId: 'tab-1' });
    let olderLost = 0;
    const older = createTabLock({
      id: 'tab-1',
      startedAt: 1000,
      channel: hub.channel(),
      store: olderStore,
      win: olderWin,
      onLost: () => olderLost++,
    });
    disposers.push(() => older.dispose());
    hub.drop(); // the newer tab's first hello was lost
    older.announce();
    hub.deliver(); // the newer tab answers it
    expect(older.owner).toBe(false);
    expect(olderLost).toBe(1);
    expect(newer.lock.owner).toBe(true);
  });

  it('without BroadcastChannel, storage events on meta make the older tab yield', () => {
    const area = createStorageArea();
    const older = tab(area, null, 'tab-1', 1000);
    expect(older.lock.owner).toBe(true);
    const newer = tab(area, null, 'tab-2', 2000);
    // The newer tab's claim of meta.owner reached the older window as a storage event.
    expect(older.lock.owner).toBe(false);
    expect(newer.lock.owner).toBe(true);
    expect(older.store.write(sampleBlob(), 1)).toEqual({ ok: false, reason: 'notOwner' });
  });

  it('a lost message cannot break the lock: the write checks and recheck() hold it', () => {
    const area = createStorageArea();
    const hub = createChannelHub();
    // No storage events reach the older tab (its window is not connected) and its hello is lost.
    const olderStore = createSaveStore(area.connect(), { ownerId: 'tab-1' });
    let lost = 0;
    const older = createTabLock({
      id: 'tab-1',
      startedAt: 1000,
      channel: hub.channel(),
      store: olderStore,
      win: null,
      onLost: () => lost++,
    });
    disposers.push(() => older.dispose());
    olderStore.claimOwner('tab-1');
    tab(area, hub, 'tab-2', 2000);
    hub.drop();
    expect(older.owner).toBe(true); // it has not heard
    expect(olderStore.write(sampleBlob(), 1)).toEqual({ ok: false, reason: 'notOwner' });
    expect(older.recheck()).toBe(false);
    expect(lost).toBe(1);
  });

  it('Use here moves ownership: a start time newer than every tab seen', () => {
    const area = createStorageArea();
    const hub = createChannelHub();
    const a = tab(area, hub, 'tab-1', 1000);
    const b = tab(area, hub, 'tab-2', 5000);
    hub.deliver();
    expect([a.lock.owner, b.lock.owner]).toEqual([false, true]);
    // Tab 1's clock is behind tab 2's start: it still becomes the newest.
    a.lock.reclaim(3000);
    hub.deliver();
    expect([a.lock.owner, b.lock.owner]).toEqual([true, false]);
    expect(JSON.parse(area.data.get(KEYS.meta)!).owner).toBe('tab-1');
    expect(a.store.write(sampleBlob(), 3)).toMatchObject({ ok: true });
    expect(b.store.write(sampleBlob(), 3)).toEqual({ ok: false, reason: 'notOwner' });
    // And back again.
    b.lock.reclaim(6000);
    hub.deliver();
    expect([a.lock.owner, b.lock.owner]).toEqual([false, true]);
    expect(b.lost).toHaveLength(1);
    expect(a.lost).toHaveLength(2);
  });

  it('a disposed lock ignores messages and closes its channel', () => {
    const area = createStorageArea();
    const hub = createChannelHub();
    const a = tab(area, hub, 'tab-1', 1000);
    a.lock.dispose();
    tab(area, hub, 'tab-2', 2000);
    hub.deliver();
    expect(a.lost).toEqual([]);
    expect(() => a.lock.announce()).not.toThrow();
  });
});
