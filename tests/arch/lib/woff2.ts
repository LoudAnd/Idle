// A minimal WOFF2 reader for the glyph test (GDD §2, §16.5): the code points a font file's
// `cmap` table maps to a glyph. It parses the WOFF2 table directory, Brotli-decompresses the
// table stream (node:zlib) and reads cmap subtables of formats 4 and 12, the ones the
// @fontsource files use. A code point counts only if it maps to a non-zero glyph id.
//
// WOFF2 (W3C, §5): a 48-byte header, then one directory entry per table: a flags byte (the low
// 6 bits index the known-tag list, 63 means an explicit 4-byte tag; the high 2 bits are the
// transform version), the original length (UIntBase128) and, for transformed tables, the
// transformed length. glyf and loca are transformed when the version is 0; every other table
// when it is non-zero. The tables follow each other in the decompressed stream, unpadded.
import { readFileSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';

const KNOWN_TAGS = [
  'cmap',
  'head',
  'hhea',
  'hmtx',
  'maxp',
  'name',
  'OS/2',
  'post',
  'cvt ',
  'fpgm',
  'glyf',
  'loca',
  'prep',
  'CFF ',
  'VORG',
  'EBDT',
  'EBLC',
  'gasp',
  'hdmx',
  'kern',
  'LTSH',
  'PCLT',
  'VDMX',
  'vhea',
  'vmtx',
  'BASE',
  'GDEF',
  'GPOS',
  'GSUB',
  'EBSC',
  'JSTF',
  'MATH',
  'CBDT',
  'CBLC',
  'COLR',
  'CPAL',
  'SVG ',
  'sbix',
  'acnt',
  'avar',
  'bdat',
  'bloc',
  'bsln',
  'cvar',
  'fdsc',
  'feat',
  'fmtx',
  'fvar',
  'gvar',
  'hsty',
  'just',
  'lcar',
  'mort',
  'morx',
  'opbd',
  'prop',
  'trak',
  'Zapf',
  'Silf',
  'Glat',
  'Gloc',
  'Feat',
  'Sill',
] as const;

const WOFF2_SIGNATURE = 0x774f4632; // 'wOF2'
const HEADER_LENGTH = 48;

interface Cursor {
  p: number;
}

/** UIntBase128: up to 5 bytes of 7 bits, most significant first. */
function base128(b: Uint8Array, c: Cursor): number {
  let v = 0;
  for (let i = 0; i < 5; i++) {
    const x = b[c.p++];
    if (x === undefined) throw new Error('woff2: truncated UIntBase128');
    if (i === 0 && x === 0x80) throw new Error('woff2: UIntBase128 with a leading zero');
    v = v * 128 + (x & 0x7f);
    if ((x & 0x80) === 0) return v;
  }
  throw new Error('woff2: UIntBase128 longer than 5 bytes');
}

interface TableEntry {
  readonly tag: string;
  /** Length in the decompressed stream. */
  readonly length: number;
}

/** The raw bytes of one table of a WOFF2 file. */
export function woff2Table(file: Uint8Array, tag: string): Uint8Array {
  const dv = new DataView(file.buffer, file.byteOffset, file.byteLength);
  if (dv.getUint32(0) !== WOFF2_SIGNATURE) throw new Error('woff2: bad signature');
  const numTables = dv.getUint16(12);
  const compressedLength = dv.getUint32(20);
  const c: Cursor = { p: HEADER_LENGTH };
  const tables: TableEntry[] = [];
  for (let i = 0; i < numTables; i++) {
    const flags = file[c.p++]!;
    const index = flags & 0x3f;
    let name: string;
    if (index === 63) {
      name = String.fromCharCode(...file.subarray(c.p, c.p + 4));
      c.p += 4;
    } else {
      const known = KNOWN_TAGS[index];
      if (known === undefined) throw new Error(`woff2: unknown tag index ${index}`);
      name = known;
    }
    const origLength = base128(file, c);
    const version = (flags >> 6) & 3;
    const transformed = name === 'glyf' || name === 'loca' ? version === 0 : version !== 0;
    const length = transformed ? base128(file, c) : origLength;
    tables.push({ tag: name, length });
  }
  const stream = brotliDecompressSync(file.subarray(c.p, c.p + compressedLength));
  let offset = 0;
  for (const t of tables) {
    if (t.tag === tag) {
      if (offset + t.length > stream.length) throw new Error(`woff2: ${tag} past the stream`);
      return new Uint8Array(stream.buffer, stream.byteOffset + offset, t.length);
    }
    offset += t.length;
  }
  throw new Error(`woff2: no ${tag} table`);
}

/** The code points a cmap table maps to a non-zero glyph (formats 4 and 12). */
export function cmapCodePoints(cmap: Uint8Array): Set<number> {
  const dv = new DataView(cmap.buffer, cmap.byteOffset, cmap.byteLength);
  const n = dv.getUint16(2);
  const out = new Set<number>();
  let read = 0;
  for (let i = 0; i < n; i++) {
    const sub = dv.getUint32(8 + i * 8);
    const format = dv.getUint16(sub);
    if (format === 4) {
      read++;
      const segX2 = dv.getUint16(sub + 6);
      const ends = sub + 14;
      const starts = ends + segX2 + 2;
      const deltas = starts + segX2;
      const offsets = deltas + segX2;
      for (let s = 0; s < segX2 / 2; s++) {
        const end = dv.getUint16(ends + s * 2);
        const start = dv.getUint16(starts + s * 2);
        const delta = dv.getInt16(deltas + s * 2);
        const ro = dv.getUint16(offsets + s * 2);
        for (let cp = start; cp <= end && cp !== 0xffff; cp++) {
          let g: number;
          if (ro === 0) g = (cp + delta) & 0xffff;
          else {
            g = dv.getUint16(offsets + s * 2 + ro + (cp - start) * 2);
            if (g !== 0) g = (g + delta) & 0xffff;
          }
          if (g !== 0) out.add(cp);
        }
      }
    } else if (format === 12) {
      read++;
      const groups = dv.getUint32(sub + 12);
      for (let k = 0; k < groups; k++) {
        const first = dv.getUint32(sub + 16 + k * 12);
        const last = dv.getUint32(sub + 20 + k * 12);
        const glyph = dv.getUint32(sub + 24 + k * 12);
        for (let cp = first; cp <= last; cp++) if (glyph + (cp - first) !== 0) out.add(cp);
      }
    }
  }
  if (read === 0) throw new Error('woff2: no cmap subtable of format 4 or 12');
  return out;
}

/** The code points a WOFF2 file has glyphs for. */
export function cmapOf(path: string): Set<number> {
  return cmapCodePoints(woff2Table(readFileSync(path), 'cmap'));
}

/** The code points of a CSS `unicode-range` value (`U+0000-00FF, U+0131, …`). */
export function unicodeRange(range: string): Set<number> {
  const out = new Set<number>();
  for (const part of range.split(',')) {
    const m = /^\s*U\+([0-9A-F]+)(?:-([0-9A-F]+))?\s*$/i.exec(part);
    if (!m) throw new Error(`bad unicode-range part: ${part}`);
    const a = parseInt(m[1]!, 16);
    const b = m[2] === undefined ? a : parseInt(m[2], 16);
    for (let cp = a; cp <= b; cp++) out.add(cp);
  }
  return out;
}
