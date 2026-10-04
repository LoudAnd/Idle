// @vitest-environment node
// GDD §5.5: the exact integrator, lazy online integration, sub-resolution deferral, the clamp,
// and the refresh rule for state-dependent effects (§21.3).
import fc from 'fast-check';
import { afterEach, describe, expect, it } from 'vitest';
import { CAP, encodeNum, log10Pos, num, pow2 } from '../../src/engine/num.ts';
import type { Num } from '../../src/engine/num.ts';
import { applyAction } from '../../src/engine/actions.ts';
import type { Action } from '../../src/engine/actions.ts';
import {
  breakdown,
  foldFactors,
  installTestEffect,
  stepMultipliers,
} from '../../src/engine/effects.ts';
import {
  DEFER_LIMIT_MS,
  LAZY_FLUSH_MS,
  flush,
  integrate,
  previewSum,
} from '../../src/engine/integrate.ts';
import { makeState, serializeState } from '../../src/engine/state.ts';
import type { GameState } from '../../src/engine/state.ts';
import { replay, step, tick, addTime } from '../../src/engine/tick.ts';
import { createRng } from '../../src/sim/rng.ts';
import { FC_SEED, uniform } from './support/arbitraries.ts';

let uninstall: (() => void)[] = [];
afterEach(() => {
  for (const u of uninstall) u();
  uninstall = [];
});

function relErr(a: Num, b: Num): number {
  if (b.sign === 0) return a.sign === 0 ? 0 : Infinity;
  return Math.abs(a.div(b).toNumber() - 1);
}

/** The largest relative difference over x and every A_k. */
function worst(a: GameState, b: GameState): number {
  let w = relErr(a.sum.x, b.sum.x);
  for (let i = 0; i < 8; i++) w = Math.max(w, relErr(a.sum.amounts[i]!, b.sum.amounts[i]!));
  return w;
}

function repeat(s: GameState, n: number, dt: number): GameState {
  let out = s;
  for (let i = 0; i < n; i++) out = integrate(out, dt);
  return out;
}

function withPending(s: GameState, pendingMs: number): GameState {
  return { ...s, pendingMs };
}

const idle = (n: number): readonly (readonly Action[])[] => Array.from({ length: n }, () => []);

/**
 * m_k computed by hand from GDD §5.1–5.3, independently of the effects pipeline:
 * β · g^L · 2^min(⌊b_k/10⌋, 34), as doubles.
 */
function handMultipliers(bought: readonly number[], level: number): number[] {
  return bought.map(
    (b) => 2 * Math.pow(1.15, level) * Math.pow(2, Math.min(Math.floor(b / 10), 34)),
  );
}

/**
 * The reference solution, independent of `integrate()`: exp(J·Δ)·v as its Taylor series in
 * doubles, v = (x, A_1 … A_8) and (J·v)_k = m_(k+1)·v_(k+1). J is nilpotent (J^9 = 0), so the
 * nine terms are the exact solution; only rounding remains.
 */
function taylorReference(v0: readonly number[], m: readonly number[], d: number): number[] {
  const sum = [...v0];
  let term = [...v0];
  for (let n = 1; n <= 8; n++) {
    term = term.map((_, k) => (k < 8 ? (m[k] ?? 0) * (term[k + 1] ?? 0) * (d / n) : 0));
    term.forEach((t, k) => (sum[k] = (sum[k] ?? 0) + t));
  }
  return sum;
}

/** The largest relative difference between a state's (x, A_1 … A_8) and plain doubles. */
function worstVsDoubles(s: GameState, ref: readonly number[]): number {
  const got = [s.sum.x, ...s.sum.amounts];
  let w = 0;
  ref.forEach((r, k) => (w = Math.max(w, relErr(got[k] as Num, num(r)))));
  return w;
}

describe('exact integration (GDD §5.5)', () => {
  it('one tier: x(Δ) = x + A_1·m_1·Δ', () => {
    const s = makeState({ x: 7, amounts: [3], bought: [25], globalLevel: 4 });
    const m1 = stepMultipliers(s)[0];
    for (const d of [0.05, 1, 17.5, 3600]) {
      const out = integrate(s, d);
      expect(relErr(out.sum.x, num(7).add(m1.mul(3 * d)))).toBeLessThan(1e-15);
      expect(out.sum.amounts[0].toNumber()).toBe(3);
      expect(out.time).toBe(d);
    }
  });

  it('two tiers: x(Δ) = x + A_1·m_1·Δ + A_2·m_2·m_1·Δ²/2 and A_1(Δ) = A_1 + A_2·m_2·Δ', () => {
    const s = makeState({ x: 100, amounts: [5, 2], bought: [12, 31], globalLevel: 2 });
    const [m1, m2] = stepMultipliers(s);
    for (const d of [0.5, 60, 1000]) {
      const out = integrate(s, d);
      const x = num(100)
        .add(m1.mul(5 * d))
        .add(m2.mul(m1).mul((2 * d * d) / 2));
      expect(relErr(out.sum.x, x)).toBeLessThan(1e-14);
      expect(relErr(out.sum.amounts[0], num(5).add(m2.mul(2 * d)))).toBeLessThan(1e-15);
      expect(out.sum.amounts[1].toNumber()).toBe(2);
    }
  });

  it('only A_8 owned: a_k(Δ) = Π_(i=k+1..8) m_i · Δ^(8−k)/(8−k)! with distinct m_k (closed form)', () => {
    const bought = [0, 10, 20, 30, 40, 50, 60, 70]; // slot 2^0 … 2^7: every m_k differs
    const level = 3;
    const s = makeState({ x: 0, amounts: [0, 0, 0, 0, 0, 0, 0, 1], bought, globalLevel: level });
    const m = handMultipliers(bought, level);
    for (const d of [0.5, 2, 7.25]) {
      const out = integrate(s, d);
      const got = [out.sum.x, ...out.sum.amounts];
      for (let k = 0; k <= 8; k++) {
        let expected = 1;
        for (let i = k + 1; i <= 8; i++) expected *= (m[i - 1] ?? 0) * (d / (i - k));
        expect(relErr(got[k] as Num, num(expected)), `a_${k}(${d})`).toBeLessThan(1e-12);
      }
    }
  });

  it('all 8 tiers with distinct m_k match an independent Taylor-series solver (x and every A_k)', () => {
    const rng = createRng(FC_SEED);
    for (let n = 0; n < 25; n++) {
      const bought = Array.from({ length: 8 }, () => rng.int(201));
      const level = rng.int(21);
      const v0 = [
        10 ** (rng.next() * 12),
        ...Array.from({ length: 8 }, () => Math.floor(1 + rng.next() * 1e4)),
      ];
      const s = makeState({ x: v0[0], amounts: v0.slice(1), bought, globalLevel: level });
      const m = handMultipliers(bought, level);
      expect(stepMultipliers(s).map((v) => v.toNumber())).toEqual(
        m.map((v) => expect.closeTo(v, -Math.log10(v) + 12)),
      );
      for (const d of [0.05, 1, 2]) {
        const out = integrate(s, d);
        expect(worstVsDoubles(out, taylorReference(v0, m, d)), `state ${n}, Δ = ${d}`).toBeLessThan(
          1e-12,
        );
      }
    }
  });

  it(
    'one 3600 s integrate step matches 3,600 × 1 s within 1e-9 and 72,000 × 50 ms within 1e-6 on x and every A_k',
    { timeout: 180_000 },
    () => {
      const rng = createRng(FC_SEED);
      let tested = 0;
      for (let attempt = 0; attempt < 10_000 && tested < 3; attempt++) {
        // Event-constant multipliers: random counts and level; all 8 amounts positive.
        const s = makeState({
          x: 10 ** (rng.next() * 20),
          amounts: Array.from({ length: 8 }, () => Math.floor(1 + rng.next() * 1e6)),
          bought: Array.from({ length: 8 }, () => rng.int(341)),
          globalLevel: rng.int(61),
        });
        const big = integrate(s, 3600);
        // Keep x well below the cap (no clamp) and within layer-1 resolution limits.
        if ((log10Pos(big.sum.x) ?? 0) > 150) continue;
        tested++;
        const seconds = repeat(s, 3600, 1);
        const fine = repeat(s, 72_000, 0.05);
        expect(worst(big, seconds), `state ${tested}: 1 s steps`).toBeLessThan(1e-9);
        expect(worst(big, fine), `state ${tested}: 50 ms steps`).toBeLessThan(1e-6);
      }
      expect(tested).toBe(3);
    },
  );

  it(
    'one step equals 64 smaller ones within 1e-9 (event-constant effects, property)',
    { timeout: 60_000 },
    () => {
      const arbState = fc
        .tuple(
          fc.array(fc.oneof(fc.constant(0), uniform(0, 6)), { minLength: 8, maxLength: 8 }),
          fc.array(fc.integer({ min: 0, max: 200 }), { minLength: 8, maxLength: 8 }),
          fc.integer({ min: 0, max: 30 }),
          uniform(0, 30),
        )
        .map(([la, bought, globalLevel, lx]) =>
          makeState({
            x: 10 ** lx,
            amounts: la.map((l) => (l === 0 ? 0 : Math.floor(10 ** l))),
            bought,
            globalLevel,
          }),
        );
      fc.assert(
        fc.property(arbState, uniform(0.01, 600), (s, d) => {
          const one = integrate(s, d);
          fc.pre(one.sum.x.lt(CAP));
          const many = repeat(s, 64, d / 64);
          expect(worst(one, many)).toBeLessThan(1e-9);
        }),
        { seed: FC_SEED, numRuns: 200 },
      );
    },
  );

  it('clamps x to 2^1024 after a step, exactly', () => {
    // 2^1023.5 ≈ 1.27e308 plus 1e306 · m_1 (2·2^10) in 1 s passes 2^1024 ≈ 1.80e308.
    const s = makeState({ x: pow2(1023.5), amounts: ['1e306'], bought: [100] });
    const out = integrate(s, 1);
    expect(encodeNum(out.sum.x)).toEqual(encodeNum(CAP));
    expect(encodeNum(integrate(out, 10).sum.x)).toEqual(encodeNum(CAP));
  });

  it('a zero, negative or NaN step changes nothing', () => {
    const s = makeState({ x: 5, amounts: [1] });
    expect(integrate(s, 0)).toBe(s);
    expect(integrate(s, -1)).toBe(s);
    expect(integrate(s, Number.NaN)).toBe(s);
  });

  it('with no generators, time passes and nothing else changes', () => {
    const s = makeState({ x: 42 });
    const out = integrate(s, 12.5);
    expect(out.sum.x.toNumber()).toBe(42);
    expect(out.time).toBe(12.5);
  });
});

describe('lazy integration (GDD §5.5, §21.2)', () => {
  const S = makeState({ x: 12_345, amounts: [40, 7, 2], bought: [40, 7, 2], globalLevel: 3 });

  it('20 ticks without actions equal one 1 s integrate exactly', () => {
    const after19 = replay(S, idle(19));
    // Nothing is committed yet; the preview grows.
    expect(encodeNum(after19.sum.x)).toEqual(encodeNum(S.sum.x));
    expect(after19.time).toBe(0);
    expect(after19.pendingMs).toBe(950);
    expect(previewSum(after19).x.gt(S.sum.x)).toBe(true);
    expect(encodeNum(previewSum(after19).x)).toEqual(encodeNum(integrate(S, 0.95).sum.x));
    const after20 = replay(S, idle(20));
    expect(after20.pendingMs).toBe(0);
    expect(serializeState(after20)).toBe(serializeState(integrate(S, 1)));
    expect(LAZY_FLUSH_MS).toBe(1000);
  });

  it('an action flushes the pending time before it applies', () => {
    // x = 18 cannot pay G1's second purchase (10^1.3 ≈ 19.95), x after 0.4 s can (+2.4 per 0.4 s).
    const s = makeState({ x: 18, amounts: [3], bought: [1] });
    const buy: Action = { type: 'buy', tier: 1, mode: 'one' };
    expect(applyAction(s, buy)).toBe(s);
    const waited = replay(s, idle(8));
    expect(waited.pendingMs).toBe(400);
    const out = tick(waited, [buy]);
    expect(out.sum.bought[0]).toBe(2);
    const expected = withPending(applyAction(integrate(s, 0.4), buy), 50);
    expect(serializeState(out)).toBe(serializeState(expected));
  });

  it('addTime adds to the pending time and flushes once 1 s is pending', () => {
    const a = addTime(S, 700);
    expect(a.pendingMs).toBe(700);
    expect(a.time).toBe(0);
    const b = addTime(a, 2300);
    expect(b.pendingMs).toBe(0);
    expect(serializeState(b)).toBe(serializeState(integrate(S, 3)));
  });

  it('step() flushes, applies the actions, then integrates exactly', () => {
    const buy: Action = { type: 'buy', tier: 2, mode: 'max' };
    const s = withPending(makeState({ x: 1e6, amounts: [1] }), 300);
    const expected = integrate(applyAction(flush(s, { force: true }), buy), 1);
    expect(serializeState(step(s, [buy], 1))).toBe(serializeState(expected));
  });
});

describe('sub-resolution deferral (GDD §5.5)', () => {
  it('defers a periodic flush that would leave x unchanged, up to 60 s', () => {
    // x = 1e100 grows by 2 per second: far below its resolution.
    const s = makeState({ x: '1e100', amounts: [1], bought: [1] });
    const a = replay(s, idle(20));
    expect(a.pendingMs).toBe(1000);
    expect(a.time).toBe(0);
    const b = replay(s, idle(DEFER_LIMIT_MS / 50 - 1));
    expect(b.pendingMs).toBe(DEFER_LIMIT_MS - 50);
    expect(b.time).toBe(0);
    const c = tick(b, []);
    expect(c.pendingMs).toBe(0);
    expect(c.time).toBe(60);
  });

  it('keeps slow growth that single 1 s flushes would lose', { timeout: 30_000 }, () => {
    // x = 1e20 grows by 2e5 per second: 2e-15 relative, below the layer-1 resolution
    // (about 4e-15 at mag 20), so x + one second's growth rounds back to x.
    const s = makeState({ x: '1e20', amounts: [1e5], bought: [1] });
    expect(integrate(s, 1).sum.x.eq(s.sum.x)).toBe(true);
    const online = replay(s, idle(1200)); // 60 s of ticks
    expect(online.sum.x.gt(s.sum.x)).toBe(true);
    const exact = integrate(s, 60);
    expect(exact.sum.x.gt(s.sum.x)).toBe(true);
    // Each commit rounds x to its resolution, so online and exact agree to a few steps of it.
    expect(relErr(online.sum.x, exact.sum.x)).toBeLessThan(1e-12);
    const grown = online.sum.x.sub(s.sum.x).div(exact.sum.x.sub(s.sum.x)).toNumber();
    expect(grown).toBeGreaterThan(0.5);
    expect(grown).toBeLessThan(3);
    expect(online.time + online.pendingMs / 1000).toBeCloseTo(60, 9);
  });

  it('a no-op action is not an event: the pending time keeps accumulating (no lost growth)', () => {
    // x = 1e20 grows by 4e6/s: 4e-14 relative per second commits, 2e-15 per 50 ms would not.
    const s = makeState({ x: '1e20', amounts: [2e6], bought: [1] });
    const noop: Action = { type: 'buy', tier: 8, mode: 'one' }; // costs 1e29 > x
    expect(applyAction(s, noop)).toBe(s);
    const quiet = replay(s, idle(1200));
    const noisy = replay(
      s,
      Array.from({ length: 1200 }, () => [noop]),
    );
    expect(quiet.sum.x.gt(s.sum.x)).toBe(true);
    expect(serializeState(noisy)).toBe(serializeState(quiet));
    const one = tick(withPending(s, 500), [noop]);
    expect(one.time).toBe(0);
    expect(one.pendingMs).toBe(550);
    // A real purchase is an event and still flushes first.
    const buy = tick(withPending(makeState({ x: 1e6, amounts: [1] }), 500), [
      { type: 'buy', tier: 2, mode: 'one' },
    ]);
    expect(buy.time).toBe(0.5);
    expect(buy.pendingMs).toBe(50);
  });

  it('event flushes always commit, even sub-resolution growth', () => {
    const s = replay(makeState({ x: '1e100', amounts: [1], bought: [1] }), idle(30));
    expect(s.pendingMs).toBe(1500);
    const out = tick(s, [{ type: 'buy', tier: 8, mode: 'one' }]);
    expect(out.time).toBe(1.5);
    expect(out.pendingMs).toBe(50);
  });

  it('does not defer at the cap', () => {
    const s = makeState({ x: CAP, amounts: [1], bought: [1] });
    const out = replay(s, idle(20));
    expect(out.time).toBe(1);
    expect(encodeNum(out.sum.x)).toEqual(encodeNum(CAP));
  });
});

describe('effects pipeline (GDD §21.3)', () => {
  it('folds ((1 + Σ add) · Π mul) ^ (Π pow) in content order', () => {
    const f = (kind: 'add' | 'mul' | 'pow', v: number) => ({
      id: kind,
      label: 'factor.beta',
      params: {},
      kind,
      value: num(v),
    });
    expect(foldFactors([]).toNumber()).toBe(1);
    expect(foldFactors([f('mul', 2), f('mul', 3)]).toNumber()).toBe(6);
    expect(foldFactors([f('mul', 2), f('add', 0.5), f('pow', 2)]).toNumber()).toBeCloseTo(9, 12);
    expect(foldFactors([f('add', 1), f('add', 2)]).toNumber()).toBe(4);
  });

  it('state-dependent effects are evaluated once per integration step and tier', () => {
    let calls = 0;
    uninstall.push(
      installTestEffect({
        id: 'test.state',
        target: 'tierMult',
        tiers: [1],
        kind: 'mul',
        class: 'state',
        label: 'factor.beta',
        value: () => {
          calls++;
          return num(3);
        },
      }),
    );
    const s = makeState({ x: 0, amounts: [1] });
    const plain = 2; // β · 1.15^0 · 2^0
    const out = integrate(s, 3600);
    expect(calls).toBe(1);
    expect(out.sum.x.toNumber()).toBeCloseTo(plain * 3 * 3600, 6);
    repeat(s, 5, 1);
    expect(calls).toBe(6);
    expect(breakdown(s, 1).map((f) => f.id)).toEqual([
      'sum.beta',
      'sum.global',
      'sum.slot',
      'test.state',
    ]);
    expect(breakdown(s, 2).map((f) => f.id)).toEqual(['sum.beta', 'sum.global', 'sum.slot']);
  });

  it('a test effect installed after a table was cached takes effect, and leaves on uninstall', () => {
    const s = integrate(makeState({ x: 0, amounts: [1] }), 1); // caches the table
    expect(s.table).not.toBeNull();
    const before = stepMultipliers(s)[0].toNumber();
    const off = installTestEffect({
      id: 'test.event',
      target: 'tierMult',
      tiers: 'all',
      kind: 'mul',
      class: 'event',
      label: 'factor.beta',
      value: () => num(5),
    });
    uninstall.push(off);
    expect(stepMultipliers(s)[0].toNumber()).toBe(before * 5);
    off();
    expect(stepMultipliers(s)[0].toNumber()).toBe(before);
  });

  it('a global level marks the table dirty, and its ×1.15 applies from the tick it is bought in', () => {
    const s = integrate(makeState({ x: '1e6', amounts: [1, 1], bought: [1, 1] }), 1);
    expect(s.table).not.toBeNull();
    const buy: Action = { type: 'buyGlobal', mode: 'one' };
    const before = stepMultipliers(s);
    const after = applyAction(s, buy);
    expect(after.sum.globalLevel).toBe(1);
    expect(after.table).toBeNull();
    const m = stepMultipliers(after);
    m.forEach((v, i) => expect(v.div(before[i]!).toNumber(), `m_${i + 1}`).toBeCloseTo(1.15, 12));
    // A tick carrying the purchase produces at the new rate: the preview after its 50 ms.
    const ticked = tick(s, [buy]);
    expect(ticked.pendingMs).toBe(50);
    expect(stepMultipliers(ticked)[0].toNumber()).toBeCloseTo(m[0].toNumber(), 12);
    const expected = integrate(after, 0.05).sum.x;
    expect(relErr(previewSum(ticked).x, expected)).toBeLessThan(1e-15);
    const stale = integrate({ ...after, table: s.table }, 0.05).sum.x;
    expect(relErr(stale, expected)).toBeGreaterThan(1e-9); // the old table would show
  });

  it('a purchase marks the table dirty; a no-op purchase keeps it', () => {
    const s = integrate(makeState({ x: '1e6', amounts: [1] }), 1);
    expect(s.table).not.toBeNull();
    const bought = applyAction(s, { type: 'buy', tier: 1, mode: 'max' });
    expect(bought.table).toBeNull();
    expect(stepMultipliers(bought)[0].gt(stepMultipliers(s)[0])).toBe(true);
    const none = applyAction(s, { type: 'buy', tier: 8, mode: 'max' });
    expect(none).toBe(s);
  });
});
