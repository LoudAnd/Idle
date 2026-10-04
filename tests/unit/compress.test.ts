// @vitest-environment node
// GDD §20.1: player exports are ISI1: (deflate-raw through CompressionStream) and re-import
// exactly; without CompressionStream they fall back to ISI1u:. Corrupt or oversized compressed
// input is refused without an unhandled rejection, and inflation stops at the size limit.
import { inflateRawSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_JSON_BYTES, encodeDeflateFrame, utf8Encode } from '../../src/engine/save/codec.ts';
import { encodeSave } from '../../src/engine/save/envelope.ts';
import { serializeState } from '../../src/engine/state.ts';
import { compressionAvailable, deflateRaw, inflateRaw } from '../../src/platform/compress.ts';
import { exportText, importText } from '../../src/platform/transfer.ts';
import { META, sampleSave } from './support/invalidSaves.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('compression (GDD §20.1 export)', () => {
  it('deflate-raw round-trips and is real raw deflate', async () => {
    expect(compressionAvailable()).toBe(true);
    const bytes = utf8Encode('abc '.repeat(500));
    const d = await deflateRaw(bytes);
    expect(d.length).toBeLessThan(bytes.length / 10);
    expect(new Uint8Array(inflateRawSync(d))).toEqual(bytes);
    expect(await inflateRaw(d, 10_000)).toEqual(bytes);
  });

  it('inflation stops at the size limit, and corrupt input gives null without a rejection', async () => {
    const rejections: unknown[] = [];
    const onRejection = (e: unknown) => rejections.push(e);
    process.on('unhandledRejection', onRejection);
    try {
      const bomb = await deflateRaw(new Uint8Array(4 * 1024 * 1024));
      expect(await inflateRaw(bomb, MAX_JSON_BYTES)).toBeNull();
      expect(await inflateRaw(Uint8Array.of(1, 2, 3, 4, 5, 6), 1000)).toBeNull();
      expect(await inflateRaw(new Uint8Array(0), 1000)).not.toBe(undefined);
      await new Promise((r) => setTimeout(r, 20));
      expect(rejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', onRejection);
    }
  });

  it('an export is ISI1: and re-imports exactly', async () => {
    const save = sampleSave();
    const text = await exportText(save, META);
    expect(text.startsWith('ISI1:')).toBe(true);
    expect(text.length).toBeLessThan(encodeSave(save, META).blob.length);
    const r = await importText(text);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(serializeState(r.save.game)).toBe(serializeState(save.game));
    expect(r.meta).toEqual(META);
    // Whitespace (a wrapped paste) does not matter.
    const wrapped = `  ${text.slice(0, 20)}\n${text.slice(20, 50)}\r\n${text.slice(50)}\n`;
    expect((await importText(wrapped)).kind).toBe('ok');
  });

  it('without CompressionStream the export is ISI1u:, which imports too', async () => {
    vi.stubGlobal('CompressionStream', undefined);
    expect(compressionAvailable()).toBe(false);
    const text = await exportText(sampleSave(), META);
    expect(text).toBe(encodeSave(sampleSave(), META).blob);
    expect((await importText(text)).kind).toBe('ok');
    expect(await exportText(sampleSave(), META, { compress: false })).toBe(text);
  });

  it('an ISI1: frame whose CRC or inflation is wrong is refused', async () => {
    const json = encodeSave(sampleSave(), META).json;
    const bytes = utf8Encode(json);
    const good = encodeDeflateFrame(await deflateRaw(bytes), bytes);
    const badCrc = good.replace(/:[0-9a-f]{8}$/, ':00000000');
    expect(await importText(badCrc)).toMatchObject({ kind: 'invalid', stage: 'crc' });
    const garbage = encodeDeflateFrame(Uint8Array.of(9, 9, 9, 9), bytes);
    expect(await importText(garbage)).toMatchObject({ kind: 'invalid', stage: 'frame' });
    expect(await importText('hello')).toMatchObject({ kind: 'invalid', stage: 'frame' });
    expect(await importText(42)).toMatchObject({ kind: 'invalid', stage: 'frame' });
    expect(await importText('x'.repeat(5_000_000))).toMatchObject({ kind: 'invalid' });
  });
});
