// @vitest-environment node
// GDD §20.1: the save frames. UTF-8, CRC-32 and base64url are written by hand (the engine's lib
// has no TextEncoder or btoa), so each is checked against Node's own implementation, and every
// decoder is strict: non-canonical base64, malformed UTF-8 and malformed frames are refused.
import { crc32 as zlibCrc32 } from 'node:zlib';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  FRAME_DEFLATE,
  FRAME_PLAIN,
  MAX_BLOB_CHARS,
  MAX_JSON_BYTES,
  base64urlDecode,
  base64urlEncode,
  crc32,
  crc32Hex,
  encodeDeflateFrame,
  encodePlainFrame,
  parseFrame,
  utf8Decode,
  utf8Encode,
} from '../../src/engine/save/codec.ts';
import { FC_SEED } from './support/arbitraries.ts';

const bytesArb = fc.uint8Array({ minLength: 0, maxLength: 300 });
const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

describe('CRC-32 (IEEE, reflected 0xEDB88320)', () => {
  it('the check value: crc32("123456789") = 0xcbf43926', () => {
    expect(crc32(ascii('123456789'))).toBe(0xcbf43926);
    expect(crc32Hex(crc32(ascii('123456789')))).toBe('cbf43926');
    expect(crc32(new Uint8Array(0))).toBe(0);
    expect(crc32Hex(0)).toBe('00000000');
    expect(crc32Hex(0xffffffff)).toBe('ffffffff');
  });

  it('equals node:zlib crc32 on random bytes', () => {
    fc.assert(
      fc.property(bytesArb, (b) => {
        expect(crc32(b)).toBe(zlibCrc32(b) >>> 0);
      }),
      { seed: FC_SEED, numRuns: 500 },
    );
  });
});

describe('base64url (canonical, no padding)', () => {
  it('equals Buffer base64url and round-trips', () => {
    fc.assert(
      fc.property(bytesArb, (b) => {
        const text = base64urlEncode(b);
        expect(text).toBe(Buffer.from(b).toString('base64url'));
        expect(base64urlDecode(text)).toEqual(b);
      }),
      { seed: FC_SEED, numRuns: 500 },
    );
  });

  it.each([
    ['a length of 4n + 1', 'A'],
    ['a length of 4n + 1 (longer)', 'AAAAA'],
    ['padding', 'AA=='],
    ['the + of standard base64', 'AA+A'],
    ['the / of standard base64', 'AA/A'],
    ['a space', 'AA A'],
    ['a non-ASCII letter', 'AAé'],
    ['non-zero unused bits (2 characters)', 'AB'],
    ['non-zero unused bits (3 characters)', 'AAB'],
  ])('refuses %s', (_name, text) => {
    expect(base64urlDecode(text)).toBeNull();
  });

  it('accepts the canonical forms of 1 and 2 trailing bytes', () => {
    expect(base64urlDecode('AA')).toEqual(Uint8Array.of(0));
    expect(base64urlDecode('_w')).toEqual(Uint8Array.of(255));
    expect(base64urlDecode('__8')).toEqual(Uint8Array.of(255, 255));
    expect(base64urlDecode('')).toEqual(new Uint8Array(0));
  });
});

describe('UTF-8 (strict)', () => {
  const codePoints = fc.array(
    fc.oneof(
      fc.integer({ min: 0, max: 0x7f }),
      fc.integer({ min: 0x80, max: 0xd7ff }),
      fc.integer({ min: 0xe000, max: 0x10ffff }),
    ),
    { maxLength: 60 },
  );

  it('equals Buffer UTF-8 and round-trips well-formed strings', () => {
    fc.assert(
      fc.property(codePoints, (cps) => {
        const s = String.fromCodePoint(...cps);
        const b = utf8Encode(s);
        expect(Buffer.from(b).equals(Buffer.from(s, 'utf8'))).toBe(true);
        expect(utf8Decode(b)).toBe(s);
      }),
      { seed: FC_SEED, numRuns: 500 },
    );
  });

  it('encodes a lone surrogate as U+FFFD, as TextEncoder does', () => {
    expect(utf8Encode('a\ud800b')).toEqual(new TextEncoder().encode('a\ud800b'));
    expect(utf8Encode('\udc00')).toEqual(Uint8Array.of(0xef, 0xbf, 0xbd));
  });

  it.each([
    ['an overlong 2-byte form', [0xc0, 0x80]],
    ['an overlong 2-byte form of 0x7f', [0xc1, 0xbf]],
    ['an overlong 3-byte form', [0xe0, 0x80, 0x80]],
    ['an overlong 4-byte form', [0xf0, 0x80, 0x80, 0x80]],
    ['a surrogate', [0xed, 0xa0, 0x80]],
    ['a code point above U+10FFFF', [0xf4, 0x90, 0x80, 0x80]],
    ['a stray continuation byte', [0x41, 0x80]],
    ['a truncated 3-byte sequence', [0xe2, 0x82]],
    ['a truncated 4-byte sequence', [0xf0, 0x9f, 0x98]],
    ['a non-continuation byte inside a sequence', [0xe2, 0x41, 0x82]],
    ['the byte 0xff', [0xff]],
  ])('refuses %s', (_name, bytes) => {
    expect(utf8Decode(Uint8Array.from(bytes))).toBeNull();
  });
});

describe('frames (GDD §20.1)', () => {
  const json = '{"format":1,"saveVersion":1}';

  it('ISI1u: is base64url of the UTF-8 JSON, then : and its CRC', () => {
    const frame = encodePlainFrame(json);
    const b = Buffer.from(json, 'utf8');
    expect(frame).toBe(
      `${FRAME_PLAIN}${b.toString('base64url')}:${(zlibCrc32(b) >>> 0).toString(16).padStart(8, '0')}`,
    );
    const p = parseFrame(frame);
    expect(p?.kind).toBe('plain');
    expect(Buffer.from(p!.payload).toString('utf8')).toBe(json);
    expect(p?.crc).toBe(zlibCrc32(b) >>> 0);
  });

  it('ISI1: carries the CRC of the uncompressed JSON bytes', () => {
    const jsonBytes = utf8Encode(json);
    const fake = Uint8Array.of(1, 2, 3, 4);
    const frame = encodeDeflateFrame(fake, jsonBytes);
    expect(frame.startsWith(FRAME_DEFLATE)).toBe(true);
    const p = parseFrame(frame);
    expect(p).toEqual({ kind: 'deflate', payload: fake, crc: crc32(jsonBytes) });
  });

  it.each([
    ['no prefix', 'eyJ9:00000000'],
    ['a lower-case prefix', 'isi1u:e30:00000000'],
    ['a different version', 'ISI2u:e30:00000000'],
    ['no CRC', 'ISI1u:e30'],
    ['a short CRC', 'ISI1u:e30:0000000'],
    ['an upper-case CRC', 'ISI1u:e30:ABCDEF01'],
    ['a long CRC', 'ISI1u:e30:000000000'],
    ['two colons', 'ISI1u:e30:00000000:00000000'],
    ['bad base64', 'ISI1u:e3=:00000000'],
    ['leading space', ' ISI1u:e30:00000000'],
  ])('refuses %s', (_name, text) => {
    expect(parseFrame(text)).toBeNull();
  });

  it('refuses frames longer than MAX_BLOB_CHARS and plain payloads above MAX_JSON_BYTES', () => {
    expect(parseFrame(FRAME_PLAIN + 'A'.repeat(MAX_BLOB_CHARS) + ':00000000')).toBeNull();
    const big = encodePlainFrame('x'.repeat(MAX_JSON_BYTES + 1));
    expect(big.length).toBeLessThanOrEqual(MAX_BLOB_CHARS);
    expect(parseFrame(big)).toBeNull();
    expect(parseFrame(encodePlainFrame('x'.repeat(1000)))).not.toBeNull();
  });

  it('every single-character change of a frame fails to parse or changes its payload or CRC', () => {
    const frame = encodePlainFrame('{"a":[1,2,3],"b":"text"}');
    const original = parseFrame(frame)!;
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_:=+/ ';
    for (let i = 0; i < frame.length; i++) {
      for (const c of alphabet) {
        if (c === frame[i]) continue;
        const changed = frame.slice(0, i) + c + frame.slice(i + 1);
        const p = parseFrame(changed);
        if (p === null) continue;
        const same =
          p.crc === original.crc &&
          p.payload.length === original.payload.length &&
          p.payload.every((b, j) => b === original.payload[j]);
        expect(same, `${changed}`).toBe(false);
        // And the CRC no longer matches the payload.
        expect(crc32(p.payload) === p.crc, changed).toBe(false);
      }
    }
  });
});
