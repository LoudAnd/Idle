// @vitest-environment node
// GDD §21.4, §21.8: the frame planner (at most 40 ticks per frame, the rest to the pending
// integration time, gaps over 60 s through advance() or the session's onGap) and the loop
// controller: replace, clearQueue and the pause on a fault.
import fc from 'fast-check';
import { afterEach, describe, expect, it } from 'vitest';
import { num } from '../../src/engine/num.ts';
import { installTestEffect } from '../../src/engine/effects.ts';
import { OFFLINE_CAP_S } from '../../src/engine/content/offline.ts';
import { integrate } from '../../src/engine/integrate.ts';
import { advance } from '../../src/engine/offline.ts';
import { makeState, newGame, serializeState } from '../../src/engine/state.ts';
import type { GameState } from '../../src/engine/state.ts';
import { createErrorHub } from '../../src/platform/errors.ts';
import {
  GAP_MS,
  MAX_TICKS_PER_FRAME,
  UI_FPS,
  clampUiFps,
  createGameLoop,
  planFrame,
} from '../../src/platform/loop.ts';
import { createFakeClock } from '../ui/support/fakeClock.ts';
import { FC_SEED, uniform } from './support/arbitraries.ts';

let cleanups: (() => void)[] = [];
afterEach(() => {
  for (const c of cleanups) c();
  cleanups = [];
});

/** Committed plus pending game time, in seconds. */
const played = (s: GameState) => s.time + s.pendingMs / 1000;

describe('planFrame (GDD §21.4)', () => {
  it('16.7 ms frames: ticks every third frame or so, the rest carried', () => {
    let acc = 0;
    let ticks = 0;
    for (let i = 0; i < 60; i++) {
      const p = planFrame(acc, 1000 / 60);
      expect(p.gap).toBe(false);
      expect(p.extraMs).toBe(0);
      expect(p.accMs).toBeLessThan(50);
      ticks += p.ticks;
      acc = p.accMs;
    }
    expect(ticks).toBe(20);
  });

  it('a 5 s frame runs 40 ticks and passes 3,000 ms on as extra time', () => {
    expect(planFrame(0, 5000)).toEqual({ ticks: 40, extraMs: 3000, accMs: 0, gap: false });
    expect(MAX_TICKS_PER_FRAME).toBe(40);
  });

  it('dt < 0 (or NaN) counts as 0', () => {
    expect(planFrame(10, -5)).toEqual({ ticks: 0, extraMs: 0, accMs: 10, gap: false });
    expect(planFrame(10, Number.NaN)).toEqual({ ticks: 0, extraMs: 0, accMs: 10, gap: false });
  });

  it('a gap above 60 s is handed on whole', () => {
    expect(planFrame(20, GAP_MS + 1)).toEqual({
      ticks: 0,
      extraMs: GAP_MS + 21,
      accMs: 0,
      gap: true,
    });
    expect(planFrame(0, GAP_MS).gap).toBe(false);
  });

  it('no time is dropped (property)', () => {
    fc.assert(
      fc.property(uniform(0, 49.99), uniform(-100, 200_000), (acc, dt) => {
        const p = planFrame(acc, dt);
        expect(p.ticks).toBeLessThanOrEqual(40);
        expect(p.ticks * 50 + p.extraMs + p.accMs).toBeCloseTo(acc + Math.max(0, dt), 6);
      }),
      { seed: FC_SEED, numRuns: 2000 },
    );
  });
});

function loopOn(initial: GameState = newGame()) {
  const clock = createFakeClock();
  const hub = createErrorHub();
  let derived = 0;
  const loop = createGameLoop({
    clock,
    hub,
    initial,
    derive: (s) => {
      derived++;
      return s.sum.x;
    },
  });
  return { clock, hub, loop, derivedCount: () => derived };
}

describe('the game loop (GDD §21.4)', () => {
  it('applies an enqueued action at the next tick and advances time exactly', () => {
    const { clock, loop } = loopOn();
    loop.start();
    loop.enqueue({ type: 'buy', tier: 1, mode: 'one' });
    clock.advance(50);
    expect(loop.state().sum.bought[0]).toBe(1);
    expect(loop.state().sum.x.toNumber()).toBe(0);
    clock.advance(950);
    expect(loop.state().time).toBe(1);
    expect(loop.state().pendingMs).toBe(0);
    // The tick applies the buy first, then advances 50 ms: 1 s of production at 2/s.
    expect(loop.state().sum.x.toNumber()).toBe(2);
  });

  it('a slow 5 s frame drops no time (40 ticks, then the rest exactly)', () => {
    const s = makeState({ x: 10, amounts: [1] });
    const { clock, loop } = loopOn(s);
    loop.start();
    clock.frame(5000);
    expect(played(loop.state())).toBeCloseTo(5, 12);
    expect(serializeState(loop.state())).toBe(serializeState(integrate(s, 5)));
  });

  it('a gap over 60 s goes through advance() (GDD §20.2, §21.4)', () => {
    const s = makeState({ x: 10, amounts: [1] });
    const { clock, loop } = loopOn(s);
    loop.start();
    clock.frame(120_000);
    expect(loop.state().time).toBeCloseTo(120, 9);
    expect(loop.state().pendingMs).toBe(0);
    expect(serializeState(loop.state())).toBe(serializeState(advance(s, 120)));
    expect(loop.running).toBe(true);
  });

  it('a gap beyond the offline cap is capped at 24 h', { timeout: 30_000 }, () => {
    const s = makeState({ x: 10, amounts: [1] });
    const { clock, loop } = loopOn(s);
    loop.start();
    clock.frame(30 * 3600 * 1000);
    expect(loop.state().time).toBeCloseTo(OFFLINE_CAP_S, 6);
  });

  it('with onGap, a gap stops the loop (not a fault) and is handed over', () => {
    const clock = createFakeClock();
    const gaps: number[] = [];
    const loop = createGameLoop({
      clock,
      derive: (s) => s.sum.x,
      initial: makeState({ amounts: [1] }),
      onGap: (ms) => gaps.push(ms),
    });
    loop.start();
    clock.advance(1000);
    const before = serializeState(loop.state());
    clock.frame(90_000);
    expect(gaps).toEqual([90_000]);
    expect(loop.running).toBe(false);
    expect(loop.hub.fault).toBeNull();
    expect(clock.pendingFrames).toBe(0);
    expect(serializeState(loop.state())).toBe(before);
    // The session replaces the state and starts the loop again; the gap is not counted twice.
    loop.start();
    clock.advance(1000);
    expect(loop.state().time + loop.state().pendingMs / 1000).toBeCloseTo(2, 9);
  });

  it('gapMs moves the gap threshold (a dev-hook speed)', () => {
    expect(planFrame(0, 90_000, 120_000).gap).toBe(false);
    expect(planFrame(0, 130_000, 120_000).gap).toBe(true);
  });

  it('replace() checks the invariant, clears the queue and the accumulator, derives and notifies', () => {
    const { clock, loop } = loopOn(makeState({ x: 100 }));
    let notified = 0;
    cleanups.push(loop.subscribe(() => notified++));
    loop.start();
    clock.advance(30); // 30 ms in the accumulator
    loop.enqueue({ type: 'buy', tier: 1, mode: 'max' });
    const next = makeState({ x: 5, amounts: [3] });
    expect(loop.replace(next)).toBe(true);
    expect(loop.state()).toBe(next);
    expect(loop.view()?.toNumber()).toBe(5);
    expect(notified).toBeGreaterThan(0);
    clock.advance(50);
    // The queued purchase was dropped, and the old accumulator did not carry over.
    expect(loop.state().sum.bought[0]).toBe(0);
    expect(loop.state().pendingMs).toBe(50);
    // An invalid state is refused and nothing changes.
    const bad = makeState({ x: 5 });
    const kept = loop.state();
    expect(loop.replace({ ...bad, sum: { ...bad.sum, x: num(Number.NaN) } })).toBe(false);
    expect(loop.state()).toBe(kept);
    expect(loop.hub.fault).toBeNull();
  });

  it('clearQueue() drops the queued actions', () => {
    const { clock, loop } = loopOn(makeState({ x: 100 }));
    loop.start();
    loop.enqueue({ type: 'buy', tier: 1, mode: 'max' });
    loop.clearQueue();
    clock.advance(50);
    expect(loop.state().sum.bought[0]).toBe(0);
  });

  it(`derives the view at most ${UI_FPS} times per second and notifies subscribers`, () => {
    const { clock, loop, derivedCount } = loopOn();
    let notified = 0;
    cleanups.push(loop.subscribe(() => notified++));
    loop.start();
    const before = derivedCount();
    clock.advance(1000, 1000 / 120);
    expect(derivedCount() - before).toBeLessThanOrEqual(UI_FPS + 1);
    expect(derivedCount() - before).toBeGreaterThanOrEqual(UI_FPS - 1);
    expect(notified).toBe(derivedCount() - before);
  });

  it('setUiFps changes the derive rate, clamped to [10, 60] (GDD §19, §21.4)', () => {
    const { clock, loop, derivedCount } = loopOn();
    loop.start();
    expect(loop.uiFps).toBe(UI_FPS);
    for (const fps of [15, 60]) {
      loop.setUiFps(fps);
      expect(loop.uiFps).toBe(fps);
      const before = derivedCount();
      clock.advance(1000, 1000 / 120);
      expect(derivedCount() - before).toBeLessThanOrEqual(fps + 1);
      expect(derivedCount() - before).toBeGreaterThanOrEqual(fps - 1);
    }
    expect(clampUiFps(5)).toBe(10);
    expect(clampUiFps(500)).toBe(60);
    expect(clampUiFps(Number.NaN)).toBe(UI_FPS);
    expect(clampUiFps(Number.POSITIVE_INFINITY)).toBe(UI_FPS);
    loop.setUiFps(Number.NaN);
    expect(loop.uiFps).toBe(UI_FPS);
  });

  it('observe sees the state at every tick boundary, before the tick applies its actions', () => {
    const clock = createFakeClock();
    const seen: number[] = [];
    const loop = createGameLoop({
      clock,
      derive: (s) => s.sum.x.toNumber(),
      observe: (s) => seen.push(s.sum.bought[0]),
      initial: makeState({ x: 100 }),
    });
    loop.start();
    loop.enqueue({ type: 'buy', tier: 1, mode: 'one' });
    clock.frame(150); // three ticks: the first applies the purchase
    // b1 = 0 before the first tick's purchase, then 1 before each later tick.
    expect(seen).toEqual([0, 1, 1]);
  });

  it('a throwing observe is a view fault: the loop pauses', () => {
    const clock = createFakeClock();
    const loop = createGameLoop({
      clock,
      derive: () => 0,
      observe: () => {
        throw new Error('observe');
      },
    });
    loop.start();
    clock.frame(50);
    expect(loop.hub.fault?.kind).toBe('view');
    expect(loop.running).toBe(false);
  });

  it('stop() stops frames; start() resumes without counting the stopped time', () => {
    const { clock, loop } = loopOn(makeState({ amounts: [1] }));
    loop.start();
    clock.advance(500);
    loop.stop();
    expect(loop.running).toBe(false);
    expect(clock.pendingFrames).toBe(0);
    clock.advance(10_000);
    expect(played(loop.state())).toBeCloseTo(0.5, 12);
    loop.start();
    clock.advance(500);
    expect(played(loop.state())).toBeCloseTo(1, 12);
  });
});

describe('faults pause the loop (GDD §21.8)', () => {
  it('a throwing tick pauses the loop and keeps the last good state', () => {
    const { clock, hub, loop } = loopOn(makeState({ amounts: [1] }));
    loop.start();
    clock.advance(500);
    cleanups.push(
      installTestEffect({
        id: 'test.throw',
        target: 'tierMult',
        tiers: 'all',
        kind: 'mul',
        class: 'state',
        label: 'factor.beta',
        value: () => {
          throw new Error('test effect');
        },
      }),
    );
    clock.advance(1000);
    expect(hub.fault?.kind).toBe('tick');
    expect(loop.running).toBe(false);
    expect(clock.pendingFrames).toBe(0);
    const kept = serializeState(loop.state());
    expect(loop.state().pendingMs).toBe(950); // the tick that would flush failed
    loop.enqueue({ type: 'maxAll' });
    loop.start();
    clock.advance(2000);
    expect(serializeState(loop.state())).toBe(kept);
  });

  it('a NaN effect fails the invariant and pauses the loop', () => {
    const { clock, hub, loop } = loopOn(makeState({ amounts: [1] }));
    loop.start();
    cleanups.push(
      installTestEffect({
        id: 'test.nan',
        target: 'tierMult',
        tiers: [1],
        kind: 'mul',
        class: 'event',
        label: 'factor.beta',
        value: () => num(Number.NaN),
      }),
    );
    clock.advance(1000);
    expect(hub.fault?.kind).toBe('invariant');
    expect(hub.fault?.problems).toContain('sum.x: not a valid Num');
    expect(loop.running).toBe(false);
    expect(loop.state().sum.x.toNumber()).toBe(10);
  });

  it('without a checkView, the whole view is checked: a NaN anywhere in it is a fault', () => {
    const clock = createFakeClock();
    const hub = createErrorHub();
    let bad = false;
    const loop = createGameLoop({
      clock,
      hub,
      initial: makeState({ amounts: [1] }),
      derive: (s) => ({ rows: [{ x: bad ? num(Number.NaN) : s.sum.x }] }),
    });
    loop.start();
    clock.advance(200);
    expect(hub.fault).toBeNull();
    bad = true;
    clock.advance(200);
    expect(hub.fault?.kind).toBe('invariant');
    expect(hub.fault?.problems).toEqual(['view.rows[0].x: not a valid Num']);
    expect(loop.running).toBe(false);
    expect(loop.view()?.rows[0]?.x.toNumber()).toBe(10); // the last good view (committed x)
  });

  it('a fault reported elsewhere (a global handler) pauses the loop too', () => {
    const { clock, hub, loop } = loopOn();
    loop.start();
    hub.report({ kind: 'error', error: new Error('elsewhere') });
    expect(loop.running).toBe(false);
    clock.advance(1000);
    expect(loop.state().time).toBe(0);
  });

  it('only the first fault is kept', () => {
    const hub = createErrorHub();
    const seen: string[] = [];
    hub.subscribe((f) => seen.push(f.kind));
    hub.report({ kind: 'rejection' });
    hub.report({ kind: 'error' });
    expect(hub.fault?.kind).toBe('rejection');
    expect(seen).toEqual(['rejection']);
  });
});
