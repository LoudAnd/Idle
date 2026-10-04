// GDD §20.1, ROADMAP M4 (jsdom): the chrome banners. A throwing localStorage runs the game in
// memory with the storage banner (and Export); a full storage shows "Storage full"; a newer
// save shows the export prompt with the refused blob, verbatim; a load that fell back says from
// where, with Restore backup and Download quarantine.
import { cleanup, fireEvent, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodePlainFrame } from '../../src/engine/save/codec.ts';
import { encodeSave } from '../../src/engine/save/envelope.ts';
import { makeState, serializeState } from '../../src/engine/state.ts';
import { KEYS, openStorage } from '../../src/platform/storage.ts';
import { STRINGS } from '../../src/ui/strings.ts';
import { createStorageArea, throwingStorage } from '../unit/support/fakeStorage.ts';
import { META, sampleSave } from '../unit/support/invalidSaves.ts';
import { WALL_T0, readX, setupApp } from './support/app.tsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const banner = (c: Element, kind: string) => c.querySelector(`[data-banner="${kind}"]`);

describe('chrome banners (GDD §20.1)', () => {
  it('with a localStorage that throws on every call, the game runs and shows the storage banner', async () => {
    const opened = openStorage({ localStorage: throwingStorage() as unknown as Storage });
    expect(opened.mode).toBe('memory');
    const { container, advance } = setupApp(makeState({ x: 10, amounts: [1], bought: [1] }), {
      storage: opened.kv,
      storageMode: opened.mode,
    });
    const b = banner(container, 'memory');
    expect(b?.textContent).toContain(STRINGS['banner.storage']);
    expect(b?.getAttribute('role')).toBe('status');
    const x0 = readX(container);
    advance(2000);
    expect(readX(container)).toBeGreaterThan(x0);
    // Export works from the banner.
    fireEvent.click(b!.querySelector('button[data-action="export"]')!);
    await waitFor(() => {
      const text = b!.querySelector<HTMLTextAreaElement>('[data-export-text]')?.value ?? '';
      expect(text).toMatch(/^ISI1u?:/);
    });
  });

  it('a storage that starts throwing during play switches to memory and shows the banner', () => {
    const area = createStorageArea();
    const kv = area.connect();
    const { container, session, advance } = setupApp(makeState({ amounts: [1], bought: [1] }), {
      storage: kv,
    });
    expect(banner(container, 'memory')).toBeNull();
    kv.throwAll = true;
    advance(100);
    session!.saveNow();
    advance(100);
    expect(banner(container, 'memory')?.textContent).toContain(STRINGS['banner.storage']);
  });

  it('a full storage shows the quota banner, which goes once a save fits again', () => {
    const area = createStorageArea();
    const { container, session, advance } = setupApp(makeState({ amounts: [1], bought: [1] }), {
      storage: area.connect(),
    });
    area.quotaBytes = area.bytes() + 10;
    advance(500);
    expect(session!.saveNow().ok).toBe(false);
    advance(50);
    expect(banner(container, 'quota')?.textContent).toContain(STRINGS['banner.quota']);
    area.quotaBytes = Number.POSITIVE_INFINITY;
    expect(session!.saveNow().ok).toBe(true);
    advance(50);
    expect(banner(container, 'quota')).toBeNull();
  });

  it('a newer save shows the export prompt with the refused blob', () => {
    const area = createStorageArea();
    const blob = encodePlainFrame(
      JSON.stringify({ ...JSON.parse(encodeSave(sampleSave(), META).json), saveVersion: 3 }),
    );
    area.data.set(KEYS.meta, JSON.stringify({ active: 'b', seq: 2, owner: null }));
    area.data.set(KEYS.b, blob);
    const { container } = setupApp(undefined, { storage: area.connect() });
    const b = banner(container, 'newer');
    expect(b?.textContent).toContain(STRINGS['banner.newer']);
    fireEvent.click(b!.querySelector('button[data-action="export"]')!);
    expect(b!.querySelector<HTMLTextAreaElement>('[data-export-text]')!.value).toBe(blob);
    expect(area.data.get(KEYS.b)).toBe(blob);
  });

  it('a load that fell back shows the banner with Restore backup and Download quarantine', () => {
    const area = createStorageArea();
    const backup = { ...sampleSave(), game: makeState({ x: 99, amounts: [9], bought: [9] }) };
    const other = { ...sampleSave(), game: makeState({ x: 55, amounts: [5], bought: [5] }) };
    const at = WALL_T0 - 10 * 60_000;
    area.data.set(KEYS.meta, JSON.stringify({ active: 'a', seq: 2, owner: null }));
    area.data.set(KEYS.a, 'corrupt');
    area.data.set(KEYS.b, encodeSave(other, { ...META, savedAt: at, maxSeenAt: WALL_T0 }).blob);
    area.data.set(KEYS.bak, encodeSave(backup, { ...META, savedAt: at, maxSeenAt: WALL_T0 }).blob);
    const { container, loop } = setupApp(undefined, { storage: area.connect() });
    const b = banner(container, 'fallback');
    expect(b?.textContent).toContain(
      STRINGS['banner.fallback'].replace('{source}', STRINGS['banner.source.other']),
    );
    expect(serializeState({ ...loop.state(), pendingMs: 0, time: 0 })).toBe(
      serializeState({ ...other.game, pendingMs: 0, time: 0 }),
    );
    const quarantine = b!.querySelector<HTMLButtonElement>('button[data-action="quarantine"]');
    expect(quarantine?.textContent).toBe(STRINGS['save.quarantine']);
    expect(area.data.get(KEYS.quarantine)).toBe('corrupt');
    // Restore backup asks first, then loads the backup.
    loop.stop();
    fireEvent.click(b!.querySelector('button[data-action="restore"]')!);
    fireEvent.click(b!.querySelector('button[data-action="confirm"]')!);
    expect(serializeState(loop.state())).toBe(serializeState(backup.game));
  });

  it('a load that fell back to a new game says so', () => {
    const area = createStorageArea();
    area.data.set(KEYS.meta, JSON.stringify({ active: 'a', seq: 2, owner: null }));
    area.data.set(KEYS.a, 'corrupt');
    const { container } = setupApp(undefined, { storage: area.connect() });
    expect(banner(container, 'fallback')?.textContent).toContain(STRINGS['banner.source.new']);
  });

  it('a clean load shows no banner', () => {
    const area = createStorageArea();
    area.data.set(KEYS.a, encodeSave(sampleSave(), META).blob);
    const { container } = setupApp(undefined, { storage: area.connect() });
    expect(container.querySelector('[data-banners]')).toBeNull();
  });
});
