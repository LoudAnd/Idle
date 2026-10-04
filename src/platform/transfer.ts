/**
 * Export and import as text (GDD §19 Save panel, §20.1). Exports are `ISI1:` frames
 * (deflate-raw) where `CompressionStream` exists and `ISI1u:` otherwise; imports accept both and
 * run the engine's decode pipeline (CRC, JSON, migrations, `validate()`), so an import is exactly
 * as strict as a load. Nothing here touches the game or storage: the session applies an `ok`
 * result after the player confirms.
 */
import {
  MAX_BLOB_CHARS,
  MAX_JSON_BYTES,
  encodeDeflateFrame,
  utf8Encode,
} from '../engine/save/codec.ts';
import { decodePayload, decodeSave, encodeSave } from '../engine/save/envelope.ts';
import type { DecodeResult, EnvelopeMeta, SaveData } from '../engine/save/envelope.ts';
import { compressionAvailable, deflateRaw, inflateRaw } from './compress.ts';

export interface ExportOptions {
  /** Compress when possible (default true); false always gives `ISI1u:`. */
  readonly compress?: boolean;
}

/** The export text of a save. Never rejects: a failed compression gives `ISI1u:`. */
export async function exportText(
  save: SaveData,
  meta: EnvelopeMeta,
  { compress = true }: ExportOptions = {},
): Promise<string> {
  const { json, blob } = encodeSave(save, meta);
  if (!compress || !compressionAvailable()) return blob;
  try {
    const bytes = utf8Encode(json);
    return encodeDeflateFrame(await deflateRaw(bytes), bytes);
  } catch {
    return blob;
  }
}

const invalid = (problem: string): DecodeResult => ({
  kind: 'invalid',
  stage: 'frame',
  problems: [problem],
});

/**
 * The save in a pasted or loaded text. Whitespace is removed first (base64url has none, so a
 * line-wrapped paste still imports); a text longer than `MAX_BLOB_CHARS` is refused unread.
 * Never rejects.
 */
export async function importText(text: unknown): Promise<DecodeResult> {
  if (typeof text !== 'string') return invalid('frame: not text');
  if (text.length > 2 * MAX_BLOB_CHARS) return invalid('frame: too long');
  const t = text.replace(/\s+/g, '');
  if (t.length > MAX_BLOB_CHARS) return invalid('frame: too long');
  const r = decodeSave(t);
  if (r.kind !== 'needsInflate') return r;
  if (!compressionAvailable()) return invalid('frame: compression unavailable');
  const json = await inflateRaw(r.payload, MAX_JSON_BYTES);
  if (json === null) return invalid('frame: does not inflate');
  return decodePayload(json, r.crc);
}
