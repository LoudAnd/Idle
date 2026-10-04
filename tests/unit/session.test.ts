// GDD §20.1, §20.2, §21.8 (jsdom; fake storage, channel and clocks): the session's save
// lifecycle. A NaN state is refused before saving (storage unchanged, autosave stops); a newer
// save makes the session read-only; a full storage shows the quota state and the next autosave
// retries; offline credit follows maxSeenAt through a scripted clock; gaps and loads over 60 s
// catch up behind the progress state and end in the While-away summary.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OnboardingIds } from '../../src/engine/content/onboarding.ts';
import { OFFLINE_CAP_S } from '../../src/engine/content/offline.ts';
import { num } from '../../src/engine/num.ts';
import { advance } from '../../src/engine/offline.ts';
import { decodeSave, encodeSave } from '../../src/engine/save/envelope.ts';
import { encodePlainFrame } from '../../src/engine/save/codec.ts';
import { makeState, serializeState } from '../../src/engine/state.ts';
import type { GameState } from '../../src/engine/state.ts';
import { createErrorHub } from '../../src/platform/errors.ts';
import { createGameLoop } from '../../src/platform/loop.ts';
import type { GameLoop } from '../../src/platform/loop.ts';
import { AWAY_MIN_S, createSession } from '../../src/platform/session.ts';
import type { Session } from '../../src/platform/session.ts';
import { KEYS, RESET_KEYS } from '../../src/platform/storage.ts';
import { createFakeClock } from '../ui/support/fakeClock.ts';
import type { FakeClock } from '../ui/support/fakeClock.ts';
import { WALL_T0, createFakeWall } from '../ui/support/app.tsx';
import type { FakeWall } from '../ui/support/app.tsx';
import { createStorageArea } from './support/fakeStorage.ts';
import type { StorageArea } from './support/fakeStorage.ts';
import { META, sampleSave } from './support/invalidSaves.ts';

const HOUR_MS = 3_600_000;

let disposers: (() => void)[] = [];
afterEach(() => {
  for (const d of disposers.splice(0)) d();
  vi.useRealTimers();
});

interface Booted {
  readonly area: StorageArea;
  readonly clock: FakeClock;
  readonly wall: FakeWall;
  readonly session: Session;
  readonly loop: GameLoop<unknown>;
  /** Replace what the session sees as the loop's state (an injected bad state). */
  inject(s: GameState | null): void;
  memory(): OnboardingIds;
}

function boot(
  o: { area?: StorageArea; wall?: FakeWall; initial?: GameState; autosaveMs?: number } = {},
): Booted {
  const area = o.area ?? createStorageArea();
  const clock = createFakeClock();
  const wall = o.wall ?? createFakeWall();
  const hub = createErrorHub();
  const session = createSession({
    kv: area.connect(window),
    wall,
    clock,
    hub,
    win: window,
    channel: null,
    gameVersion: '0.4.0',
    autosaveMs: o.autosaveMs,
  });
  let memory = session.loaded.save.onboarding;
  const loop = createGameLoop({
    clock,
    hub,
    derive: (s) => s.sum.x,
    initial: o.initial ?? session.loaded.save.game,
    onGap: session.onGap,
  });
  let injected: GameState | null = null;
  const seen: GameLoop<unknown> = { ...loop, state: () => injected ?? loop.state() };
  session.attach(seen, {
    ids: () => memory,
    reset: (ids) => {
      memory = ids;
    },
  });
  disposers.push(() => {
    session.dispose();
    loop.stop();
  });
  return {
    area,
    clock,
    wall,
    session,
    loop,
    inject: (s) => {
      injected = s;
    },
    memory: () => memory,
  };
}

/** Runs frames until `p` settles (the offline runner works one slice per frame). */
async function settle(clock: FakeClock, p: Promise<unknown>): Promise<void> {
  let done = false;
  void p.then(() => (done = true));
  for (let i = 0; i < 5000 && !done; i++) {
    clock.frame(16);
    await Promise.resolve();
    await Promise.resolve();
  }
  await p;
}

const savedTimes = (area: StorageArea) => {
  const meta = JSON.parse(area.data.get(KEYS.meta)!) as { active: 'a' | 'b' };
  const r = decodeSave(area.data.get(KEYS[meta.active]));
  if (r.kind !== 'ok') throw new Error('no save');
  return r.meta;
};

describe('the session (GDD §20.1)', () => {
  it('start saves the loaded game, then plays and autosaves every 15 s', () => {
    vi.useFakeTimers();
    const b = boot({ initial: makeState({ x: 10, amounts: [1], bought: [1] }) });
    void b.session.start();
    expect(b.loop.running).toBe(true);
    expect(b.session.view().lastSavedAt).toBe(WALL_T0);
    const first = b.area.data.get(KEYS.meta);
    b.clock.advance(1000);
    b.wall.advance(15_000);
    vi.advanceTimersByTime(15_000);
    expect(b.area.data.get(KEYS.meta)).not.toBe(first);
    expect(b.session.view().lastSavedAt).toBe(WALL_T0 + 15_000);
  });

  it('a state with a NaN Num is refused before saving: storage is unchanged and autosave stops', () => {
    vi.useFakeTimers();
    const b = boot({ initial: makeState({ x: 10, amounts: [1], bought: [1] }) });
    void b.session.start();
    b.clock.advance(500);
    const stored = b.area.snapshot();
    const s = b.loop.state();
    b.inject({ ...s, sum: { ...s.sum, x: num(Number.NaN) } });
    expect(b.session.saveNow()).toEqual({ ok: false, reason: 'invariant' });
    expect(b.loop.hub.fault?.kind).toBe('invariant');
    expect(b.loop.hub.fault?.problems).toContain('sum.x: not a valid Num');
    expect(b.loop.running).toBe(false);
    // No write over another 15 s, on hide or on pagehide, nor from Save now.
    vi.advanceTimersByTime(45_000);
    window.dispatchEvent(new Event('pagehide'));
    expect(b.session.saveNow().ok).toBe(false);
    expect(b.area.snapshot()).toEqual(stored);
    // The last good save is the stored one, byte for byte.
    expect(b.session.lastGood()).toBe(b.area.data.get(KEYS.a));
  });

  it('a newer saveVersion is refused: nothing is written and autosave is off', () => {
    vi.useFakeTimers();
    const area = createStorageArea();
    const newer = encodePlainFrame(
      JSON.stringify({ ...JSON.parse(encodeSave(sampleSave(), META).json), saveVersion: 9 }),
    );
    area.data.set(KEYS.meta, JSON.stringify({ active: 'a', seq: 4, owner: null }));
    area.data.set(KEYS.a, newer);
    const b = boot({ area });
    const afterClaim = area.snapshot();
    void b.session.start();
    expect(b.session.view()).toMatchObject({
      readOnly: true,
      newer: { blob: newer, saveVersion: 9 },
      active: true,
    });
    expect(b.loop.running).toBe(true); // a new game plays, in memory
    vi.advanceTimersByTime(60_000);
    window.dispatchEvent(new Event('pagehide'));
    expect(b.session.saveNow()).toEqual({ ok: false, reason: 'readOnly' });
    expect(b.session.adopt(sampleSave(), META)).toBe(false);
    expect(area.snapshot()).toEqual(afterClaim);
    expect(area.data.get(KEYS.a)).toBe(newer);
  });

  it('the quota banner shows and the next autosave retries and succeeds once there is room', () => {
    vi.useFakeTimers();
    const b = boot({ initial: makeState({ x: 10, amounts: [1], bought: [1] }) });
    void b.session.start();
    expect(b.session.view().storage).toBe('ok');
    b.area.quotaBytes = b.area.bytes() + 16;
    b.clock.advance(1000);
    expect(b.session.saveNow()).toEqual({ ok: false, reason: 'quota' });
    expect(b.session.view().storage).toBe('quota');
    expect(JSON.parse(b.area.data.get(KEYS.meta)!).active).toBe('a');
    // Still full at the next autosave: still the previous slot.
    vi.advanceTimersByTime(15_000);
    expect(JSON.parse(b.area.data.get(KEYS.meta)!).active).toBe('a');
    b.area.quotaBytes = Number.POSITIVE_INFINITY;
    vi.advanceTimersByTime(15_000);
    expect(JSON.parse(b.area.data.get(KEYS.meta)!).active).toBe('b');
    expect(b.session.view().storage).toBe('ok');
  });

  it(
    'a scripted clock of +24 h, back, +24 h again credits 24 h in total and savedAt never decreases',
    { timeout: 60_000 },
    async () => {
      const area = createStorageArea();
      const wall = createFakeWall(WALL_T0);
      const credits: number[] = [];
      const times: { savedAt: number; maxSeenAt: number }[] = [];
      for (const at of [WALL_T0, WALL_T0 + 24 * HOUR_MS, WALL_T0, WALL_T0 + 24 * HOUR_MS]) {
        wall.set(at);
        const b = boot({
          area,
          wall,
          initial: credits.length === 0 ? makeState({ amounts: [1], bought: [1] }) : undefined,
        });
        credits.push(b.session.loaded.credit);
        await settle(b.clock, b.session.start());
        times.push(savedTimes(area));
        for (const d of disposers.splice(0)) d();
      }
      expect(credits).toEqual([0, OFFLINE_CAP_S, 0, 0]);
      expect(credits.reduce((a, c) => a + c, 0)).toBe(24 * 3600);
      for (let i = 1; i < times.length; i++) {
        expect(times[i]!.savedAt).toBeGreaterThanOrEqual(times[i - 1]!.savedAt);
        expect(times[i]!.maxSeenAt).toBeGreaterThanOrEqual(times[i - 1]!.maxSeenAt);
      }
      expect(times.map((t) => t.savedAt)).toEqual([
        WALL_T0,
        WALL_T0 + 24 * HOUR_MS,
        WALL_T0 + 24 * HOUR_MS,
        WALL_T0 + 24 * HOUR_MS,
      ]);
    },
  );

  it('a load with 2 h of credit catches up behind the progress state, then shows While away', async () => {
    const area = createStorageArea();
    const save = { ...sampleSave(), game: makeState({ x: 10, amounts: [1], bought: [1] }) };
    const meta = { ...META, savedAt: WALL_T0, maxSeenAt: WALL_T0 };
    area.data.set(KEYS.meta, JSON.stringify({ active: 'a', seq: 1, owner: null }));
    area.data.set(KEYS.a, encodeSave(save, meta).blob);
    const b = boot({ area, wall: createFakeWall(WALL_T0 + 2 * HOUR_MS) });
    expect(b.session.loaded.credit).toBe(7200);
    const started = b.session.start();
    expect(b.session.view().catchUp).toMatchObject({ done: 0 });
    expect(b.session.view().active).toBe(false);
    expect(b.loop.running).toBe(false);
    await settle(b.clock, started);
    const v = b.session.view();
    expect(v.catchUp).toBeNull();
    expect(v.active).toBe(true);
    expect(v.away?.seconds).toBe(7200);
    expect(serializeState(b.loop.state())).toBe(serializeState(advance(save.game, 7200)));
    expect(v.away?.after.x.eq(b.loop.state().sum.x)).toBe(true);
    expect(v.away?.before.x.toNumber()).toBe(10);
    expect(b.loop.running).toBe(true);
    // Saved right after the catch-up.
    expect(savedTimes(area).savedAt).toBe(WALL_T0 + 2 * HOUR_MS);
    b.session.dismissAway();
    expect(b.session.view().away).toBeNull();
  });

  it(`a credit below ${AWAY_MIN_S} s is advanced silently`, async () => {
    const area = createStorageArea();
    area.data.set(KEYS.a, encodeSave(sampleSave(), META).blob);
    const b = boot({ area, wall: createFakeWall(META.maxSeenAt + 30_000) });
    expect(b.session.loaded.credit).toBe(30);
    await settle(b.clock, b.session.start());
    expect(b.session.view().away).toBeNull();
    expect(b.loop.state().time).toBeCloseTo(sampleSave().game.time + 0.35 + 30, 9);
  });

  it('a gap of 2 h in the session goes through the runner and ends in While away', async () => {
    const b = boot({ initial: makeState({ x: 10, amounts: [1], bought: [1] }) });
    void b.session.start();
    b.clock.advance(1000);
    const before = b.loop.state();
    b.clock.frame(2 * HOUR_MS);
    expect(b.loop.running).toBe(false);
    expect(b.session.view().catchUp).not.toBeNull();
    for (let i = 0; i < 200 && b.session.view().catchUp !== null; i++) {
      b.clock.frame(16);
      await Promise.resolve();
    }
    await Promise.resolve();
    const v = b.session.view();
    expect(v.away?.seconds).toBe(7200);
    expect(serializeState(b.loop.state())).toBe(serializeState(advance(before, 7200)));
    expect(b.loop.running).toBe(true);
  });

  it('import and restore adopt a save with no credit and the higher of both times', () => {
    const b = boot();
    void b.session.start();
    const save = sampleSave();
    const later = { savedAt: WALL_T0 + 5 * HOUR_MS, maxSeenAt: WALL_T0 + 6 * HOUR_MS };
    expect(b.session.adopt(save, later)).toBe(true);
    expect(serializeState(b.loop.state())).toBe(serializeState(save.game));
    expect(b.memory()).toEqual(save.onboarding);
    expect(b.session.view().away).toBeNull();
    const t = savedTimes(b.area);
    expect(t.savedAt).toBe(later.savedAt);
    expect(t.maxSeenAt).toBe(later.maxSeenAt);
  });

  it('hard reset removes exactly the reset keys, then saves a new game to slot a as owner', () => {
    const b = boot({ initial: makeState({ x: 1e9, amounts: [5], bought: [7] }) });
    void b.session.start();
    b.session.saveNow();
    b.area.data.set(KEYS.settings, '{"settingsVersion":1,"values":{}}');
    b.area.data.set(KEYS.quarantine, 'old');
    b.area.data.set(KEYS.samples, '[]');
    expect(b.session.hardReset()).toBe(true);
    expect(b.loop.state().sum.bought).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect([...b.area.data.keys()].sort()).toEqual(
      [KEYS.a, KEYS.bak, KEYS.meta, KEYS.settings].sort(),
    );
    for (const k of RESET_KEYS) {
      if (k !== KEYS.a && k !== KEYS.bak && k !== KEYS.meta) expect(b.area.data.has(k)).toBe(false);
    }
    expect(JSON.parse(b.area.data.get(KEYS.meta)!)).toEqual({
      active: 'a',
      seq: 1,
      owner: b.session.id,
    });
    expect(b.session.view()).toMatchObject({ quarantine: false, fellBack: null });
  });

  it('a corrupt active slot falls back with the banner state, and the quarantine is offered', () => {
    const area = createStorageArea();
    area.data.set(KEYS.meta, JSON.stringify({ active: 'b', seq: 3, owner: null }));
    area.data.set(KEYS.b, 'corrupt');
    area.data.set(KEYS.a, encodeSave(sampleSave(), META).blob);
    const b = boot({ area, wall: createFakeWall(META.maxSeenAt) });
    expect(b.session.view()).toMatchObject({
      fellBack: { source: 'other' },
      quarantine: true,
      backupAt: null,
    });
    expect(b.session.quarantineBlob()).toBe('corrupt');
    expect(serializeState(b.session.loaded.save.game)).toBe(serializeState(sampleSave().game));
  });
});
