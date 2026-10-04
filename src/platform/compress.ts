/**
 * deflate-raw for player exports (GDD §20.1: `ISI1:` frames), through `CompressionStream` and
 * `DecompressionStream`. Only the stream writer and reader are used (no `Blob.stream()` or
 * `Response`, which some environments lack), the inflated size is limited while reading (a
 * decompression bomb stops at `maxBytes`), and every promise is handled, so corrupt input never
 * becomes an unhandled rejection (which the global handlers would report as a fault, §21.8).
 * Where the streams are missing (older Safari, some iframes) exports fall back to `ISI1u:`.
 */

/** True when the browser has deflate-raw streams. */
export function compressionAvailable(): boolean {
  try {
    if (typeof CompressionStream !== 'function' || typeof DecompressionStream !== 'function') {
      return false;
    }
    new CompressionStream('deflate-raw');
    return true;
  } catch {
    return false;
  }
}

function concat(parts: readonly Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

async function pipe(
  stream: CompressionStream | DecompressionStream,
  bytes: Uint8Array,
  maxBytes: number,
): Promise<Uint8Array | null> {
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();
  // A corrupt input rejects these; the reader reports it, so they are only silenced here.
  writer.write(bytes as Uint8Array<ArrayBuffer>).catch(() => {});
  writer.close().catch(() => {});
  const parts: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) {
        reader.cancel().catch(() => {});
        return null;
      }
      parts.push(value);
    }
  } catch {
    return null;
  }
  return concat(parts, total);
}

/** deflate-raw of `bytes`. Rejects only where compression is unavailable. */
export async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const out = await pipe(new CompressionStream('deflate-raw'), bytes, Number.POSITIVE_INFINITY);
  if (out === null) throw new Error('deflate-raw failed');
  return out;
}

/** The inflated bytes, or `null` for corrupt input or more than `maxBytes`. Never rejects. */
export async function inflateRaw(bytes: Uint8Array, maxBytes: number): Promise<Uint8Array | null> {
  try {
    return await pipe(new DecompressionStream('deflate-raw'), bytes, maxBytes);
  } catch {
    return null;
  }
}
