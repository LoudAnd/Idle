// @vitest-environment node
// GDD §17.1: the ×10^Y /min readout is the change of log10 x over the trailing 60 s, skips
// samples with x ≤ 0, and is `—` (null) with fewer than 2 positive samples.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ZERO, fromComponents, num } from '../../src/engine/num.ts';
import { GROWTH_WINDOW_S, addSample, growthPerMinute } from '../../src/ui/growth.ts';
import type { Sample } from '../../src/ui/growth.ts';
import { FC_SEED, arbNum } from './support/arbitraries.ts';

/** Feeds x(t) at the given times. */
function feed(points: readonly (readonly [number, number | string])[]): readonly Sample[] {
  let s: readonly Sample[] = [];
  for (const [t, x] of points) s = addSample(s, t, num(x));
  return s;
}

describe('growth readout (GDD §17.1)', () => {
  it('equals Δlog10 x over the trailing 60 s (61 synthetic samples)', () => {
    // x = 10^(2 + 0.05 t): 3 orders of magnitude per minute.
    const pts = Array.from({ length: 61 }, (_, t) => [t, 10 ** (2 + 0.05 * t)] as const);
    const s = feed(pts);
    expect(s).toHaveLength(61);
    expect(growthPerMinute(s)).toBeCloseTo(3, 12);
    expect(GROWTH_WINDOW_S).toBe(60);
  });

  it('samples older than 60 s are ignored', () => {
    // A jump at t = 0…9 (x = 1e50) is outside the window once t = 100.
    const pts: [number, number | string][] = [];
    for (let t = 0; t < 10; t++) pts.push([t, '1e50']);
    for (let t = 10; t <= 100; t++) pts.push([t, 10 ** (0.01 * t)]);
    const s = feed(pts);
    expect(s[0]!.t).toBe(40);
    expect(growthPerMinute(s)).toBeCloseTo(0.6, 12); // log10 x(100) − log10 x(40)
  });

  it('x = 0 samples are skipped', () => {
    const s = feed([
      [0, 0],
      [1, 0],
      [2, 100],
      [3, 0],
      [4, 1000],
    ]);
    expect(s.map((p) => p.t)).toEqual([2, 4]);
    expect(growthPerMinute(s)).toBeCloseTo(1, 12);
  });

  it('fewer than 2 positive samples → null (the header shows —)', () => {
    expect(growthPerMinute([])).toBeNull();
    expect(growthPerMinute(feed([[0, 10]]))).toBeNull();
    expect(
      growthPerMinute(
        feed([
          [0, 0],
          [1, 0],
          [2, 10],
        ]),
      ),
    ).toBeNull();
  });

  it('at most one sample per whole second of game time', () => {
    const s = feed([
      [0, 10],
      [0.05, 11],
      [0.95, 12],
      [1.0, 13],
      [1.5, 14],
    ]);
    expect(s.map((p) => p.t)).toEqual([0, 1]);
    const same = addSample(s, 1.7, num(15));
    expect(same).toBe(s);
  });

  it('a window shorter than 60 s is the literal change, not extrapolated; drops are negative', () => {
    expect(
      growthPerMinute(
        feed([
          [0, 100],
          [10, 1000],
        ]),
      ),
    ).toBeCloseTo(1, 12);
    expect(
      growthPerMinute(
        feed([
          [0, 1000],
          [1, 10],
        ]),
      ),
    ).toBeCloseTo(-2, 12);
  });

  it('a time before the newest sample restarts the series', () => {
    const s = addSample(
      feed([
        [5, 10],
        [6, 100],
      ]),
      1,
      num(1000),
    );
    expect(s.map((p) => p.t)).toEqual([1]);
  });

  it('is finite for any positive x, including 1e-400 and values in (0, 1)', () => {
    expect(
      growthPerMinute(
        feed([
          [0, '1e-400'],
          [1, 0.5],
        ]),
      ),
    ).toBeCloseTo(400 - Math.log10(2), 9);
    fc.assert(
      fc.property(arbNum, arbNum, (a, b) => {
        let s = addSample([], 0, a);
        s = addSample(s, 1, b);
        const y = growthPerMinute(s);
        if (y !== null) expect(Number.isFinite(y)).toBe(true);
      }),
      { seed: FC_SEED, numRuns: 2000 },
    );
    expect(
      growthPerMinute(addSample(addSample([], 0, ZERO), 1, fromComponents(1, 1, 1e5))),
    ).toBeNull();
  });
});
