// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import Decimal from 'break_eternity.js';
import fc from 'fast-check';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  CAP,
  EXACT_GAIN_LIMIT,
  ONE,
  TOWER1,
  ZERO,
  decodeNum,
  countedMethods,
  encodeNum,
  floorGain,
  fromComponents,
  installOpCounter,
  isFiniteNum,
  isValidNum,
  log10,
  log10Floor1,
  log10Pos,
  log2,
  log2Pos,
  num,
  pow10,
  pow2,
  slog10,
  subClamp,
  tetrate10,
} from '../../src/engine/num.ts';
import type { Num } from '../../src/engine/num.ts';
import {
  FC_10K,
  FC_SEED,
  arbAnyNum,
  arbLayer0,
  arbNum,
  arbOnLayer,
  uniform,
} from './support/arbitraries.ts';
import { REPO_ROOT } from '../arch/lib/scan.ts';

const PROPERTY = { timeout: 60_000 };

function comps(x: Num): [number, number, number] {
  return [x.sign, x.layer, x.mag];
}

describe('constructors and frozen constants', () => {
  it('snapshots ZERO, ONE, CAP (2^1024) and TOWER1 (2^65536)', () => {
    expect(encodeNum(ZERO)).toEqual([0, 0, 0]);
    expect(encodeNum(ONE)).toEqual([1, 0, 1]);
    expect(encodeNum(CAP)).toEqual([1, 1, 308.25471555991675]);
    expect(encodeNum(TOWER1)).toEqual([1, 1, 19728.30179583467]);
  });

  it('freezes the shared constants', () => {
    for (const c of [ZERO, ONE, CAP, TOWER1]) expect(Object.isFrozen(c)).toBe(true);
    // The library's own mutators throw on a frozen constant instead of changing it.
    expect(() => (ZERO as Decimal).fromNumber(3)).toThrow(TypeError);
    expect(encodeNum(ZERO)).toEqual([0, 0, 0]);
  });

  it('runs every bench operation on the frozen constants without throwing', () => {
    const before = [ZERO, ONE, CAP, TOWER1].map(encodeNum);
    for (const a of [ZERO, ONE, CAP, TOWER1]) {
      for (const b of [ZERO, ONE, CAP, TOWER1]) {
        expect(() => {
          a.add(b);
          a.sub(b);
          a.mul(b);
          if (b.sign !== 0) a.div(b);
          a.pow(1.15);
          a.cmp(b);
          a.max(b);
          a.gte(b);
          subClamp(a, b);
          log10Floor1(a);
          pow10(log10Floor1(a));
        }).not.toThrow();
      }
    }
    expect([ZERO, ONE, CAP, TOWER1].map(encodeNum)).toEqual(before);
  });

  it('num() returns a Num unchanged and builds Nums from numbers and strings', () => {
    const x = num(5);
    expect(num(x)).toBe(x);
    expect(num('1e-400').gt(ZERO)).toBe(true);
    expect(comps(num('1e-400'))).toEqual([1, 1, -400]);
    // The JS literal 1e-400 underflows to 0, so tiny test values must be strings.
    expect(1e-400).toBe(0);
    expect(comps(fromComponents(1, 0, 1e20))).toEqual([1, 1, 20]);
  });

  it('pow2 and pow10 are exact for integer exponents and large exponents', () => {
    expect(pow2(10).toNumber()).toBe(1024);
    expect(pow2(0).toNumber()).toBe(1);
    expect(pow2(-3).toNumber()).toBe(0.125);
    expect(pow2(52).toNumber()).toBe(2 ** 52);
    expect(pow10(-5).toNumber()).toBe(1e-5);
    expect(pow10(3).toNumber()).toBe(1000);
    expect(comps(pow10(2.586e9))).toEqual([1, 1, 2.586e9]);
    expect(comps(pow10(19728.3))).toEqual([1, 1, 19728.3]);
    expect(comps(pow10(num('1e400')))).toEqual([1, 2, 400]);
    expect(comps(pow10(num('-1e400')))).toEqual([1, 2, -400]);
    expect(comps(pow2(1280))).toEqual([1, 1, 1280 * Math.log10(2)]);
  });

  it('pow2 beyond layer 0 has mag = e·log10 2 correctly rounded (1023 and 65535 included)', () => {
    // A plain e * Math.log10(2) rounds twice and is one ulp off at these exponents.
    expect(1023 * Math.log10(2)).not.toBe(exactLog10Of2Times(1023));
    expect(65535 * Math.log10(2)).not.toBe(exactLog10Of2Times(65535));
    for (const e of [1023, 1024, 1280, 65535, 65536, 131072]) {
      expect(pow2(e).mag, `e = ${e}`).toBe(exactLog10Of2Times(e));
    }
    const off: number[] = [];
    for (let e = 54; e <= 200_000; e += 7) {
      if (pow2(e).mag !== exactLog10Of2Times(e)) off.push(e);
    }
    expect(off.slice(0, 10)).toEqual([]);
  });

  it('pow2 is correctly rounded for non-integer exponents too (property)', PROPERTY, () => {
    fc.assert(
      fc.property(uniform(53, 1e7), (e) => {
        expect(pow2(e).mag).toBe(exactLog10Of2Times(e));
      }),
      { seed: FC_SEED, numRuns: 2_000 },
    );
  });
});

/** log10 2 to 80 digits (Python decimal), as an integer scaled by 10^80. */
const LOG10_2_DIGITS =
  30102999566398119521373889472449302676818988146210854131042746112710818927442451n;
const LOG10_2_SCALE = 80;

/**
 * The double nearest e·log10 2 for a finite double e > 0, from exact BigInt arithmetic: e is
 * M·2^k exactly, and the product is written out to 60 significant digits for Number() to round.
 */
function exactLog10Of2Times(e: number): number {
  let k = 0;
  let m = e;
  while (!Number.isInteger(m)) {
    m *= 2;
    k--;
  }
  // value = m · 2^k · D / 10^80, as a decimal string with `digits` fraction digits.
  const digits = 60;
  let num = BigInt(m) * LOG10_2_DIGITS * 10n ** BigInt(digits);
  let den = 10n ** BigInt(LOG10_2_SCALE);
  if (k < 0) den *= 2n ** BigInt(-k);
  else num *= 2n ** BigInt(k);
  const q = (num / den).toString().padStart(digits + 1, '0');
  return Number(`${q.slice(0, -digits)}.${q.slice(-digits)}`);
}

describe('safe logs', () => {
  it('log10Pos is null for 0, negatives, NaN and ±Infinity', () => {
    expect(log10Pos(ZERO)).toBeNull();
    expect(log10Pos(num(-5))).toBeNull();
    expect(log10Pos(num(Number.NaN))).toBeNull();
    expect(log10Pos(num(Number.POSITIVE_INFINITY))).toBeNull();
    expect(log10Pos(num(Number.NEGATIVE_INFINITY))).toBeNull();
    expect(log10Pos(num(1000))).toBe(3);
    expect(log10Pos(num('1e-400'))).toBe(-400);
    expect(log10Pos(CAP)).toBe(308.25471555991675);
  });

  it('log10Floor1(0) and log10Floor1(1e-400) are 0', () => {
    expect(log10Floor1(ZERO)).toBe(0);
    expect(log10Floor1(num('1e-400'))).toBe(0);
    expect(log10Floor1(num(0.5))).toBe(0);
    expect(log10Floor1(ONE)).toBe(0);
    expect(log10Floor1(num(Number.NaN))).toBe(0);
    expect(log10Floor1(num(-10))).toBe(0);
    expect(log10Floor1(num(100))).toBe(2);
  });

  it('log2Pos behaves the same way in base 2', () => {
    expect(log2Pos(ZERO)).toBeNull();
    expect(log2Pos(num(-1))).toBeNull();
    expect(log2Pos(num(Number.NaN))).toBeNull();
    expect(log2Pos(num(Number.POSITIVE_INFINITY))).toBeNull();
    expect(log2Pos(num(8))).toBe(3);
    expect(log2Pos(CAP)).toBe(1024);
    expect(log2Pos(TOWER1)).toBe(65536);
  });

  it('saturates results beyond the double range', () => {
    expect(log10Pos(fromComponents(1, 3, 400))).toBe(Number.MAX_VALUE);
    expect(log10Pos(fromComponents(1, 3, -400))).toBe(-Number.MAX_VALUE);
    expect(log10Floor1(fromComponents(1, 3, 400))).toBe(Number.MAX_VALUE);
  });

  it(
    'never returns NaN (property over layers 0–3, both signs, 0, 1e-400, (0, 1), NaN, ±∞)',
    PROPERTY,
    () => {
      fc.assert(
        fc.property(arbAnyNum, (x) => {
          const a = log10Pos(x);
          const b = log2Pos(x);
          const c = log10Floor1(x);
          expect(a === null || Number.isFinite(a)).toBe(true);
          expect(b === null || Number.isFinite(b)).toBe(true);
          expect(Number.isFinite(c)).toBe(true);
          expect(c).toBeGreaterThanOrEqual(0);
          if (isValidNum(x) && x.sign > 0) {
            expect(a).not.toBeNull();
            expect(b).not.toBeNull();
          }
        }),
        FC_10K,
      );
    },
  );
});

/** The log formula's candidate: μ·2^((log2 x − base)/d), computed with log2Pos. */
function candidate(x: Num, base: number, d: number): number {
  return 2 ** (((log2Pos(x) ?? 0) - base) / d);
}

// Thresholds are built in log2 space, as the GDD requires.
const product = (n: number) => pow2(128 + 40 * Math.log2(n));
const power = (n: number) => pow2(1024 + 256 * Math.log2(n));
const height = (h: number) => pow2(2 ** (h + 15));
const productV = (x: Num) => candidate(x, 128, 40);
const powerV = (x: Num) => candidate(x, 1024, 256);
const heightV = (x: Num) => Math.log2(log2Pos(x) ?? 1) - 15;
/** The same candidates as `Num`s built in log space, which never overflow. */
const productN = (x: Num) => pow2(((log2Pos(x) ?? 0) - 128) / 40);
const powerN = (x: Num) => pow2(((log2Pos(x) ?? 0) - 1024) / 256);

/** floorGain as a plain number, for gains far below 2^53. */
const gain = (v: number | Num, x: Num, threshold: (n: number) => Num) =>
  floorGain(v, x, threshold).toNumber();

describe('floorGain thresholds', () => {
  interface ThresholdCase {
    label: string;
    threshold: (n: number) => Num;
    v: (x: Num) => number;
    n: number;
    eps: number;
  }
  const row = (
    label: string,
    threshold: (n: number) => Num,
    v: (x: Num) => number,
    n: number,
    eps: number,
  ): ThresholdCase => ({ label, threshold, v, n, eps });
  const cases: ThresholdCase[] = [
    row('P 2^128·n^40', product, productV, 1, 1e-12),
    row('P 2^128·n^40', product, productV, 2, 1e-12),
    row('P 2^128·n^40', product, productV, 34, 1e-12),
    row('E 2^1024·n^256', power, powerV, 1, 1e-12),
    row('E 2^1024·n^256', power, powerV, 2, 1e-12),
    row('height 2^(2^(h+15))', height, heightV, 1, 1e-9),
    row('height 2^(2^(h+15))', height, heightV, 2, 1e-9),
  ];

  it.each(cases)('$label at n = $n pays n, n, n − 1 (ε = $eps)', ({ threshold, v, n, eps }) => {
    const t = threshold(n);
    const above = t.mul(1 + eps);
    const below = t.mul(1 - eps);
    // The ε steps must be representable, or the test would prove nothing.
    expect(above.gt(t)).toBe(true);
    expect(below.lt(t)).toBe(true);
    expect(gain(v(t), t, threshold)).toBe(n);
    expect(gain(v(above), above, threshold)).toBe(n);
    expect(gain(v(below), below, threshold)).toBe(n - 1);
  });

  it('pays the GDD reference values (P at 1e100 is 34, E at 2^1280 is 2, h at 2^65536 is 1)', () => {
    const x = num(1e100);
    expect(gain(productV(x), x, product)).toBe(34);
    expect(gain(powerV(pow2(1280)), pow2(1280), power)).toBe(2);
    expect(gain(heightV(TOWER1), TOWER1, height)).toBe(1);
    expect(gain(heightV(pow2(131072)), pow2(131072), height)).toBe(2);
  });

  it('returns an integer-valued Num (ZERO below the first threshold)', () => {
    expect(floorGain(0.5, ONE, product)).toBe(ZERO);
    expect(isValidNum(floorGain(34.2, num(1e100), product))).toBe(true);
  });
});

describe('floorGain corrects log2(2^1280)', () => {
  it('pays 2 where the raw floor of the library log gives 1', () => {
    // break_eternity's own 2^1280 has log2 1279.9999999999993, so ⌊v⌋ = 1. With thresholds
    // built in log2 space from the same pow, floorGain corrects it to 2.
    const x = Decimal.pow(2, 1280);
    const threshold = (n: number) => Decimal.pow(2, 1024 + 256 * Math.log2(n));
    const v = 2 ** ((x.log2().toNumber() - 1024) / 256);
    expect(Math.floor(v)).toBe(1);
    expect(gain(v, x, threshold)).toBe(2);
  });

  it('corrects a candidate that is off by one in either direction', () => {
    const x = pow2(1280);
    expect(gain(1.9999999999, x, power)).toBe(2);
    expect(gain(2.0000000001, x, power)).toBe(2);
    expect(gain(3.0000000001, x, power)).toBe(2);
    expect(gain(0.5, CAP, power)).toBe(1);
  });

  it('a product-form threshold would be one ulp too high with the library pow', () => {
    expect(Decimal.pow(2, 1280).lt(Decimal.pow(2, 1024).mul(Decimal.pow(2, 256)))).toBe(true);
  });
});

describe('floorGain beyond 2^53 and past the double range', () => {
  it('an overflowed candidate (+Infinity) saturates instead of falling back to 1', () => {
    const x = pow2(300_000);
    expect(floorGain(Number.POSITIVE_INFINITY, x, power).gte(floorGain(1e300, x, power))).toBe(
      true,
    );
    expect(floorGain(Number.POSITIVE_INFINITY, x, power).eq(Number.MAX_VALUE)).toBe(true);
    // The GDD formulas overflow as doubles before TOWER1 (P) and at Tower height ≈ 3 (E).
    expect(productV(pow2(41_088))).toBe(Number.POSITIVE_INFINITY);
    expect(powerV(pow2(263_168))).toBe(Number.POSITIVE_INFINITY);
    expect(floorGain(productV(TOWER1), TOWER1, product).gt(2 ** 53)).toBe(true);
  });

  it('a Num candidate built in log space gives the gain past the double range', () => {
    // E_gain at 2^263168 is 2^((263168 − 1024)/256) = 2^1024; at 2^524288 it is 2^2044.
    expect(floorGain(powerN(pow2(263_168)), pow2(263_168), power).eq(CAP)).toBe(true);
    expect(floorGain(powerN(pow2(524_288)), pow2(524_288), power).eq(pow2(2044))).toBe(true);
    // P_gain at TOWER1 is 2^((65536 − 128)/40) = 2^1635.2.
    expect(floorGain(productN(TOWER1), TOWER1, product).eq(pow2(1635.2))).toBe(true);
  });

  it('from 2^52 on, the candidate is the gain (no ±1 step that thresholds cannot resolve)', () => {
    // At this size threshold(n) and threshold(n + 1) round to the same Num, so a correction
    // would move the gain off the candidate: v = 9007199254740948 used to pay ...949.
    const x = pow2(14_592);
    expect(power(2 ** 53).eq(power(2 ** 53 + 2))).toBe(true);
    expect(gain(2 ** 52 + 4, x, power)).toBe(2 ** 52 + 4);
    // (Above 9e15 a Num is stored on layer 1, so larger gains compare as Nums.)
    expect(floorGain(9007199254740948, x, power).eq(9007199254740948)).toBe(true);
    expect(gain(EXACT_GAIN_LIMIT + 0.5, x, power)).toBe(EXACT_GAIN_LIMIT);
    expect(floorGain(pow2(60), x, power).eq(pow2(60))).toBe(true);
    expect(floorGain(num(1e20 + 0.5), x, power).eq(num(1e20))).toBe(true);
  });
});

/** A non-decreasing sequence check with a readable failure. */
function expectNonDecreasing(values: readonly Num[], labels: readonly string[]): void {
  const bad: string[] = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i]!.lt(values[i - 1]!)) {
      bad.push(
        `${labels[i - 1]} → ${values[i - 1]!.toString()} > ${labels[i]} → ${values[i]!.toString()}`,
      );
    }
  }
  expect(bad.slice(0, 10)).toEqual([]);
}

describe('floorGain properties', () => {
  const formulas = [
    { name: 'P', threshold: product, v: productV, vNum: productN },
    { name: 'E', threshold: power, v: powerV, vNum: powerN },
  ] as const;

  it('is an integer-valued Num ≥ 0, never NaN, for any candidate and x', PROPERTY, () => {
    const threshold = (n: number) => pow2(128 + 40 * Math.log2(Math.max(n, 1e-300)));
    fc.assert(
      fc.property(
        fc.oneof(
          fc.double(),
          uniform(-10, 1e6),
          fc.constantFrom(Number.NaN, -1, 0, 2 ** 60, Number.POSITIVE_INFINITY),
          arbAnyNum,
        ),
        fc.oneof(arbNum, fc.constant(ZERO)),
        (v, x) => {
          const r = floorGain(v, x, threshold);
          expect(isValidNum(r)).toBe(true);
          expect(r.eq(r.floor())).toBe(true);
        },
      ),
      FC_10K,
    );
  });

  it.each(formulas)(
    '$name gain is non-decreasing in x (sorted x on layers 0–3, number and Num candidates)',
    PROPERTY,
    ({ threshold, v, vNum }) => {
      const xs = [
        ...fc.sample(arbNum, { seed: FC_SEED, numRuns: 5_000 }),
        ...[100, 128, 1024, 2248, 14_592, 41_088, 65_536, 263_168, 524_288].map((e) => pow2(e)),
      ].sort((a, b) => a.cmp(b));
      const labels = xs.map((x) => x.toString());
      expectNonDecreasing(
        xs.map((x) => floorGain(v(x), x, threshold)),
        labels,
      );
      expectNonDecreasing(
        xs.map((x) => floorGain(vNum(x), x, threshold)),
        labels,
      );
    },
  );

  it.each(formulas)(
    '$name gain is non-decreasing in the candidate at fixed x',
    PROPERTY,
    ({ threshold }) => {
      fc.assert(
        fc.property(arbNum, (x) => {
          const vs = [
            ...fc.sample(fc.double({ min: 0, noNaN: true }), { seed: FC_SEED, numRuns: 50 }),
            0,
            1,
            2 ** 52 - 1,
            2 ** 52,
            2 ** 53,
            1e300,
            Number.MAX_VALUE,
            Number.POSITIVE_INFINITY,
          ].sort((a, b) => a - b);
          expectNonDecreasing(
            vs.map((c) => floorGain(c, x, threshold)),
            vs.map(String),
          );
        }),
        { seed: FC_SEED, numRuns: 200 },
      );
    },
  );

  it.each(formulas)(
    '$name gain n satisfies threshold(n) ≤ x < threshold(n + 1) (x near thresholds, n < 2^40)',
    PROPERTY,
    ({ threshold, v, vNum }) => {
      fc.assert(
        fc.property(uniform(0, 40), uniform(-1e-9, 1e-9), (k, rel) => {
          const n = Math.max(1, Math.floor(2 ** k));
          const x = threshold(n).mul(1 + rel);
          for (const c of [v(x), vNum(x)]) {
            const r = floorGain(c, x, threshold).toNumber();
            if (r >= 1) expect(threshold(r).lte(x)).toBe(true);
            expect(x.lt(threshold(r + 1))).toBe(true);
          }
        }),
        { seed: FC_SEED, numRuns: 5_000 },
      );
    },
  );
});

describe('subClamp never returns a negative value', () => {
  it('handles the edges', () => {
    expect(subClamp(ZERO, ZERO)).toBe(ZERO);
    expect(subClamp(num(5), num(5))).toBe(ZERO);
    expect(subClamp(num(5), num(7))).toBe(ZERO);
    expect(subClamp(num(7), num(5)).toNumber()).toBe(2);
    expect(subClamp(CAP, ONE).eq(CAP)).toBe(true);
  });

  it('never turns invalid input into a valid value (a NaN x or cost stays visible)', () => {
    for (const [x, cost] of [
      [num(5), num(Number.NaN)],
      [num(Number.NaN), num(1)],
      [num(Number.NaN), num(Number.NaN)],
      [num(Number.POSITIVE_INFINITY), num(1)],
      [num(5), num(Number.POSITIVE_INFINITY)],
      [num(-5), num(1)],
    ] as const) {
      expect(isValidNum(subClamp(x, cost)), `${x.toString()} − ${cost.toString()}`).toBe(false);
    }
    expect(isValidNum(subClamp(num(5), num(-1)))).toBe(true);
  });

  it(
    'is invalid exactly when its input is (property over valid and invalid values)',
    PROPERTY,
    () => {
      fc.assert(
        fc.property(arbAnyNum, arbAnyNum, (x, cost) => {
          const valid = isValidNum(x) && isFiniteNum(cost);
          expect(isValidNum(subClamp(x, cost))).toBe(valid);
        }),
        FC_10K,
      );
    },
  );

  it('equals x − cost when x ≥ cost and ZERO otherwise (property, layers 0–2)', PROPERTY, () => {
    const arb = fc.oneof(arbLayer0, arbOnLayer(1), arbOnLayer(2), fc.constant(ZERO));
    fc.assert(
      fc.property(arb, arb, (x, cost) => {
        const r = subClamp(x, cost);
        expect(isValidNum(r)).toBe(true);
        expect(r.sign).toBeGreaterThanOrEqual(0);
        if (x.gte(cost)) expect(r.eq(x.sub(cost))).toBe(true);
        else expect(r).toBe(ZERO);
      }),
      FC_10K,
    );
  });
});

describe('isValidNum rejects NaN, ±Infinity and negatives', () => {
  it.each([
    ['NaN', num(Number.NaN)],
    ['+Infinity', num(Number.POSITIVE_INFINITY)],
    ['-Infinity', num(Number.NEGATIVE_INFINITY)],
    ['-5', num(-5)],
    ['-1e-400', num('-1e-400')],
    ['-CAP', CAP.neg()],
    ['a plain number', 5],
    ['a string', '5'],
    ['null', null],
    ['an object', { sign: 1, layer: 0, mag: 5 }],
  ])('rejects %s', (_label, x) => {
    expect(isValidNum(x)).toBe(false);
  });

  it.each([
    ['ZERO', ZERO],
    ['1e-400', num('1e-400')],
    ['0.5', num(0.5)],
    ['CAP', CAP],
    ['TOWER1', TOWER1],
    ['10↑↑5', tetrate10(5)],
  ])('accepts %s', (_label, x) => {
    expect(isValidNum(x)).toBe(true);
  });

  it('a Num argument keeps its type in the failing branch (no narrowing to never)', () => {
    const report = (x: Num): number | null => {
      if (isValidNum(x)) return null;
      expectTypeOf(x).toEqualTypeOf<Num>();
      if (!isFiniteNum(x)) {
        expectTypeOf(x).toEqualTypeOf<Num>();
        return x.layer;
      }
      return x.sign;
    };
    expect(report(num(-5))).toBe(-1);
    expect(report(ONE)).toBeNull();
    // With an unknown argument they still narrow to Num.
    const u: unknown = ONE;
    if (isValidNum(u)) expectTypeOf(u).toEqualTypeOf<Num>();
  });

  it('isFiniteNum accepts negatives but not NaN or infinities', () => {
    expect(isFiniteNum(num(-5))).toBe(true);
    expect(isFiniteNum(num(Number.NaN))).toBe(false);
    expect(isFiniteNum(num(Number.POSITIVE_INFINITY))).toBe(false);
  });
});

describe('codec round-trips exactly', () => {
  const values: [string, Num][] = [
    ['0', ZERO],
    ['1', ONE],
    ['−5', num(-5)],
    ['1e-10', num(1e-10)],
    ['1.5e-300', num(1.5e-300)],
    ['10', num(10)],
    ['2^128', pow2(128)],
    ['1e308', num(1e308)],
    ['2^1024', CAP],
    ['2^65536', TOWER1],
    ['10^10^20', pow10(pow10(20))],
    ['10↑↑5', tetrate10(5)],
  ];

  it.each(values)('%s', (_label, v) => {
    const json = JSON.stringify(encodeNum(v));
    const back = decodeNum(JSON.parse(json));
    expect(back).not.toBeNull();
    expect(comps(back!)).toEqual(comps(v));
    expect(back!.eq(v)).toBe(true);
  });

  it('writes a negative zero as 0', () => {
    expect(Object.is(encodeNum(num(-0))[0], 0)).toBe(true);
    expect(Object.is(encodeNum(num(-0))[2], 0)).toBe(true);
    expect(JSON.stringify(encodeNum(num(-0)))).toBe('[0,0,0]');
    // ZERO.neg() has sign −0 in 2.1.3; it is still valid and still encodes as [0, 0, 0].
    expect(Object.is(ZERO.neg().sign, -0)).toBe(true);
    expect(isValidNum(ZERO.neg())).toBe(true);
    expect(Object.is(encodeNum(ZERO.neg())[0], 0)).toBe(true);
  });
});

describe('codec property at layers 0–3', () => {
  it('decode(JSON(encode(v))) has identical components', PROPERTY, () => {
    const arb = fc.oneof(
      arbNum,
      arbNum.map((x) => x.neg()),
    );
    fc.assert(
      fc.property(arb, (v) => {
        const back = decodeNum(JSON.parse(JSON.stringify(encodeNum(v))));
        expect(back).not.toBeNull();
        // Identical components, except that a zero's sign −0 (from ZERO.neg()) becomes 0.
        expect(comps(back!)).toEqual(comps(v).map((c) => c + 0));
        expect(back!.eq(v)).toBe(true);
      }),
      FC_10K,
    );
  });
});

describe('decodeNum never throws on malformed codes', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a number', 5],
    ['a string', '[1,0,5]'],
    ['an object', { 0: 1, 1: 0, 2: 5, length: 3 }],
    ['an empty array', []],
    ['two elements', [1, 0]],
    ['four elements', [1, 0, 5, 0]],
    ['NaN mag', [1, 0, Number.NaN]],
    ['infinite mag', [1, 0, Number.POSITIVE_INFINITY]],
    ['NaN sign', [Number.NaN, 0, 5]],
    ['sign 2', [2, 0, 5]],
    ['string sign', ['1', 0, 5]],
    ['fractional layer', [1, 0.5, 5]],
    ['negative layer', [1, -1, 5]],
    ['infinite layer', [1, Number.POSITIVE_INFINITY, 5]],
    ['non-zero mag with sign 0', [0, 0, 5]],
    ['layer with sign 0', [0, 1, 0]],
    ['negative mag on layer 0', [1, 0, -1]],
    ['sign 1 with mag 0 on layer 0', [1, 0, 0]],
    ['layer 1 with |mag| below log10(9e15)', [1, 1, 1]],
    ['layer 2 with a small negative mag', [1, 2, -1e-300]],
    ['layer 0 with mag ≥ 9e15', [1, 0, 9e15]],
    ['layer 0 with mag below 1/9e15', [1, 0, 1e-16]],
    ['layer 1 with mag ≥ 9e15', [1, 1, 1e16]],
    ['a layer beyond 2^53', [1, 2 ** 53 + 2, 20]],
  ])('returns null for %s', (_label, code) => {
    expect(() => decodeNum(code)).not.toThrow();
    expect(decodeNum(code)).toBeNull();
  });

  it(
    'returns null at once for mag 0 on a huge layer (normalizing it would loop once per layer)',
    { timeout: 30_000 },
    () => {
      // Run in a child process with a kill timer: a synchronous hang would block this worker,
      // and Vitest's timeout cannot interrupt it.
      const codes = [
        [1, 2 ** 53 - 1, 0],
        [-1, 1e15, 0],
        [1, 1e8, -0],
        [1, 2 ** 53 - 1, -0],
      ];
      const url = pathToFileURL(join(REPO_ROOT, 'src', 'engine', 'num.ts')).href;
      const code = [
        `import { decodeNum } from ${JSON.stringify(url)};`,
        `const codes = ${JSON.stringify(codes)};`,
        'codes[2][2] = -0; codes[3][2] = -0;',
        'process.stdout.write(JSON.stringify(codes.map((c) => decodeNum(c))));',
      ].join('\n');
      const env = { ...process.env };
      delete env.NODE_OPTIONS;
      const out = execFileSync(process.execPath, ['--input-type=module', '-e', code], {
        env,
        encoding: 'utf8',
        timeout: 20_000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      expect(JSON.parse(out)).toEqual([null, null, null, null]);
    },
  );

  it('accepts exactly the canonical codes: decode then encode is the identity', PROPERTY, () => {
    const layerDown = Math.log10(9e15);
    fc.assert(
      fc.property(
        fc.constantFrom(-1, 0, 1),
        fc.oneof(
          fc.integer({ min: 0, max: 4 }),
          fc.constantFrom(1e8, 1e15, 2 ** 53 - 1, 2 ** 53, 1e300),
        ),
        fc.oneof(
          fc.double({ noNaN: true, noDefaultInfinity: true }),
          fc.constantFrom(0, -0, 1, -1, layerDown, -layerDown, 9e15, 1 / 9e15, 1e-16),
          uniform(-20, 20),
        ),
        (sign, layer, mag) => {
          const r = decodeNum([sign, layer, mag]);
          if (r !== null) expect(encodeNum(r)).toEqual([sign + 0, layer, mag + 0]);
        },
      ),
      FC_10K,
    );
  });

  it('round-trips the results of arithmetic (every library result is canonical)', PROPERTY, () => {
    const arb = fc.oneof(
      arbNum,
      arbNum.map((x) => x.neg()),
    );
    fc.assert(
      fc.property(arb, arb, (a, b) => {
        for (const r of [a.add(b), a.sub(b), a.mul(b), a.div(b), a.pow(1.15), a.abs().log10()]) {
          if (!isFiniteNum(r)) continue;
          const back = decodeNum(JSON.parse(JSON.stringify(encodeNum(r))));
          expect(back, r.toString()).not.toBeNull();
          expect(back!.eq(r)).toBe(true);
        }
      }),
      { seed: FC_SEED, numRuns: 2_000 },
    );
  });

  it('never throws on arbitrary JSON values', PROPERTY, () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.jsonValue(), fc.tuple(fc.anything(), fc.anything(), fc.anything())),
        (j) => {
          expect(() => decodeNum(j)).not.toThrow();
          const r = decodeNum(j);
          expect(r === null || isFiniteNum(r)).toBe(true);
        },
      ),
      { seed: FC_SEED, numRuns: 2_000 },
    );
  });
});

/** |a − b| ≤ tol · max(1, |a|, |b|), on Nums. */
function close(a: Num, b: Num, tol: number): boolean {
  const scale = Decimal.max(ONE, Decimal.max(a.abs(), b.abs()));
  return a.sub(b).abs().lte(scale.mul(tol));
}

describe('arithmetic identities within tolerance', () => {
  const arb = fc.oneof(arbLayer0, arbOnLayer(1));

  it('(a·b)/b ≈ a and log10(a·b) ≈ log10 a + log10 b (in log space)', PROPERTY, () => {
    fc.assert(
      fc.property(arb, arb, (a, b) => {
        const la = log10(a);
        const lb = log10(b);
        const tol = 1e-12;
        // Values far apart lose the smaller one, so the tolerance scales with both logs.
        const scale = Decimal.max(ONE, la.abs().add(lb.abs()));
        expect(log10(a.mul(b).div(b)).sub(la).abs().lte(scale.mul(tol))).toBe(true);
        expect(log10(a.mul(b)).sub(la.add(lb)).abs().lte(scale.mul(tol))).toBe(true);
      }),
      FC_10K,
    );
  });

  it('pow10(log10 a) ≈ a and log2 a = log10 a · log2 10', PROPERTY, () => {
    fc.assert(
      fc.property(fc.oneof(arb, arbOnLayer(2)), (a) => {
        expect(close(log10(pow10(log10(a))), log10(a), 1e-12)).toBe(true);
        expect(close(log2(a), log10(a).mul(Math.log2(10)), 1e-12)).toBe(true);
      }),
      FC_10K,
    );
  });

  it('pow10 is exact for large exponents and log10 inverts it exactly', () => {
    for (const e of [16, 308.25, 19728.3, 2.586e9, 1e15]) {
      expect(comps(pow10(e))).toEqual([1, 1, e]);
      expect(log10(pow10(e)).toNumber()).toBe(e);
    }
    expect(comps(log10(pow10(pow10(45))))).toEqual(comps(pow10(45)));
    expect(comps(pow10(fromComponents(1, 2, 45)))).toEqual([1, 3, 45]);
  });

  it('slog10 and tetrate10 are inverse at integer heights', () => {
    expect(slog10(tetrate10(5))).toBe(5);
    expect(slog10(tetrate10(6))).toBe(6);
  });
});

describe('op counter', () => {
  it('counts top-level operations, resets, and stops after uninstall', () => {
    const counter = installOpCounter();
    try {
      const a = num(5);
      a.add(3);
      a.mul(2);
      a.gte(ONE);
      expect(counter.count).toBe(3);
      counter.reset();
      expect(counter.count).toBe(0);
      // A helper counts once, whatever library methods it calls internally.
      subClamp(num(7), num(5));
      log10Floor1(num(100));
      expect(counter.count).toBe(2);
      counter.reset();
      // Static functions delegate to one prototype method: Decimal.pow calls absLog10, mul
      // and pow10 internally, but counts once.
      Decimal.pow(2, 10);
      expect(counter.count).toBe(1);
    } finally {
      counter.uninstall();
    }
    const after = counter.count;
    num(5).add(1);
    subClamp(num(7), num(5));
    expect(counter.count).toBe(after);
    // Uninstalling restores the original methods.
    expect(Decimal.prototype.add.toString()).not.toContain('metered');
  });

  it('counts every arithmetic, comparison, tolerance and log method, not conversions', () => {
    const names = countedMethods();
    for (const name of [
      'cmpabs',
      'maxabs',
      'minabs',
      'absLog10',
      'eq_tolerance',
      'gte_tolerance',
    ]) {
      expect(names).toContain(name);
    }
    for (const name of ['toNumber', 'toString', 'fromNumber', 'normalize', 'constructor']) {
      expect(names).not.toContain(name);
    }
    const counter = installOpCounter();
    try {
      const a = num(5);
      a.cmpabs(ONE);
      a.maxabs(ONE);
      a.absLog10();
      a.eq_tolerance(ONE, 1e-9);
      a.toNumber();
      a.toString();
      expect(counter.count).toBe(4);
    } finally {
      counter.uninstall();
    }
  });

  it('refuses a second counter while one is installed', () => {
    const counter = installOpCounter();
    try {
      expect(() => installOpCounter()).toThrow();
    } finally {
      counter.uninstall();
    }
  });
});

describe('break_eternity.js 2.1.3 pitfalls (ADR 001)', () => {
  // These lock the facts ADR 001 records, so a library change shows up as a test failure.
  it('loads through the CJS/ESM default-export interop', () => {
    expect(typeof Decimal).toBe('function');
    expect(num(5)).toBeInstanceOf(Decimal);
  });

  it('log10(0) is NaN', () => {
    expect(Number.isNaN(new Decimal(0).log10().toNumber())).toBe(true);
    expect(Number.isNaN(ZERO.log10().mag)).toBe(true);
  });

  it('log2(2^1280) is 1279.9999999999993 and log2(2^65536) is 65535.999999999985', () => {
    expect(Decimal.pow(2, 1280).log2().toNumber()).toBe(1279.9999999999993);
    expect(Decimal.pow(2, 65536).log2().toNumber()).toBe(65535.999999999985);
    expect(Decimal.pow(2, 131072).log2().toNumber()).toBe(131071.99999999997);
  });

  it('Decimal.pow(2, e) is one ulp low at 2^1280 and 2^65536, and inexact at 2^10', () => {
    expect(Decimal.pow(2, 1280).mag).toBe(385.3183944498958);
    expect(pow2(1280).mag).toBe(385.31839444989595);
    expect(Decimal.pow(2, 1280).lt(Decimal.pow(2, 1024).mul(Decimal.pow(2, 256)))).toBe(true);
    expect(Decimal.pow(2, 65536).mag).toBe(19728.301795834668);
    expect(TOWER1.mag).toBe(19728.30179583467);
    expect(Decimal.pow(2, 10).toNumber()).toBe(1024.0000000000002);
  });

  it('Decimal.pow(10, e) is inexact for large e', () => {
    expect(Decimal.pow(10, 2.586e9).mag).toBe(2586000000.000001);
    expect(Decimal.pow(10, 19728.3).mag).toBe(19728.299999999985);
  });

  it('at height 18 (log10 x = 2.586e9) x is on layer 1 and resolves about 5.5e-7', () => {
    const x = pow10(2.586e9);
    expect(x.layer).toBe(1);
    expect(x.mag).toBe(2.586e9);
    expect(x.add(x.mul(1e-7)).eq(x)).toBe(true);
    expect(x.mul(1 + 5e-7).eq(x)).toBe(true);
    expect(x.mul(1 + 6e-7).eq(x)).toBe(false);
    expect(x.mul(1 + 1e-6).eq(x)).toBe(false);
  });

  it('the smallest relative mul change is about 6.5e-14 at 2^1024 and 4.2e-12 at 2^65536', () => {
    expect(CAP.mul(1 + 5e-14).eq(CAP)).toBe(true);
    expect(CAP.mul(1 + 1e-13).eq(CAP)).toBe(false);
    expect(TOWER1.mul(1 + 1e-12).eq(TOWER1)).toBe(true);
    expect(TOWER1.mul(1 + 1e-11).eq(TOWER1)).toBe(false);
  });

  it('instances are mutable (so constants are frozen) and toJSON is lossy', () => {
    const d = new Decimal(5);
    d.fromNumber(7);
    expect(d.toNumber()).toBe(7);
    expect(JSON.stringify(num(1.5e-300))).toBe('"1.5000000000000004e-300"');
  });

  it('tetrate(10, slog x) can come out below x', () => {
    const x = fromComponents(1, 3, 1e6);
    expect(slog10(x)).toBe(4.8504757875762765);
    expect(tetrate10(slog10(x)).lt(x)).toBe(true);
  });

  it('NaN and ±Infinity components', () => {
    expect(comps(num(Number.NaN)).every(Number.isNaN)).toBe(true);
    expect(comps(num(Number.POSITIVE_INFINITY))).toEqual([1, Infinity, Infinity]);
    expect(comps(num(Number.NEGATIVE_INFINITY))).toEqual([-1, Infinity, Infinity]);
    expect(comps(num(-0))).toEqual([0, 0, 0]);
  });
});
