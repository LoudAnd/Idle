// @vitest-environment node
// src/sim/rng.ts: the seeded sfc32 generator used by bots and fuzz tests (GDD §21.2).
import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/sim/rng.ts';

describe('createRng (sfc32)', () => {
  it('gives fixed first outputs for seed 1 (a regression snapshot)', () => {
    const r = createRng(1);
    expect(Array.from({ length: 5 }, () => r.next())).toEqual([
      0.4256499295588583, 0.79042171058245, 0.6910148127935827, 0.5241122804582119,
      0.9659408878069371,
    ]);
  });

  it('is deterministic per seed, and seeds differ', () => {
    const a = createRng(42);
    const b = createRng(42);
    const c = createRng(43);
    const xs = Array.from({ length: 100 }, () => a.next());
    expect(Array.from({ length: 100 }, () => b.next())).toEqual(xs);
    expect(Array.from({ length: 100 }, () => c.next())).not.toEqual(xs);
  });

  it('next() is in [0, 1) and int(n) in [0, n)', () => {
    const r = createRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 10_000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      const k = r.int(3);
      expect(Number.isInteger(k) && k >= 0 && k < 3).toBe(true);
      seen.add(k);
    }
    expect([...seen].sort()).toEqual([0, 1, 2]);
    expect(r.int(0)).toBe(0);
    expect(r.int(1)).toBe(0);
    expect(r.int(2.5)).toBe(0);
  });
});
