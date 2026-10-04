// @vitest-environment node
// GDD §15, §22.6: the M2 blocking pacing bands, for bot seeds 1–3, read from
// balance/targets.json. Explicit timeouts; no test asserts how long it took.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { serializeState } from '../../src/engine/state.ts';
import type { Tier } from '../../src/engine/state.ts';
import { reachTime, replayLog, runBot, unlockTime } from '../../src/sim/bot.ts';
import type { BotRun, Profile } from '../../src/sim/bot.ts';
import { REPO_ROOT } from '../arch/lib/scan.ts';

interface Band {
  readonly id: string;
  readonly profile: Profile;
  readonly metric: 'unlock' | 'reach';
  readonly tier?: Tier;
  readonly log2?: number;
  readonly min: number;
  readonly max: number;
  readonly blocks: string;
  readonly status: 'blocking' | 'report' | 'escalated';
}

const { bands } = JSON.parse(readFileSync(join(REPO_ROOT, 'balance', 'targets.json'), 'utf8')) as {
  bands: Band[];
};

const SEEDS = [1, 2, 3];
/** Long enough for every M2 band: the idle band ends at 120 min. */
const HORIZON_S = { active: 30 * 60, idle: 3 * 3600 } as const;

const runs = new Map<string, BotRun>();
function run(profile: Profile, seed: number): BotRun {
  const key = `${profile}:${seed}`;
  let r = runs.get(key);
  if (r === undefined) {
    r = runBot({ profile, seed, seconds: HORIZON_S[profile], stopAtLog2: 128 });
    runs.set(key, r);
  }
  return r;
}

/** The band's measured minutes for a run, or null if the event never happened. */
function measure(band: Band, r: BotRun): number | null {
  const s =
    band.metric === 'unlock' ? unlockTime(r, band.tier as Tier) : reachTime(r, band.log2 ?? 0);
  return s === null ? null : s / 60;
}

const m2 = bands.filter((b) => b.blocks === 'M2' && b.status === 'blocking');

/**
 * The M2 bands as GDD §15 states them. The band test reads targets.json, so the values are
 * pinned here: widening a band needs this table and the GDD to change too, never the JSON alone
 * (the escalation of §14.3).
 */
const GDD_M2_BANDS = {
  'm2.active.g5': { profile: 'active', metric: 'unlock', tier: 5, min: 4, max: 7 },
  'm2.active.g8': { profile: 'active', metric: 'unlock', tier: 8, min: 9, max: 14 },
  'm2.active.x128': { profile: 'active', metric: 'reach', log2: 128, min: 10, max: 16 },
  'm2.idle.x128': { profile: 'idle', metric: 'reach', log2: 128, min: 0, max: 120 },
} as const;

describe('balance/targets.json', () => {
  it('holds the four M2 blocking bands of GDD §15, with their GDD values', () => {
    expect(m2.map((b) => b.id).sort()).toEqual(Object.keys(GDD_M2_BANDS).sort());
    for (const band of m2) {
      const { id, blocks, status, ...rest } = band;
      expect([blocks, status], id).toEqual(['M2', 'blocking']);
      expect(rest, id).toEqual(GDD_M2_BANDS[id as keyof typeof GDD_M2_BANDS]);
    }
  });
});

describe('M2 pacing bands (GDD §15)', () => {
  for (const profile of ['active', 'idle'] as const) {
    const own = m2.filter((b) => b.profile === profile);
    const label = own.map((b) => `${b.id} ${b.min}–${b.max} min`).join(', ');
    it(`${profile}, seeds 1–3: ${label}`, { timeout: 120_000 }, () => {
      for (const seed of SEEDS) {
        const r = run(profile, seed);
        for (const band of own) {
          const minutes = measure(band, r);
          expect(minutes, `${band.id} seed ${seed}`).not.toBeNull();
          expect(minutes!, `${band.id} seed ${seed}`).toBeGreaterThanOrEqual(band.min);
          expect(minutes!, `${band.id} seed ${seed}`).toBeLessThanOrEqual(band.max);
        }
      }
    });
  }
});

describe('the bot (GDD §22.6)', () => {
  it(
    'is deterministic per seed and its action log replays to its final state',
    { timeout: 60_000 },
    () => {
      const a = runBot({ profile: 'active', seed: 2, seconds: 600 });
      const b = runBot({ profile: 'active', seed: 2, seconds: 600 });
      expect(serializeState(a.final)).toBe(serializeState(b.final));
      expect(JSON.stringify(a.log)).toBe(JSON.stringify(b.log));
      expect(a.log).toHaveLength(600);
      expect(serializeState(replayLog(a.initial, a.log))).toBe(serializeState(a.final));
      // Seeds vary the reaction delays, so their logs differ.
      const c = runBot({ profile: 'active', seed: 3, seconds: 600 });
      expect(JSON.stringify(c.log)).not.toBe(JSON.stringify(a.log));
    },
  );

  it(
    'the idle profile acts only during the first 10 s of every 15 min',
    { timeout: 60_000 },
    () => {
      const r = runBot({ profile: 'idle', seed: 1, seconds: 3600 });
      r.log.forEach((actions, t) => {
        if (actions.length > 0) expect(t % 900, `t = ${t}`).toBeLessThan(10);
      });
      expect(r.purchases).toBeGreaterThan(0);
    },
  );

  it('unlocks the tiers in order, each at its first purchase', { timeout: 60_000 }, () => {
    const r = run('active', 1);
    const times = ([1, 2, 3, 4, 5, 6, 7, 8] as const).map((t) => unlockTime(r, t));
    expect(times[0]).toBe(0);
    for (let i = 1; i < 8; i++) expect(times[i]!).toBeGreaterThan(times[i - 1]!);
  });
});
