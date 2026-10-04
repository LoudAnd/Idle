// @vitest-environment node
// ROADMAP M4, GDD §20.1, §22 item 10: 10,000 corrupted blobs (byte flips and truncations) never
// throw; the loader falls back active → other slot → backup → new game; the failed blob is kept
// in quarantine byte for byte; and `fellBack` (the banner) is set whenever a load fell back.
// Nightly: ISI_FUZZ_RUNS=100000.
import { describe, expect, it } from 'vitest';
import { decodeSave, encodeSave } from '../../src/engine/save/envelope.ts';
import { makeState } from '../../src/engine/state.ts';
import { KEYS, createSaveStore } from '../../src/platform/storage.ts';
import type { LoadResult } from '../../src/platform/storage.ts';
import { createRng } from '../../src/sim/rng.ts';
import type { Rng } from '../../src/sim/rng.ts';
import { FC_SEED } from './support/arbitraries.ts';
import { createStorageArea } from './support/fakeStorage.ts';
import { META, sampleSave } from './support/invalidSaves.ts';

const RUNS = Number(process.env.ISI_FUZZ_RUNS ?? 10_000);

const blobOf = (x: number, savedAt = META.savedAt) =>
  encodeSave(
    { ...sampleSave(), game: makeState({ ...{ x }, bought: [3, 1], amounts: [3, 1] }) },
    { ...META, savedAt, maxSeenAt: savedAt },
  ).blob;

/** A byte flip (one bit of one character, or a random character) or a truncation. */
function corrupt(rng: Rng, text: string): string {
  for (;;) {
    let out: string;
    const kind = rng.int(3);
    if (kind === 0) {
      const i = rng.int(text.length);
      const c = text.charCodeAt(i) ^ (1 << rng.int(7));
      out = text.slice(0, i) + String.fromCharCode(c) + text.slice(i + 1);
    } else if (kind === 1) {
      const i = rng.int(text.length);
      out = text.slice(0, i) + String.fromCharCode(rng.int(0x3000)) + text.slice(i + 1);
    } else {
      out = text.slice(0, rng.int(text.length));
    }
    if (out !== text) return out;
  }
}

type Scenario = 'active' | 'active+other' | 'all three' | 'meta';
const SCENARIOS: readonly Scenario[] = ['active', 'active+other', 'all three', 'meta'];

const xOf = (r: LoadResult) => (r.kind === 'ok' ? r.save.game.sum.x.toNumber() : null);

describe('save fuzz (GDD §20.1, §22 item 10)', () => {
  it(
    `${RUNS.toLocaleString('en-US')} byte flips and truncations never throw`,
    { timeout: 600_000 },
    () => {
      const rng = createRng(FC_SEED);
      const active = blobOf(3, META.savedAt + 2000);
      const other = blobOf(2, META.savedAt + 1000);
      const bak = blobOf(1, META.savedAt);
      const meta = JSON.stringify({ active: 'b', seq: 9, owner: null });
      const counts: Record<string, number> = {};
      for (let n = 0; n < RUNS; n++) {
        const scenario = SCENARIOS[n % SCENARIOS.length]!;
        const area = createStorageArea();
        const store = createSaveStore(area.connect(), { ownerId: 'tab' });
        let bad: string;
        if (scenario === 'meta') {
          bad = corrupt(rng, meta);
          area.data.set(KEYS.meta, bad);
          area.data.set(KEYS.b, active);
          area.data.set(KEYS.a, other);
          area.data.set(KEYS.bak, bak);
        } else {
          bad = corrupt(rng, active);
          // Every corruption is detected (strict frame, canonical base64, CRC-32).
          expect(decodeSave(bad).kind, bad).not.toBe('ok');
          area.data.set(KEYS.meta, meta);
          area.data.set(KEYS.b, bad);
          if (scenario !== 'active') {
            area.data.set(KEYS.a, scenario === 'all three' ? corrupt(rng, other) : other);
            area.data.set(KEYS.bak, bak);
          }
        }
        let r: LoadResult | undefined;
        expect(() => (r = store.load())).not.toThrow();
        const result = r!;
        counts[`${scenario}:${result.kind}`] = (counts[`${scenario}:${result.kind}`] ?? 0) + 1;
        if (scenario === 'meta') {
          // A broken meta never loses progress: some valid slot loads.
          expect(result.kind).toBe('ok');
          expect([2, 3]).toContain(xOf(result));
          continue;
        }
        // The failed blob is kept in quarantine byte for byte, and the load fell back.
        expect(area.data.get(KEYS.quarantine)).toBe(bad);
        expect(result.fellBack).toBe(true);
        if (scenario === 'active') expect(result.kind).toBe('empty');
        if (scenario === 'active+other') expect(xOf(result)).toBe(2);
        if (scenario === 'all three') expect(xOf(result)).toBe(1);
      }
      console.log(`save fuzz (${RUNS} runs):`, counts);
    },
  );

  it('falls back active → other slot → backup → new game', () => {
    const area = createStorageArea();
    const store = createSaveStore(area.connect(), { ownerId: 'tab' });
    area.data.set(KEYS.meta, JSON.stringify({ active: 'a', seq: 3, owner: null }));
    area.data.set(KEYS.a, blobOf(3));
    area.data.set(KEYS.b, blobOf(2));
    area.data.set(KEYS.bak, blobOf(1));
    const sources: (string | number | null)[] = [];
    for (const key of [KEYS.a, KEYS.b, KEYS.bak, null]) {
      const r = store.load();
      sources.push(r.kind === 'ok' ? `${r.source}:${xOf(r)}` : r.kind);
      if (key !== null) area.data.set(key, corrupt(createRng(key.length), area.data.get(key)!));
    }
    expect(sources).toEqual(['active:3', 'other:2', 'backup:1', 'empty']);
  });

  it('the failed blob is quarantined byte for byte, and fellBack is set whenever a load fell back', () => {
    const area = createStorageArea();
    const store = createSaveStore(area.connect(), { ownerId: 'tab' });
    const bad = corrupt(createRng(1), blobOf(3));
    area.data.set(KEYS.meta, JSON.stringify({ active: 'a', seq: 3, owner: null }));
    area.data.set(KEYS.a, bad);
    area.data.set(KEYS.b, blobOf(2));
    const r = store.load();
    expect(r).toMatchObject({ kind: 'ok', source: 'other', fellBack: true, quarantined: bad });
    expect(store.quarantined()).toBe(bad);
    // A clean load did not fall back.
    area.data.set(KEYS.a, blobOf(3));
    expect(store.load()).toMatchObject({ kind: 'ok', source: 'active', fellBack: false });
  });
});
