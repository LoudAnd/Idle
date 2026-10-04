// @vitest-environment node
// GDD §19, §20.1: the save store. A/B slots with a meta flip after a verified write, the hourly
// backup, the owner check, the quota and memory fallbacks, the load order with quarantine, and
// hard reset (exactly six keys, settings kept).
import { describe, expect, it } from 'vitest';
import { encodePlainFrame } from '../../src/engine/save/codec.ts';
import { encodeSave } from '../../src/engine/save/envelope.ts';
import type { EnvelopeMeta } from '../../src/engine/save/envelope.ts';
import { makeState, serializeState } from '../../src/engine/state.ts';
import {
  BACKUP_INTERVAL_MS,
  KEYS,
  RESET_KEYS,
  createSaveStore,
  isQuotaError,
  memoryStorage,
  openStorage,
} from '../../src/platform/storage.ts';
import { createStorageArea, throwingStorage } from './support/fakeStorage.ts';
import { INVALID_JSON, META, sampleSave } from './support/invalidSaves.ts';

const ME = 'tab-me';
const T0 = META.savedAt;

/** A save blob whose state is identified by x and whose envelope says `savedAt`. */
function blobAt(x: number, savedAt = T0): string {
  const meta: EnvelopeMeta = { ...META, savedAt, maxSeenAt: savedAt };
  return encodeSave({ ...sampleSave(), game: makeState({ x }) }, meta).blob;
}

function setup(quotaBytes?: number) {
  const area = createStorageArea({ quotaBytes });
  const kv = area.connect();
  const store = createSaveStore(kv, { ownerId: ME });
  return { area, kv, store };
}

const xOf = (r: ReturnType<ReturnType<typeof createSaveStore>['load']>) =>
  r.kind === 'ok' ? r.save.game.sum.x.toNumber() : null;

describe('writing (GDD §20.1 write sequence)', () => {
  it('writes the inactive slot, verifies it, then flips meta; slots alternate', () => {
    const { area, store } = setup();
    expect(store.write(blobAt(1), T0)).toEqual({ ok: true, slot: 'a', backup: true });
    expect(JSON.parse(area.data.get(KEYS.meta)!)).toEqual({ active: 'a', seq: 1, owner: ME });
    expect(store.write(blobAt(2, T0 + 1000), T0 + 1000)).toMatchObject({ ok: true, slot: 'b' });
    expect(JSON.parse(area.data.get(KEYS.meta)!)).toEqual({ active: 'b', seq: 2, owner: ME });
    expect(store.write(blobAt(3, T0 + 2000), T0 + 2000)).toMatchObject({ ok: true, slot: 'a' });
    expect(xOf(store.load())).toBe(3);
    expect(store.lastGood()).toBe(area.data.get(KEYS.a));
  });

  it('the backup takes a verified blob at most once per hour of savedAt', () => {
    const { area, store } = setup();
    const first = blobAt(1);
    store.write(first, T0);
    expect(area.data.get(KEYS.bak)).toBe(first);
    store.write(blobAt(2, T0 + BACKUP_INTERVAL_MS - 1), T0 + BACKUP_INTERVAL_MS - 1);
    expect(area.data.get(KEYS.bak)).toBe(first);
    const later = blobAt(3, T0 + BACKUP_INTERVAL_MS);
    expect(store.write(later, T0 + BACKUP_INTERVAL_MS)).toMatchObject({ ok: true, backup: true });
    expect(area.data.get(KEYS.bak)).toBe(later);
    expect(store.backup()).toEqual({ blob: later, savedAt: T0 + BACKUP_INTERVAL_MS });
  });

  it('a write from a non-owner is refused and storage is unchanged', () => {
    const { area, store } = setup();
    store.write(blobAt(1), T0);
    area.data.set(KEYS.meta, JSON.stringify({ active: 'a', seq: 1, owner: 'tab-other' }));
    const before = area.snapshot();
    expect(store.write(blobAt(2), T0)).toEqual({ ok: false, reason: 'notOwner' });
    expect(area.snapshot()).toEqual(before);
    expect(store.isOwner(ME)).toBe(false);
    expect(store.isOwner('tab-other')).toBe(true);
  });

  it('a blob that does not decode is refused after the read-back, and meta is not flipped', () => {
    const { area, store } = setup();
    store.write(blobAt(1), T0);
    const meta = area.data.get(KEYS.meta);
    expect(store.write('ISI1u:e30:00000000', T0)).toEqual({ ok: false, reason: 'verify' });
    expect(area.data.get(KEYS.meta)).toBe(meta);
    expect(xOf(store.load())).toBe(1);
  });

  it('QuotaExceededError above the byte limit keeps the previous slot active; a retry succeeds once there is room', () => {
    const { area, store } = setup();
    store.write(blobAt(1), T0);
    const before = area.snapshot();
    // Room for what is there now, but not for a second slot.
    area.quotaBytes = area.bytes() + 100;
    expect(store.write(blobAt(2), T0)).toEqual({ ok: false, reason: 'quota' });
    expect(store.status.quota).toBe(true);
    expect(area.snapshot()).toEqual(before);
    expect(JSON.parse(area.data.get(KEYS.meta)!).active).toBe('a');
    expect(xOf(store.load())).toBe(1);
    // Room again: the next write goes through and clears the flag.
    area.quotaBytes = Number.POSITIVE_INFINITY;
    expect(store.write(blobAt(2), T0)).toMatchObject({ ok: true, slot: 'b' });
    expect(store.status.quota).toBe(false);
    expect(xOf(store.load())).toBe(2);
  });

  it('a storage that breaks (not the quota) carries on in memory', () => {
    const area = createStorageArea();
    const kv = area.connect();
    const store = createSaveStore(kv, { ownerId: ME });
    store.write(blobAt(1), T0);
    kv.throwAll = true;
    expect(store.write(blobAt(2), T0)).toMatchObject({ ok: true });
    expect(store.status.mode).toBe('memory');
    expect(xOf(store.load())).toBe(2);
  });

  it('claimOwner keeps the slot fields; without meta it names no slot', () => {
    const { area, store } = setup();
    expect(store.claimOwner(ME)).toBe(true);
    expect(JSON.parse(area.data.get(KEYS.meta)!)).toEqual({ active: null, seq: 0, owner: ME });
    store.write(blobAt(1), T0);
    store.write(blobAt(2), T0);
    expect(store.claimOwner('tab-new')).toBe(true);
    expect(JSON.parse(area.data.get(KEYS.meta)!)).toEqual({
      active: 'b',
      seq: 2,
      owner: 'tab-new',
    });
  });
});

describe('loading (GDD §20.1 load order)', () => {
  it('a first run is empty and did not fall back', () => {
    const { store } = setup();
    expect(store.load()).toEqual({ kind: 'empty', fellBack: false, quarantined: null });
    store.claimOwner(ME);
    expect(store.load()).toEqual({ kind: 'empty', fellBack: false, quarantined: null });
  });

  it('falls back active → other slot → backup → new game, quarantining the first failure', () => {
    const { area, store } = setup();
    area.data.set(KEYS.meta, JSON.stringify({ active: 'b', seq: 5, owner: null }));
    area.data.set(KEYS.b, blobAt(3));
    area.data.set(KEYS.a, blobAt(2));
    area.data.set(KEYS.bak, blobAt(1));
    expect(store.load()).toMatchObject({ kind: 'ok', source: 'active', fellBack: false });
    area.data.set(KEYS.b, 'garbage');
    let r = store.load();
    expect(r).toMatchObject({
      kind: 'ok',
      source: 'other',
      fellBack: true,
      quarantined: 'garbage',
    });
    expect(xOf(r)).toBe(2);
    expect(area.data.get(KEYS.quarantine)).toBe('garbage');
    area.data.set(KEYS.a, 'garbage 2');
    r = store.load();
    expect(r).toMatchObject({ kind: 'ok', source: 'backup', fellBack: true });
    expect(xOf(r)).toBe(1);
    // The first failure of a load (the active slot's) is the one kept.
    expect(area.data.get(KEYS.quarantine)).toBe('garbage');
    area.data.set(KEYS.bak, 'garbage 3');
    expect(store.load()).toEqual({ kind: 'empty', fellBack: true, quarantined: 'garbage' });
  });

  it('a missing active slot is a fallback too', () => {
    const { area, store } = setup();
    area.data.set(KEYS.meta, JSON.stringify({ active: 'b', seq: 5, owner: null }));
    area.data.set(KEYS.a, blobAt(2));
    expect(store.load()).toMatchObject({ kind: 'ok', source: 'other', fellBack: true });
  });

  it('without a usable meta, the slot with the higher savedAt goes first (a on a tie)', () => {
    const { area, store } = setup();
    area.data.set(KEYS.a, blobAt(1, T0));
    area.data.set(KEYS.b, blobAt(2, T0 + 5));
    expect(xOf(store.load())).toBe(2);
    area.data.set(KEYS.meta, '{broken');
    expect(xOf(store.load())).toBe(2);
    area.data.set(KEYS.b, blobAt(2, T0));
    expect(xOf(store.load())).toBe(1);
    expect(store.load()).toMatchObject({ fellBack: false });
  });

  it.each(INVALID_JSON.map(([name]) => name))(
    'an invalid blob goes to quarantine and the next source loads: %s',
    (name) => {
      const json = INVALID_JSON.find(([n]) => n === name)![1];
      const { area, store } = setup();
      const bad = encodePlainFrame(json);
      area.data.set(KEYS.meta, JSON.stringify({ active: 'a', seq: 2, owner: null }));
      area.data.set(KEYS.a, bad);
      area.data.set(KEYS.b, blobAt(7));
      const r = store.load();
      expect(r).toMatchObject({ kind: 'ok', source: 'other', fellBack: true, quarantined: bad });
      expect(xOf(r)).toBe(7);
      expect(area.data.get(KEYS.quarantine)).toBe(bad);
      // The bad blob itself is left where it was (nothing is repaired or deleted).
      expect(area.data.get(KEYS.a)).toBe(bad);
    },
  );

  it('a newer save stops the load: no fallback past newer progress', () => {
    const { area, store } = setup();
    const newer = encodePlainFrame(
      JSON.stringify({ ...JSON.parse(encodeSave(sampleSave(), META).json), saveVersion: 2 }),
    );
    area.data.set(KEYS.meta, JSON.stringify({ active: 'a', seq: 2, owner: null }));
    area.data.set(KEYS.a, newer);
    area.data.set(KEYS.b, blobAt(7));
    expect(store.load()).toEqual({
      kind: 'newer',
      blob: newer,
      saveVersion: 2,
      source: 'active',
      fellBack: false,
      quarantined: null,
    });
    expect(area.data.has(KEYS.quarantine)).toBe(false);
  });

  it('a loaded save is the stored state, byte for byte', () => {
    const { store } = setup();
    const save = sampleSave();
    store.write(encodeSave(save, META).blob, T0);
    const r = store.load();
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(serializeState(r.save.game)).toBe(serializeState(save.game));
  });
});

describe('hard reset (GDD §19)', () => {
  it('hard reset removes exactly a, b, bak, quarantine, meta and stats.samples and keeps settings', () => {
    const area = createStorageArea();
    const kv = area.connect();
    const store = createSaveStore(kv, { ownerId: ME });
    for (const k of RESET_KEYS) area.data.set(k, 'x');
    area.data.set(KEYS.settings, '{"settingsVersion":1,"values":{}}');
    area.data.set('other.app', 'kept');
    kv.calls.length = 0;
    store.hardReset();
    const removed = kv.calls.filter((c) => c.op === 'removeItem').map((c) => c.key);
    expect(new Set(removed)).toEqual(
      new Set([
        'isi.save.a',
        'isi.save.b',
        'isi.save.bak',
        'isi.save.quarantine',
        'isi.save.meta',
        'isi.stats.samples',
      ]),
    );
    expect(removed).toHaveLength(6);
    expect(kv.calls.filter((c) => c.op === 'setItem')).toEqual([]);
    expect(area.snapshot()).toEqual({
      'isi.settings': '{"settingsVersion":1,"values":{}}',
      'other.app': 'kept',
    });
    expect(store.lastGood()).toBeNull();
  });
});

describe('opening storage (GDD §20.1 fallback)', () => {
  it('a throwing localStorage getter or getItem gives memory storage', () => {
    const getter = {
      get localStorage(): Storage {
        throw new DOMException('denied', 'SecurityError');
      },
    };
    expect(openStorage(getter).mode).toBe('memory');
    expect(openStorage({ localStorage: throwingStorage() as unknown as Storage }).mode).toBe(
      'memory',
    );
    expect(openStorage(null).mode).toBe('memory');
    const ok = memoryStorage() as unknown as Storage;
    expect(openStorage({ localStorage: ok })).toEqual({ kv: ok, mode: 'storage' });
  });

  it('a store on a throwing storage never throws', () => {
    const store = createSaveStore(throwingStorage(), { ownerId: ME });
    expect(store.load()).toEqual({ kind: 'empty', fellBack: false, quarantined: null });
    expect(store.lastGood()).toBeNull();
    expect(store.backup()).toBeNull();
    expect(store.quarantined()).toBeNull();
    expect(() => store.hardReset()).not.toThrow();
  });

  it('isQuotaError knows the browsers’ names and codes', () => {
    expect(isQuotaError(new DOMException('x', 'QuotaExceededError'))).toBe(true);
    expect(isQuotaError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true);
    expect(isQuotaError({ code: 22 })).toBe(true);
    expect(isQuotaError(new DOMException('x', 'SecurityError'))).toBe(false);
    expect(isQuotaError(new Error('x'))).toBe(false);
    expect(isQuotaError(null)).toBe(false);
  });
});
