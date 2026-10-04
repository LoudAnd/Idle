/**
 * The save frames (GDD §20.1): UTF-8, CRC-32 and base64url written out by hand, because the
 * engine's lib (ES2023, no DOM) has no `TextEncoder` or `btoa`. Every decoder is strict and
 * returns `null` on bad input instead of throwing or guessing.
 *
 * - `ISI1u:` + base64url(UTF-8 JSON) + `:` + crc32: the slot, backup and quarantine format, and
 *   the export fallback. Synchronous, so a `pagehide` save can write it.
 * - `ISI1:` + base64url(deflate-raw(UTF-8 JSON)) + `:` + crc32: the export format. The CRC is
 *   that of the **uncompressed** JSON bytes, so it checks the whole round trip. Deflate itself
 *   is the platform's (`CompressionStream`, `src/platform/compress.ts`).
 *
 * The CRC is IEEE CRC-32 (reflected polynomial 0xEDB88320), written as exactly 8 lowercase hex
 * digits. base64url uses `A–Z a–z 0–9 - _` without padding, and the unused low bits of the last
 * character must be zero, so each byte string has exactly one encoding and every single-character
 * change of a frame changes its bytes (and so fails the CRC) or fails to parse.
 */

export const FRAME_PLAIN = 'ISI1u:';
export const FRAME_DEFLATE = 'ISI1:';
/** The longest frame accepted (characters): a paste or file beyond it is refused unread. */
export const MAX_BLOB_CHARS = 2_000_000;
/** The largest JSON accepted (bytes, after inflating); inflation stops beyond it. */
export const MAX_JSON_BYTES = 1_048_576;

// ---------------------------------------------------------------------------------------------
// UTF-8
// ---------------------------------------------------------------------------------------------

/** UTF-8 bytes of `s`. A lone surrogate is encoded as U+FFFD, as `TextEncoder` does. */
export function utf8Encode(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
        i++;
      }
    }
    if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd;
    if (c < 0x80) {
      out.push(c);
    } else if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else if (c < 0x10000) {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    } else {
      out.push(
        0xf0 | (c >> 18),
        0x80 | ((c >> 12) & 0x3f),
        0x80 | ((c >> 6) & 0x3f),
        0x80 | (c & 0x3f),
      );
    }
  }
  return Uint8Array.from(out);
}

/**
 * The string of strict UTF-8 bytes, or `null`: overlong forms, surrogates, code points above
 * U+10FFFF, stray continuation bytes and truncated sequences are all rejected.
 */
export function utf8Decode(bytes: Uint8Array): string | null {
  const parts: string[] = [];
  let chunk: number[] = [];
  const flush = (): void => {
    if (chunk.length > 0) {
      parts.push(String.fromCharCode(...chunk));
      chunk = [];
    }
  };
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i] as number;
    let cp: number;
    let need: number;
    let min: number;
    if (b0 < 0x80) {
      cp = b0;
      need = 0;
      min = 0;
    } else if (b0 >= 0xc2 && b0 <= 0xdf) {
      cp = b0 & 0x1f;
      need = 1;
      min = 0x80;
    } else if (b0 >= 0xe0 && b0 <= 0xef) {
      cp = b0 & 0x0f;
      need = 2;
      min = 0x800;
    } else if (b0 >= 0xf0 && b0 <= 0xf4) {
      cp = b0 & 0x07;
      need = 3;
      min = 0x10000;
    } else {
      return null;
    }
    // A truncated sequence reads `undefined` and fails the continuation check.
    for (let k = 1; k <= need; k++) {
      const b = bytes[i + k];
      if (b === undefined || (b & 0xc0) !== 0x80) return null;
      cp = (cp << 6) | (b & 0x3f);
    }
    if (cp < min || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return null;
    if (cp >= 0x10000) {
      const v = cp - 0x10000;
      chunk.push(0xd800 + (v >> 10), 0xdc00 + (v & 0x3ff));
    } else {
      chunk.push(cp);
    }
    if (chunk.length >= 8192) flush();
    i += need + 1;
  }
  flush();
  return parts.join('');
}

// ---------------------------------------------------------------------------------------------
// CRC-32 (IEEE 802.3, reflected 0xEDB88320)
// ---------------------------------------------------------------------------------------------

const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** The CRC-32 of `bytes`, as an unsigned 32-bit integer. `crc32("123456789")` is 0xCBF43926. */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = (CRC_TABLE[(c ^ (bytes[i] as number)) & 0xff] as number) ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** A CRC as exactly 8 lowercase hex digits. */
export function crc32Hex(crc: number): string {
  return (crc >>> 0).toString(16).padStart(8, '0');
}

const HEX8 = /^[0-9a-f]{8}$/;

// ---------------------------------------------------------------------------------------------
// base64url (RFC 4648 §5, no padding, canonical)
// ---------------------------------------------------------------------------------------------

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const DECODE: Int16Array = (() => {
  const t = new Int16Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i++) t[ALPHABET.charCodeAt(i)] = i;
  return t;
})();

/** base64url of `bytes`, without padding. */
export function base64urlEncode(bytes: Uint8Array): string {
  const parts: string[] = [];
  let chunk = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n =
      ((bytes[i] as number) << 16) | ((bytes[i + 1] as number) << 8) | (bytes[i + 2] as number);
    chunk +=
      ALPHABET[(n >> 18) & 63]! +
      ALPHABET[(n >> 12) & 63]! +
      ALPHABET[(n >> 6) & 63]! +
      ALPHABET[n & 63]!;
    if (chunk.length >= 16_384) {
      parts.push(chunk);
      chunk = '';
    }
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = (bytes[i] as number) << 16;
    chunk += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]!;
  } else if (rest === 2) {
    const n = ((bytes[i] as number) << 16) | ((bytes[i + 1] as number) << 8);
    chunk += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]! + ALPHABET[(n >> 6) & 63]!;
  }
  parts.push(chunk);
  return parts.join('');
}

/**
 * The bytes of a canonical base64url string, or `null`: a character outside the alphabet, a
 * length of 4n + 1, padding, or non-zero unused bits in the last character.
 */
export function base64urlDecode(text: string): Uint8Array | null {
  const len = text.length;
  if (len % 4 === 1) return null;
  const full = Math.floor(len / 4);
  const rest = len % 4;
  const out = new Uint8Array(full * 3 + (rest === 0 ? 0 : rest - 1));
  const value = (i: number): number => {
    const c = text.charCodeAt(i);
    return c < 128 ? (DECODE[c] as number) : -1;
  };
  let o = 0;
  for (let q = 0; q < full; q++) {
    const i = q * 4;
    const a = value(i);
    const b = value(i + 1);
    const c = value(i + 2);
    const d = value(i + 3);
    if ((a | b | c | d) < 0) return null;
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    out[o++] = (n >> 16) & 0xff;
    out[o++] = (n >> 8) & 0xff;
    out[o++] = n & 0xff;
  }
  if (rest > 0) {
    const i = full * 4;
    const a = value(i);
    const b = value(i + 1);
    const c = rest === 3 ? value(i + 2) : 0;
    if ((a | b | c) < 0) return null;
    if (rest === 2) {
      if ((b & 0x0f) !== 0) return null;
      out[o++] = ((a << 2) | (b >> 4)) & 0xff;
    } else {
      if ((c & 0x03) !== 0) return null;
      const n = (a << 18) | (b << 12) | (c << 6);
      out[o++] = (n >> 16) & 0xff;
      out[o++] = (n >> 8) & 0xff;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Frames
// ---------------------------------------------------------------------------------------------

/** `ISI1u:` + base64url(UTF-8 of `json`) + `:` + its CRC. */
export function encodePlainFrame(json: string): string {
  const bytes = utf8Encode(json);
  return `${FRAME_PLAIN}${base64urlEncode(bytes)}:${crc32Hex(crc32(bytes))}`;
}

/** `ISI1:` + base64url(`deflated`) + `:` + the CRC of the uncompressed `jsonBytes`. */
export function encodeDeflateFrame(deflated: Uint8Array, jsonBytes: Uint8Array): string {
  return `${FRAME_DEFLATE}${base64urlEncode(deflated)}:${crc32Hex(crc32(jsonBytes))}`;
}

export interface ParsedFrame {
  /** `plain`: the payload is the JSON's UTF-8. `deflate`: it is deflate-raw of it. */
  readonly kind: 'plain' | 'deflate';
  readonly payload: Uint8Array;
  /** The CRC of the uncompressed JSON bytes. */
  readonly crc: number;
}

/**
 * The parts of a frame, or `null` when it is not one: an exact prefix, a canonical base64url
 * payload, `:` and 8 lowercase hex digits, and at most `MAX_BLOB_CHARS` characters (a plain
 * payload at most `MAX_JSON_BYTES`). The CRC is not checked here (`envelope.ts` does).
 */
export function parseFrame(text: string): ParsedFrame | null {
  if (typeof text !== 'string' || text.length > MAX_BLOB_CHARS) return null;
  let kind: ParsedFrame['kind'];
  let rest: string;
  if (text.startsWith(FRAME_PLAIN)) {
    kind = 'plain';
    rest = text.slice(FRAME_PLAIN.length);
  } else if (text.startsWith(FRAME_DEFLATE)) {
    kind = 'deflate';
    rest = text.slice(FRAME_DEFLATE.length);
  } else {
    return null;
  }
  const colon = rest.indexOf(':');
  if (colon < 0 || rest.indexOf(':', colon + 1) >= 0) return null;
  const hex = rest.slice(colon + 1);
  if (!HEX8.test(hex)) return null;
  const payload = base64urlDecode(rest.slice(0, colon));
  if (payload === null) return null;
  if (kind === 'plain' && payload.length > MAX_JSON_BYTES) return null;
  return { kind, payload, crc: Number.parseInt(hex, 16) >>> 0 };
}
