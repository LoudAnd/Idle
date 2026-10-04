// fast-check arbitraries for `Num` values, shared by the num and format property tests.
import fc from 'fast-check';
import { fromComponents, num } from '../../../src/engine/num.ts';
import type { Num } from '../../../src/engine/num.ts';

/** The property-test seed: fixed, overridable with FC_SEED=<n> to explore other values. */
export const FC_SEED = Number(process.env.FC_SEED ?? 20261004);

/** Settings for a 10,000-run property. */
export const FC_10K = { seed: FC_SEED, numRuns: 10_000 } as const;

/** A double uniformly spread over [min, max] (fc.double favours tiny magnitudes). */
export function uniform(min: number, max: number): fc.Arbitrary<number> {
  const steps = 2 ** 40;
  return fc
    .tuple(fc.integer({ min: 0, max: 2 ** 20 - 1 }), fc.integer({ min: 0, max: 2 ** 20 - 1 }))
    .map(([hi, lo]) => min + ((max - min) * (hi * 2 ** 20 + lo)) / (steps - 1));
}

/** log10(9e15) and its log10: the normalized |mag| range on layers ≥ 1. */
const LAYER_DOWN = Math.log10(9e15);
const MAG_LOG_MIN = Math.log10(LAYER_DOWN);
const MAG_LOG_MAX = Math.log10(9e15);

/** Layer 0, log-uniform from about 1.3e-16 to 9e15 (the tiny regime below 1e-3 included). */
export const arbLayer0: fc.Arbitrary<Num> = uniform(-15.85, 15.95).map((u) => num(10 ** u));

/** A normalized value on `layer`; a negative mag is the reciprocal (the second tiny regime). */
export function arbOnLayer(layer: number): fc.Arbitrary<Num> {
  return fc
    .tuple(fc.boolean(), uniform(MAG_LOG_MIN, MAG_LOG_MAX))
    .map(([recip, u]) => fromComponents(1, layer, (recip ? -1 : 1) * 10 ** u));
}

/** Values near the notation boundaries (integers, the small region, mags just above 1e6). */
export const arbBoundary: fc.Arbitrary<Num> = fc.oneof(
  fc.integer({ min: 0, max: 2_000_000_000 }).map((i) => num(i)),
  uniform(-4, 10).map((u) => num(10 ** u)),
  uniform(5.9, 6.1).map((u) => fromComponents(1, 1, 10 ** u)),
  uniform(5.9, 6.1).map((u) => fromComponents(1, 2, 10 ** u)),
  uniform(5.9, 6.1).map((u) => fromComponents(1, 3, 10 ** u)),
  uniform(-6.1, -5.9).map((u) => fromComponents(1, 1, -(10 ** u))),
);

/** Positive values on layers 0–3, both tiny regimes included. */
export const arbNum: fc.Arbitrary<Num> = fc.oneof(
  arbLayer0,
  arbOnLayer(1),
  arbOnLayer(2),
  arbOnLayer(3),
  arbBoundary,
);

/** Doubles strictly inside (0, 1). */
export const arbUnit: fc.Arbitrary<number> = fc.double({
  min: 0,
  max: 1,
  minExcluded: true,
  maxExcluded: true,
  noNaN: true,
});

/** The fixed inputs every log and format property includes. */
export const FIXED_INPUTS: readonly Num[] = [num(0), num('1e-400'), num(0.5), num(1e-300)];

/** arbNum plus 0, 1e-400 and doubles in (0, 1). */
export const arbFormatInput: fc.Arbitrary<Num> = fc.oneof(
  { weight: 8, arbitrary: arbNum },
  { weight: 1, arbitrary: fc.constantFrom(...FIXED_INPUTS) },
  { weight: 1, arbitrary: arbUnit.map((x) => num(x)) },
);

/** Anything a log might be handed: both signs, 0, tiny values, NaN and ±Infinity. */
export const arbAnyNum: fc.Arbitrary<Num> = fc.oneof(
  arbFormatInput,
  arbNum.map((x) => x.neg()),
  fc.constantFrom(num(Number.NaN), num(Number.POSITIVE_INFINITY), num(Number.NEGATIVE_INFINITY)),
);

/** 10,000 sampled inputs (deterministic for a seed), plus the fixed inputs. */
export function sampleFormatInputs(n = 10_000): Num[] {
  return [...FIXED_INPUTS, ...fc.sample(arbFormatInput, { seed: FC_SEED, numRuns: n })];
}
