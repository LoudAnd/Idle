/**
 * The save envelope (GDD §20.1) and the decode pipeline: frame → CRC → UTF-8 → JSON →
 * migrations → `validate()` → state. Every step is total, so a corrupt blob is always reported
 * as `invalid` with its stage and problems, never thrown.
 *
 * ```json
 * {"format":1,"saveVersion":1,"gameVersion":"0.4.0","savedAt":…,"maxSeenAt":…,"dataHash":"",
 *  "state":{"sum":{"x":[1,0,12.5],"amounts":[…8 codes],"bought":[…8],"globalLevel":0},
 *           "time":61.25,"pendingMs":350,"onboarding":{"revealed":[…],"done":[…],"visited":[…]}}}
 * ```
 *
 * - Keys are written in this fixed order and `Num` values as canonical `[sign, layer, mag]`
 *   codes, so the same state always gives the same bytes (§21.2).
 * - `savedAt` and `maxSeenAt` are epoch milliseconds and never decrease (`nextSaveTimes`):
 *   `maxSeenAt` is the highest wall time ever seen, against which offline time is credited
 *   (§20.2), so setting the clock back earns nothing.
 * - `dataHash` is `""` until the OEIS data ships (M6b); `gameVersion` is the build's version.
 * - `state` is the game state (`toSerializable`) plus the UI's onboarding memory as sorted id
 *   lists (§17.4), which the engine validates against `content/onboarding.ts`.
 */
import type { OnboardingIds } from '../content/onboarding.ts';
import { fromSerializable, toSerializable } from '../state.ts';
import type { GameState, SerializedState } from '../state.ts';
import { MAX_JSON_BYTES, crc32, encodePlainFrame, parseFrame, utf8Decode } from './codec.ts';
import { SAVE_FORMAT, SAVE_VERSION, migrate } from './migrations.ts';
import { validate } from './validate.ts';

export { SAVE_FORMAT, SAVE_VERSION };

/** What a save holds: the game and the onboarding memory (§17.4). */
export interface SaveData {
  readonly game: GameState;
  readonly onboarding: OnboardingIds;
}

/** The save's clock fields, in epoch milliseconds. */
export interface SaveTimes {
  readonly savedAt: number;
  readonly maxSeenAt: number;
}

export interface EnvelopeMeta extends SaveTimes {
  readonly gameVersion: string;
  readonly dataHash: string;
}

export interface SerializedSave extends SerializedState {
  readonly onboarding: OnboardingIds;
}

export interface Envelope {
  readonly format: number;
  readonly saveVersion: number;
  readonly gameVersion: string;
  readonly savedAt: number;
  readonly maxSeenAt: number;
  readonly dataHash: string;
  readonly state: SerializedSave;
}

export type InvalidStage = 'frame' | 'crc' | 'json' | 'migrate' | 'validate';

export type DecodeResult =
  | {
      readonly kind: 'ok';
      readonly save: SaveData;
      readonly meta: EnvelopeMeta;
      /** The save version it was stored with (before migrations). */
      readonly from: number;
    }
  | { readonly kind: 'newer'; readonly saveVersion: number }
  | {
      readonly kind: 'invalid';
      readonly stage: InvalidStage;
      readonly problems: readonly string[];
    };

/** A compressed `ISI1:` frame: the platform inflates `payload`, then calls `decodePayload`. */
export interface NeedsInflate {
  readonly kind: 'needsInflate';
  readonly payload: Uint8Array;
  readonly crc: number;
}

function wholeMs(v: number): number {
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

/**
 * The times of the next save: `savedAt` = max(previous, now) and `maxSeenAt` = max(previous,
 * now, the highest wall time seen this session), so neither ever decreases (§20.1, §20.2).
 */
export function nextSaveTimes(prev: SaveTimes | null, nowMs: number, seenMs: number): SaveTimes {
  const now = wholeMs(nowMs);
  const savedAt = Math.max(prev?.savedAt ?? 0, now);
  const maxSeenAt = Math.max(prev?.maxSeenAt ?? 0, savedAt, wholeMs(seenMs));
  return { savedAt, maxSeenAt };
}

const sorted = (ids: readonly string[]): string[] => [...ids].sort();

/** The envelope of a save, keys in their fixed order and the id lists sorted. */
export function toEnvelope(save: SaveData, meta: EnvelopeMeta): Envelope {
  const s = toSerializable(save.game);
  return {
    format: SAVE_FORMAT,
    saveVersion: SAVE_VERSION,
    gameVersion: meta.gameVersion,
    savedAt: meta.savedAt,
    maxSeenAt: meta.maxSeenAt,
    dataHash: meta.dataHash,
    state: {
      sum: s.sum,
      time: s.time,
      pendingMs: s.pendingMs,
      onboarding: {
        revealed: sorted(save.onboarding.revealed),
        done: sorted(save.onboarding.done),
        visited: sorted(save.onboarding.visited),
      },
    },
  };
}

/** The envelope's JSON (deterministic: fixed key order, canonical codes). */
export function envelopeJson(env: Envelope): string {
  return JSON.stringify(env);
}

/** The save's JSON and its `ISI1u:` frame (the slot format). */
export function encodeSave(save: SaveData, meta: EnvelopeMeta): { json: string; blob: string } {
  const json = envelopeJson(toEnvelope(save, meta));
  return { json, blob: encodePlainFrame(json) };
}

/** The save of a validated envelope. */
export function fromEnvelope(env: Envelope): SaveData {
  const ob = env.state.onboarding;
  return {
    game: fromSerializable(env.state),
    onboarding: { revealed: [...ob.revealed], done: [...ob.done], visited: [...ob.visited] },
  };
}

const invalid = (stage: InvalidStage, problems: readonly string[]): DecodeResult => ({
  kind: 'invalid',
  stage,
  problems,
});

/** JSON text → migrations → `validate()` → save. Also the dev fixtures' entry point (§21.9). */
export function decodeSaveJson(json: string): DecodeResult {
  if (typeof json !== 'string' || json.length > MAX_JSON_BYTES) {
    return invalid('json', ['json: too long or not text']);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return invalid('json', ['json: does not parse']);
  }
  const m = migrate(raw);
  if (m.kind === 'newer') return { kind: 'newer', saveVersion: m.saveVersion };
  if (m.kind === 'error') return invalid('migrate', [m.problem]);
  const problems = validate(m.env);
  if (problems.length > 0) return invalid('validate', problems);
  const env = m.env as unknown as Envelope;
  try {
    return {
      kind: 'ok',
      save: fromEnvelope(env),
      meta: {
        gameVersion: env.gameVersion,
        savedAt: env.savedAt,
        maxSeenAt: env.maxSeenAt,
        dataHash: env.dataHash,
      },
      from: m.from,
    };
  } catch (e) {
    return invalid('validate', [`state: ${e instanceof Error ? e.message : String(e)}`]);
  }
}

/** The uncompressed JSON bytes of a frame and the frame's CRC → save. */
export function decodePayload(jsonBytes: Uint8Array, crc: number): DecodeResult {
  if (jsonBytes.length > MAX_JSON_BYTES) return invalid('json', ['json: too long']);
  if (crc32(jsonBytes) !== crc >>> 0) return invalid('crc', ['crc: mismatch']);
  const json = utf8Decode(jsonBytes);
  if (json === null) return invalid('json', ['json: not UTF-8']);
  return decodeSaveJson(json);
}

/**
 * A blob → save. Plain `ISI1u:` frames decode here; an `ISI1:` frame needs the platform's
 * inflate first (`needsInflate`). Never throws.
 */
export function decodeSave(text: unknown): DecodeResult | NeedsInflate {
  try {
    if (typeof text !== 'string') return invalid('frame', ['frame: not text']);
    const frame = parseFrame(text);
    if (frame === null) return invalid('frame', ['frame: not a save frame']);
    if (frame.kind === 'deflate') {
      return { kind: 'needsInflate', payload: frame.payload, crc: frame.crc };
    }
    return decodePayload(frame.payload, frame.crc);
  } catch {
    return invalid('frame', ['frame: unreadable']);
  }
}
