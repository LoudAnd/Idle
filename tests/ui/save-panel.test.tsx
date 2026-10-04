// GDD §19, §20.1, ROADMAP M4 (jsdom): the Save panel. Save now; Export with Copy (select-all
// fallback when the Clipboard API rejects) and Download; Import by paste and from a file, where
// garbage changes nothing and a valid export re-imports exactly after confirmation; Restore
// backup with its timestamp; Download quarantine byte for byte; Hard reset only with RESET typed.
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodePlainFrame } from '../../src/engine/save/codec.ts';
import { encodeSave } from '../../src/engine/save/envelope.ts';
import { makeState, newGame, serializeState } from '../../src/engine/state.ts';
import { KEYS } from '../../src/platform/storage.ts';
import { formatTimestamp } from '../../src/ui/duration.ts';
import { STRINGS } from '../../src/ui/strings.ts';
import { createStorageArea } from '../unit/support/fakeStorage.ts';
import type { StorageArea } from '../unit/support/fakeStorage.ts';
import { META, sampleSave } from '../unit/support/invalidSaves.ts';
import { WALL_T0, createFakeWall, setupApp } from './support/app.tsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (navigator as { clipboard?: unknown }).clipboard;
});

const growing = () => makeState({ x: 1e6, amounts: [1e3, 2], bought: [12, 2], globalLevel: 3 });

function openSave(container: Element): Element {
  fireEvent.click(container.querySelector('[data-settings]')!);
  fireEvent.click(screen.getByRole('tab', { name: STRINGS['settings.save'] }));
  const panel = container.querySelector('[data-save-panel]');
  if (panel === null) throw new Error('no Save panel');
  return panel;
}

const act$ = (panel: Element, name: string) =>
  panel.querySelector<HTMLButtonElement>(`button[data-action="${name}"]`)!;

function setup(area: StorageArea = createStorageArea(), initial = growing()) {
  const ctx = setupApp(initial, { storage: area.connect(), wall: createFakeWall() });
  ctx.advance(200);
  return { ...ctx, area, panel: openSave(ctx.container) };
}

async function exportNow(panel: Element): Promise<string> {
  fireEvent.click(act$(panel, 'export'));
  const box = await waitFor(() => {
    const el = panel.querySelector<HTMLTextAreaElement>('[data-export-text]');
    if (el === null || el.value === '') throw new Error('no export yet');
    return el;
  });
  return box.value;
}

async function paste(panel: Element, text: string): Promise<void> {
  const area = panel.querySelector<HTMLTextAreaElement>('[data-import-text]')!;
  fireEvent.input(area, { target: { value: text } });
  fireEvent.click(act$(panel, 'import'));
  await waitFor(() => {
    const status = panel.querySelector('[data-import-status]')!.textContent;
    const confirm = panel.querySelector('[data-confirm]');
    if (status === '' && confirm === null) throw new Error('import pending');
  });
}

const importStatus = (panel: Element) => panel.querySelector('[data-import-status]')!.textContent;

describe('the Save panel (GDD §19)', () => {
  it('Save now saves and says Saved', () => {
    const { panel, area } = setup();
    const before = area.data.get(KEYS.meta);
    fireEvent.click(act$(panel, 'save'));
    expect(panel.querySelector('[data-save-status]')!.textContent).toBe(STRINGS['save.saved']);
    expect(area.data.get(KEYS.meta)).not.toBe(before);
    expect(act$(panel, 'save').getAttribute('role')).toBeNull();
  });

  it('importing garbage leaves the state and storage untouched', async () => {
    const { panel, area, loop, advance } = setup();
    loop.stop();
    const state = serializeState(loop.state());
    const stored = area.snapshot();
    const cases: [string, string][] = [
      ['garbage', STRINGS['save.notASave']],
      [encodePlainFrame('{"not":"a save"}'), STRINGS['save.invalid']],
      [
        encodeSave(sampleSave(), META).blob.replace(/:[0-9a-f]{8}$/, ':00000000'),
        STRINGS['save.invalid'],
      ],
      [
        encodePlainFrame(
          JSON.stringify({ ...JSON.parse(encodeSave(sampleSave(), META).json), saveVersion: 7 }),
        ),
        STRINGS['save.newer'],
      ],
    ];
    for (const [text, message] of cases) {
      await paste(panel, text);
      expect(importStatus(panel)).toBe(message);
      expect(panel.querySelector('[data-confirm]')).toBeNull();
      advance(100);
      expect(serializeState(loop.state())).toBe(state);
      expect(area.snapshot()).toEqual(stored);
    }
  });

  it('a valid export re-imports exactly by paste', async () => {
    const { panel, loop, advance, area } = setup();
    const text = await exportNow(panel);
    expect(text.startsWith('ISI1:')).toBe(true);
    const exported = serializeState(loop.state());
    // Play on: the state moves away from the export.
    advance(3000);
    act(() => loop.enqueue({ type: 'maxAll' }));
    advance(100);
    expect(serializeState(loop.state())).not.toBe(exported);
    await paste(panel, text);
    // Nothing changes before Confirm; Cancel keeps it so.
    const playing = serializeState(loop.state());
    fireEvent.click(act$(panel, 'cancel'));
    expect(serializeState(loop.state())).toBe(playing);
    await paste(panel, text);
    loop.stop();
    fireEvent.click(act$(panel, 'confirm'));
    expect(serializeState(loop.state())).toBe(exported);
    expect(importStatus(panel)).toBe(STRINGS['save.imported']);
    // It was saved at once.
    const meta = JSON.parse(area.data.get(KEYS.meta)!) as { active: 'a' | 'b' };
    const r = (await import('../../src/engine/save/envelope.ts')).decodeSave(
      area.data.get(KEYS[meta.active]),
    );
    expect(r.kind === 'ok' && serializeState(r.save.game)).toBe(exported);
  });

  it('a valid export re-imports exactly from a file', async () => {
    const { panel, loop, advance } = setup();
    const text = await exportNow(panel);
    const exported = serializeState(loop.state());
    advance(5000);
    const input = panel.querySelector<HTMLInputElement>('[data-import-file]')!;
    expect(input.type).toBe('file');
    expect(input.accept).toBe('.txt,text/plain');
    const file = new File([text], 'isi-save.txt', { type: 'text/plain' });
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    fireEvent.change(input);
    await waitFor(() => {
      if (panel.querySelector('[data-confirm]') === null) throw new Error('no confirm yet');
    });
    loop.stop();
    fireEvent.click(act$(panel, 'confirm'));
    expect(serializeState(loop.state())).toBe(exported);
  });

  it('Copy uses the Clipboard API, and selects all of the text when it rejects', async () => {
    const { panel } = setup();
    const text = await exportNow(panel);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    fireEvent.click(act$(panel, 'copy'));
    await waitFor(() => expect(panel.textContent).toContain(STRINGS['save.copied']));
    expect(writeText).toHaveBeenCalledWith(text);
    // Blocked (an Artifact iframe): the box is focused with everything selected.
    writeText.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.click(act$(panel, 'copy'));
    const box = panel.querySelector<HTMLTextAreaElement>('[data-export-text]')!;
    await waitFor(() => expect(document.activeElement).toBe(box));
    expect(box.selectionStart).toBe(0);
    expect(box.selectionEnd).toBe(text.length);
    expect(box.readOnly).toBe(true);
  });

  it('Copy without any Clipboard API selects the text too', async () => {
    const { panel } = setup();
    const text = await exportNow(panel);
    fireEvent.click(act$(panel, 'copy'));
    const box = panel.querySelector<HTMLTextAreaElement>('[data-export-text]')!;
    await waitFor(() => expect(document.activeElement).toBe(box));
    expect(box.selectionEnd - box.selectionStart).toBe(text.length);
  });

  it('Download saves the export as a .txt file', async () => {
    const { panel } = setup();
    const text = await exportNow(panel);
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob) => (blobs.push(b), 'blob:x'));
    URL.revokeObjectURL = vi.fn();
    const clicks: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicks.push(this);
    });
    fireEvent.click(act$(panel, 'download'));
    expect(clicks).toHaveLength(1);
    expect(clicks[0]!.download).toMatch(/^isi-save-\d+\.txt$/);
    expect(await blobs[0]!.text()).toBe(text);
  });

  it('Restore backup shows the backup’s timestamp and restores it after confirmation', () => {
    const area = createStorageArea();
    const backupAt = WALL_T0 - 30 * 60_000;
    const backup = { ...sampleSave(), game: makeState({ x: 777, amounts: [7], bought: [7] }) };
    area.data.set(
      KEYS.bak,
      encodeSave(backup, { ...META, savedAt: backupAt, maxSeenAt: backupAt }).blob,
    );
    area.data.set(
      KEYS.a,
      encodeSave(
        { ...sampleSave(), game: growing() },
        { ...META, savedAt: WALL_T0, maxSeenAt: WALL_T0 },
      ).blob,
    );
    area.data.set(KEYS.meta, JSON.stringify({ active: 'a', seq: 1, owner: null }));
    const { panel, loop } = setup(area, undefined);
    expect(panel.querySelector('[data-backup-at]')!.textContent).toBe(
      `Backup ${formatTimestamp(backupAt)}`,
    );
    expect(formatTimestamp(backupAt)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    loop.stop();
    const playing = serializeState(loop.state());
    fireEvent.click(act$(panel, 'restore'));
    fireEvent.click(act$(panel, 'cancel'));
    expect(serializeState(loop.state())).toBe(playing);
    fireEvent.click(act$(panel, 'restore'));
    fireEvent.click(act$(panel, 'confirm'));
    expect(serializeState(loop.state())).toBe(serializeState(backup.game));
  });

  it('Restore backup is disabled with — when there is no backup', () => {
    // Not started: nothing was saved, so there is no backup yet.
    const ctx = setupApp(growing(), { storage: createStorageArea().connect(), start: false });
    const panel = openSave(ctx.container);
    expect(panel.querySelector('[data-backup-at]')!.textContent).toBe(`Backup ${STRINGS.none}`);
    expect(act$(panel, 'restore').disabled).toBe(true);
  });

  it('Download quarantine is shown only with a quarantine and downloads it byte for byte', async () => {
    const plain = setup();
    expect(act$(plain.panel, 'quarantine')).toBeNull();
    cleanup();
    const area = createStorageArea();
    const bad = 'ISI1u:brokené blob:12345678';
    area.data.set(KEYS.meta, JSON.stringify({ active: 'a', seq: 1, owner: null }));
    area.data.set(KEYS.a, bad);
    const { panel } = setup(area);
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob) => (blobs.push(b), 'blob:q'));
    URL.revokeObjectURL = vi.fn();
    const clicks: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicks.push(this);
    });
    fireEvent.click(act$(panel, 'quarantine'));
    expect(clicks[0]!.download).toBe(STRINGS['file.quarantine']);
    expect(await blobs[0]!.text()).toBe(bad);
    expect(area.data.get(KEYS.quarantine)).toBe(bad);
  });

  it('Hard reset needs RESET typed', () => {
    const { panel, loop, area } = setup();
    area.data.set(KEYS.settings, '{"settingsVersion":1,"values":{}}');
    const reset = act$(panel, 'reset');
    const input = panel.querySelector<HTMLInputElement>('[data-reset-text]')!;
    expect(screen.getByLabelText('Type RESET')).toBe(input);
    expect(reset.disabled).toBe(true);
    for (const wrong of ['reset', 'RESE', 'RESET ', ' RESET']) {
      fireEvent.input(input, { target: { value: wrong } });
      expect(reset.disabled, wrong).toBe(true);
    }
    fireEvent.input(input, { target: { value: STRINGS['save.resetWord'] } });
    expect(reset.disabled).toBe(false);
    fireEvent.click(reset);
    expect(serializeState({ ...loop.state(), pendingMs: 0 })).toBe(serializeState(newGame()));
    expect(area.data.get(KEYS.settings)).toBe('{"settingsVersion":1,"values":{}}');
    expect(input.value).toBe('');
  });

  it('every control is disabled while paused', () => {
    const { panel, loop } = setup();
    act(() => loop.hub.report({ kind: 'error' }));
    const controls = [
      ...panel.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input, textarea'),
    ];
    expect(controls.length).toBeGreaterThan(4);
    for (const c of controls) expect(c.disabled, c.outerHTML.slice(0, 60)).toBe(true);
  });
});
