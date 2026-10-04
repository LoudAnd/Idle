// @vitest-environment node
// GDD §20.2, §21.8: the offline runner works in slices (≤ 8 ms, and at most 64 pieces on a clock
// that does not move inside a frame), reports progress, gives exactly advance()'s result, and
// ends with null on a fault or cancel().
import { afterEach, describe, expect, it } from 'vitest';
import { installTestEffect } from '../../src/engine/effects.ts';
import { num } from '../../src/engine/num.ts';
import { advance, startAdvance } from '../../src/engine/offline.ts';
import { makeState, serializeState } from '../../src/engine/state.ts';
import { createErrorHub } from '../../src/platform/errors.ts';
import { MAX_STEPS_PER_SLICE, SLICE_MS, runOffline } from '../../src/platform/offlineRunner.ts';
import type { Clock } from '../../src/platform/clock.ts';
import { createFakeClock } from '../ui/support/fakeClock.ts';

let cleanups: (() => void)[] = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
});

const s0 = makeState({ x: 10, amounts: [3, 1], bought: [3, 1] });

async function drain<T>(clock: ReturnType<typeof createFakeClock>, p: Promise<T>): Promise<T> {
  let done = false;
  void p.then(() => (done = true));
  for (let i = 0; i < 1000 && !done; i++) {
    clock.frame(16);
    await Promise.resolve();
  }
  return p;
}

describe('the offline runner (GDD §20.2)', () => {
  it('slices of at most 64 pieces on a still clock, with progress, ending in advance()’s state', async () => {
    expect(SLICE_MS).toBe(8);
    expect(MAX_STEPS_PER_SLICE).toBe(64);
    const clock = createFakeClock();
    const progress: [number, number][] = [];
    const job = startAdvance(s0, 3600);
    const run = runOffline(job, {
      clock,
      hub: createErrorHub(),
      onProgress: (d, t) => progress.push([d, t]),
    });
    expect(progress).toEqual([]); // nothing runs before the first frame
    const out = await drain(clock, run.done);
    expect(serializeState(out!)).toBe(serializeState(advance(s0, 3600)));
    expect(progress.length).toBe(Math.ceil(job.total / 64));
    for (let i = 1; i < progress.length; i++) {
      expect(progress[i]![0] - progress[i - 1]![0]).toBeLessThanOrEqual(64);
    }
    expect(progress.at(-1)).toEqual([job.total, job.total]);
  });

  it('ends a slice after 8 ms of a moving clock', async () => {
    let t = 0;
    const frames: (() => void)[] = [];
    // Every now() costs 3 ms: a slice runs at most 4 pieces (0, 3, 6 ms; 9 ≥ 8 stops).
    const clock: Clock = {
      now: () => (t += 3),
      requestFrame: (cb) => frames.push(cb),
      cancelFrame: () => {},
    };
    const progress: number[] = [];
    const run = runOffline(startAdvance(s0, 60), {
      clock,
      hub: createErrorHub(),
      onProgress: (d) => progress.push(d),
    });
    frames.shift()!();
    expect(progress[0]).toBeLessThanOrEqual(4);
    expect(progress[0]).toBeGreaterThanOrEqual(1);
    run.cancel();
    expect(await run.done).toBeNull();
  });

  it('a NaN effect is a fault: the run ends with null and the hub has the invariant', async () => {
    const clock = createFakeClock();
    const hub = createErrorHub();
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
    const run = runOffline(startAdvance(s0, 600), { clock, hub });
    expect(await drain(clock, run.done)).toBeNull();
    expect(hub.fault?.kind).toBe('invariant');
  });

  it('a fault reported elsewhere, or cancel(), stops it', async () => {
    const clock = createFakeClock();
    const hub = createErrorHub();
    const run = runOffline(startAdvance(s0, 600), { clock, hub });
    hub.report({ kind: 'error' });
    expect(await drain(clock, run.done)).toBeNull();
    const again = runOffline(startAdvance(s0, 600), { clock, hub: createErrorHub() });
    again.cancel();
    expect(await again.done).toBeNull();
    expect(clock.pendingFrames).toBe(0);
  });

  it('a job that is already done resolves at once', async () => {
    const run = runOffline(startAdvance(s0, 0), {
      clock: createFakeClock(),
      hub: createErrorHub(),
    });
    expect(await run.done).toBe(s0);
  });
});
