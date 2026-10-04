// @vitest-environment node
// GDD §20.1, §20.2: the envelope's fixed key order and bytes, the monotone save times, and the
// decode pipeline, which reports every failure with its stage and never throws.
import { describe, expect, it } from 'vitest';
import { crc32, encodePlainFrame, utf8Encode } from '../../src/engine/save/codec.ts';
import {
  SAVE_FORMAT,
  SAVE_VERSION,
  decodePayload,
  decodeSave,
  decodeSaveJson,
  encodeSave,
  nextSaveTimes,
  toEnvelope,
} from '../../src/engine/save/envelope.ts';
import { newGame, serializeState } from '../../src/engine/state.ts';
import { META, invalidEnvelope, sampleSave, validEnvelope } from './support/invalidSaves.ts';

describe('the envelope (GDD §20.1)', () => {
  it('writes the keys in a fixed order, Num values as codes and the id lists sorted', () => {
    const save = {
      game: newGame(),
      onboarding: { revealed: ['tier.2', 'maxAll', 'global'], done: [], visited: ['sum'] },
    };
    const { json } = encodeSave(save, META);
    expect(json).toBe(
      '{"format":1,"saveVersion":1,"gameVersion":"0.4.0","savedAt":1790000000000,' +
        '"maxSeenAt":1790000000000,"dataHash":"",' +
        '"state":{"sum":{"x":[1,0,10],"amounts":[[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],' +
        '[0,0,0],[0,0,0],[0,0,0]],"bought":[0,0,0,0,0,0,0,0],"globalLevel":0},' +
        '"time":0,"pendingMs":0,' +
        '"onboarding":{"revealed":["global","maxAll","tier.2"],"done":[],"visited":["sum"]}}}',
    );
    expect(SAVE_FORMAT).toBe(1);
    expect(SAVE_VERSION).toBe(1);
  });

  it('the slot frame is ISI1u: of that JSON', () => {
    const { json, blob } = encodeSave(sampleSave(), META);
    expect(blob).toBe(encodePlainFrame(json));
    expect(blob.startsWith('ISI1u:')).toBe(true);
  });

  it('decodes its own frame back to the same state, memory and times', () => {
    const save = sampleSave();
    const r = decodeSave(encodeSave(save, META).blob);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(serializeState(r.save.game)).toBe(serializeState(save.game));
    expect(r.save.game.table).toBeNull();
    expect(r.save.onboarding).toEqual({
      revealed: [...save.onboarding.revealed].sort(),
      done: [...save.onboarding.done].sort(),
      visited: ['sum'],
    });
    expect(r.meta).toEqual(META);
    expect(r.from).toBe(1);
  });
});

describe('save times (GDD §20.1, §20.2)', () => {
  it('savedAt = max(previous, now); maxSeenAt = max(previous, now, seen)', () => {
    expect(nextSaveTimes(null, 1000, 0)).toEqual({ savedAt: 1000, maxSeenAt: 1000 });
    expect(nextSaveTimes(null, 1000, 5000)).toEqual({ savedAt: 1000, maxSeenAt: 5000 });
    // The clock went back: neither decreases.
    const prev = { savedAt: 10_000, maxSeenAt: 20_000 };
    expect(nextSaveTimes(prev, 3000, 3000)).toEqual(prev);
    expect(nextSaveTimes(prev, 15_000, 0)).toEqual({ savedAt: 15_000, maxSeenAt: 20_000 });
    expect(nextSaveTimes(prev, 25_000, 0)).toEqual({ savedAt: 25_000, maxSeenAt: 25_000 });
  });

  it('invalid clock readings count as 0, and times are whole milliseconds', () => {
    expect(nextSaveTimes(null, Number.NaN, Number.POSITIVE_INFINITY)).toEqual({
      savedAt: 0,
      maxSeenAt: 0,
    });
    expect(nextSaveTimes(null, 1000.7, 0)).toEqual({ savedAt: 1000, maxSeenAt: 1000 });
  });
});

describe('the decode pipeline never throws and names its stage', () => {
  const frameOf = (json: string) => encodePlainFrame(json);

  it.each([
    ['frame', 'not a save'],
    ['frame', ''],
    ['frame', 'ISI1u:'],
    ['crc', encodeSave(sampleSave(), META).blob.replace(/:[0-9a-f]{8}$/, ':00000000')],
    ['json', frameOf('{"format":1,')],
    ['migrate', frameOf('[1,2,3]')],
    ['migrate', frameOf(JSON.stringify({ ...validEnvelope(), saveVersion: 0 }))],
    ['validate', frameOf(JSON.stringify(invalidEnvelope('NaN')))],
    ['validate', frameOf(JSON.stringify(invalidEnvelope('missing')))],
  ])('%s: %j', (stage, blob) => {
    const r = decodeSave(blob);
    expect(r.kind).toBe('invalid');
    if (r.kind === 'invalid') {
      expect(r.stage).toBe(stage);
      expect(r.problems.length).toBeGreaterThan(0);
    }
  });

  it('a non-string input is a frame error', () => {
    for (const v of [null, undefined, 3, {}, []]) {
      expect(decodeSave(v)).toMatchObject({ kind: 'invalid', stage: 'frame' });
    }
  });

  it('bytes that are not UTF-8 fail as json even with a matching CRC', () => {
    const bad = Uint8Array.of(0x7b, 0xff, 0x7d);
    expect(decodePayload(bad, crc32(bad) ^ 1)).toMatchObject({ kind: 'invalid', stage: 'crc' });
    expect(decodePayload(bad, crc32(bad))).toMatchObject({ kind: 'invalid', stage: 'json' });
  });

  it('a newer saveVersion or format is reported as newer, not invalid', () => {
    expect(decodeSaveJson(JSON.stringify({ ...validEnvelope(), saveVersion: 2 }))).toEqual({
      kind: 'newer',
      saveVersion: 2,
    });
    expect(decodeSaveJson(JSON.stringify({ ...validEnvelope(), format: 2 }))).toEqual({
      kind: 'newer',
      saveVersion: 1,
    });
    expect(decodeSave(frameOf(JSON.stringify({ saveVersion: 9 })))).toEqual({
      kind: 'newer',
      saveVersion: 9,
    });
  });

  it('an ISI1: frame asks for inflation', () => {
    const r = decodeSave('ISI1:AAAA:0000002a');
    expect(r).toEqual({ kind: 'needsInflate', payload: new Uint8Array(3), crc: 42 });
  });

  it('decodePayload checks the CRC of the uncompressed bytes', () => {
    const json = JSON.stringify(toEnvelope(sampleSave(), META));
    const bytes = utf8Encode(json);
    const good = decodeSave(encodePlainFrame(json));
    expect(good.kind).toBe('ok');
    const crc = Number.parseInt(encodePlainFrame(json).slice(-8), 16);
    expect(decodePayload(bytes, crc).kind).toBe('ok');
    expect(decodePayload(bytes, crc ^ 1)).toMatchObject({ kind: 'invalid', stage: 'crc' });
  });
});
