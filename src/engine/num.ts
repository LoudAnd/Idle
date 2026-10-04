/**
 * The number core (GDD §4.1). This is the only module that imports `break_eternity.js`
 * (enforced by `tests/arch/num.test.ts`); everything else uses the `Num` type and the helpers
 * below. Decisions and measured pitfalls are recorded in `docs/adr/001-big-numbers.md`.
 *
 * Rules for callers:
 * - Never call a log method on a `Num` directly (`.log10()`, `.log2()`, `.ln()`, `.log(b)`,
 *   `.absLog10()`, …; a lint test bans them outside this file). Use the safe logs (`log10Pos`,
 *   `log2Pos`, `log10Floor1`) for any value that can be 0, and the raw `log10` / `log2` only
 *   where the value is known to be > 0. `Math.log2` on doubles is fine.
 * - Use `subClamp` instead of `x.sub(cost)` for purchases.
 * - Use `floorGain` for every floor-at-threshold gain, with thresholds built in log2 space and
 *   the candidate passed as a `Num` when it can leave the double range.
 * - Save `Num` values with `encodeNum` / `decodeNum`, never with `JSON.stringify(num)`
 *   (`Decimal.toJSON` is lossy).
 */
import Decimal from 'break_eternity.js';

/** An arbitrary-precision non-negative game quantity (negative only in deltas). */
export type Num = Decimal;

/** Anything `num()` accepts. Strings hold values a JS literal cannot (`'1e-400'`, `'1e1e20'`). */
export type NumSource = Num | number | string;

/** The save form of a `Num`: its normalized components, exact through JSON. */
export type NumCode = readonly [sign: -1 | 0 | 1, layer: number, mag: number];

/** break_eternity keeps |mag| below this on every layer (a larger mag moves up a layer). */
const EXP_LIMIT = 9e15;
/** log10(9e15): break_eternity keeps |mag| at or above this on layers ≥ 1. */
const LAYER_DOWN = Math.log10(EXP_LIMIT);
/** 1/9e15: the smallest non-zero mag on layer 0 (smaller values move to layer 1). */
const FIRST_NEG_LAYER = 1 / EXP_LIMIT;
const LOG10_2 = Math.log10(2);
/** log10 2 − LOG10_2 (the rounding error of Math.log10(2)), so LOG10_2 + LOG10_2_LO ≈ 107 bits. */
const LOG10_2_LO = -2.8037281277851704e-18;

// ---------------------------------------------------------------------------------------------
// Operation counter (bench only). The counter state lives here so that the helpers below count
// as one operation each, with the library calls they make internally not counted.
// ---------------------------------------------------------------------------------------------

let metering = false;
let opDepth = 0;
let opCount = 0;

function metered<R>(f: () => R): R {
  if (opDepth === 0) opCount++;
  opDepth++;
  try {
    return f();
  } finally {
    opDepth--;
  }
}

// ---------------------------------------------------------------------------------------------
// Constructors and constants
// ---------------------------------------------------------------------------------------------

/** Returns `v` itself if it is already a `Num`, otherwise a new `Num`. */
export function num(v: NumSource): Num {
  return v instanceof Decimal ? v : new Decimal(v);
}

/** Builds a `Num` from components and normalizes it. */
export function fromComponents(sign: number, layer: number, mag: number): Num {
  return Decimal.fromComponents(sign, layer, mag);
}

function frozen(v: Num): Num {
  return Object.freeze(v);
}

export const ZERO: Num = frozen(new Decimal(0));
export const ONE: Num = frozen(new Decimal(1));

// ---------------------------------------------------------------------------------------------
// Raw logs and powers. Inputs to the logs must be > 0; otherwise the result is a NaN `Num`.
// ---------------------------------------------------------------------------------------------

function nan(): Num {
  return new Decimal(Number.NaN);
}

function log10Raw(x: Num): Num {
  if (!(x.sign > 0)) return nan();
  if (!Number.isFinite(x.layer) || !Number.isFinite(x.mag)) return x.log10();
  // Layer ≥ 1 is an exact layer-down: 10^(±m on layer L−1) has log10 ±m on layer L−1.
  if (x.layer > 0) return fromComponents(Math.sign(x.mag), x.layer - 1, Math.abs(x.mag));
  return x.log10();
}

function log2Raw(x: Num): Num {
  if (!(x.sign > 0)) return nan();
  return x.log2();
}

/**
 * 10^e. Exponents that leave layer 0 are built from components, so the result is exact
 * (`Decimal.pow(10, e)` is not: `Decimal.pow(10, 2.586e9).mag` is 2586000000.000001).
 */
function pow10Raw(e: number | Num): Num {
  if (typeof e !== 'number') {
    if (e.layer === 0) return pow10Raw(e.sign * e.mag);
    if (e.layer > 0 && e.mag > 0 && Number.isFinite(e.layer) && Number.isFinite(e.mag)) {
      // |e| ≥ 9e15: 10^(+[L, m]) = [L+1, m] and 10^(−[L, m]) = [L+1, −m] (a reciprocal).
      return fromComponents(1, e.layer + 1, e.sign * e.mag);
    }
    return Decimal.pow(10, e);
  }
  if (!Number.isFinite(e)) return Decimal.pow(10, e);
  if (Math.abs(e) >= LAYER_DOWN) return fromComponents(1, 1, e);
  // Integer exponents parse exactly ('1e-5' is the double nearest 10^-5; Math.pow is not).
  if (Number.isInteger(e)) return new Decimal(Number('1e' + e));
  return new Decimal(Math.pow(10, e));
}

/** Dekker's splitter, 2^27 + 1. */
const SPLIT = 134217729;
const L_T = SPLIT * LOG10_2;
const L_HI = L_T - (L_T - LOG10_2);
const L_LO = LOG10_2 - L_HI;

/**
 * e·log10 2 rounded once: a double-double product (Dekker's exact two-product of e and LOG10_2,
 * plus e·LOG10_2_LO), so the result is the double nearest the exact product. A plain
 * `e * Math.log10(2)` rounds twice and is one ulp off for about 6% of integer e (1023, 65535).
 */
function mulLog10Of2(e: number): number {
  const p = e * LOG10_2;
  if (!(Math.abs(e) < 2 ** 900)) return p; // the split would overflow; never a layer-1 mag
  const t = SPLIT * e;
  const eHi = t - (t - e);
  const eLo = e - eHi;
  const err = eHi * L_HI - p + eHi * L_LO + eLo * L_HI + eLo * L_LO;
  return p + (err + e * LOG10_2_LO);
}

/**
 * 2^e, computed in log space: mag = e·log10 2, correctly rounded (`mulLog10Of2`). The library's
 * `Decimal.pow(2, e)` is one ulp low at 2^1280 and 2^65536, and `Decimal.pow(2, 10)` is
 * 1024.0000000000002. Small results are `Math.pow(2, e)`, exact for integer e.
 */
function pow2Raw(e: number | Num): Num {
  if (typeof e !== 'number') {
    if (e.layer === 0) return pow2Raw(e.sign * e.mag);
    return pow10Raw(e.mul(LOG10_2));
  }
  if (!Number.isFinite(e)) return Decimal.pow(2, e);
  const m = mulLog10Of2(e);
  if (Math.abs(m) >= LAYER_DOWN) return fromComponents(1, 1, m);
  return new Decimal(Math.pow(2, e));
}

/** log10 x for x > 0 (NaN `Num` otherwise). */
export function log10(x: Num): Num {
  return metering ? metered(() => log10Raw(x)) : log10Raw(x);
}

/** log2 x for x > 0 (NaN `Num` otherwise). */
export function log2(x: Num): Num {
  return metering ? metered(() => log2Raw(x)) : log2Raw(x);
}

/** 10^e, exact for exponents of any size. */
export function pow10(e: number | Num): Num {
  return metering ? metered(() => pow10Raw(e)) : pow10Raw(e);
}

/** 2^e. Beyond layer 0 the mag is e·log10 2, correctly rounded (see `pow2Raw`). */
export function pow2(e: number | Num): Num {
  return metering ? metered(() => pow2Raw(e)) : pow2Raw(e);
}

/** The super-logarithm base 10 (the h in 10↑↑h). Used by the `10↑↑h` notation. */
export function slog10(x: Num): number {
  return metering ? metered(() => x.slog(10).toNumber()) : x.slog(10).toNumber();
}

/** 10↑↑h. Used by the notation tests to parse `10↑↑h` back. */
export function tetrate10(h: number): Num {
  return metering ? metered(() => Decimal.tetrate(10, h)) : Decimal.tetrate(10, h);
}

/** 2^1024, the Power threshold and the pre-lift cap (GDD §8.1). */
export const CAP: Num = frozen(pow2Raw(1024));
/** 2^65536 = 2↑↑5, the Tower threshold (GDD §10.1). */
export const TOWER1: Num = frozen(pow2Raw(65536));

// ---------------------------------------------------------------------------------------------
// Safe logs. Results are doubles; a result beyond the double range (an input on layer ≥ 2 with
// mag ≥ 308.25, or its reciprocal) saturates to ±Number.MAX_VALUE.
// ---------------------------------------------------------------------------------------------

function saturate(r: number): number | null {
  if (Number.isNaN(r)) return null;
  if (r === Number.POSITIVE_INFINITY) return Number.MAX_VALUE;
  if (r === Number.NEGATIVE_INFINITY) return -Number.MAX_VALUE;
  return r;
}

function log10PosRaw(x: Num): number | null {
  if (!isFiniteNum(x) || x.sign <= 0) return null;
  return saturate(log10Raw(x).toNumber());
}

function log2PosRaw(x: Num): number | null {
  if (!isFiniteNum(x) || x.sign <= 0) return null;
  return saturate(log2Raw(x).toNumber());
}

/** log10 x, or `null` if x is not a finite positive `Num`. Callers must handle `null`. */
export function log10Pos(x: Num): number | null {
  return metering ? metered(() => log10PosRaw(x)) : log10PosRaw(x);
}

/** log2 x, or `null` if x is not a finite positive `Num`. Callers must handle `null`. */
export function log2Pos(x: Num): number | null {
  return metering ? metered(() => log2PosRaw(x)) : log2PosRaw(x);
}

function log10Floor1Raw(x: Num): number {
  if (!isFiniteNum(x) || !x.gt(ONE)) return 0;
  return log10PosRaw(x) ?? 0;
}

/** log10 max(x, 1): always finite and ≥ 0 (0 for 0, values in (0, 1] and invalid input). */
export function log10Floor1(x: Num): number {
  return metering ? metered(() => log10Floor1Raw(x)) : log10Floor1Raw(x);
}

// ---------------------------------------------------------------------------------------------
// Gains and purchases
// ---------------------------------------------------------------------------------------------

/**
 * Gains below this are corrected exactly; from here on ⌊v⌋ and threshold(n) can no longer tell
 * n from n + 1 (consecutive thresholds round to the same `Num`), so the candidate is the gain.
 */
export const EXACT_GAIN_LIMIT = 2 ** 52;

function floorGainRaw(v: number | Num, x: Num, threshold: (n: number) => Num): Num {
  let c: number;
  if (typeof v === 'number') c = v;
  else if (!isFiniteNum(v)) c = v.sign > 0 && !Number.isNaN(v.mag) ? Infinity : 0;
  else if (v.sign <= 0) c = 0;
  else if (v.gte(EXACT_GAIN_LIMIT)) return v.floor();
  else c = v.toNumber();
  // NaN and non-positive candidates count as 0, and the correction below still pays 1 at
  // threshold(1). An overflowed candidate (+Infinity) saturates instead of falling to 0.
  if (!(c > 0)) c = 0;
  if (c >= EXACT_GAIN_LIMIT) return num(c === Infinity ? Number.MAX_VALUE : Math.floor(c));
  const n0 = Math.floor(c);
  let n = n0;
  if (x.gte(threshold(n0 + 1))) n = n0 + 1;
  else if (n0 >= 1 && x.lt(threshold(n0))) n = n0 - 1;
  return n === 0 ? ZERO : num(n);
}

/**
 * The one helper for every floor-at-threshold gain (GDD §4.1, §7, §8.2, §10.1). `v` is the gain
 * from the log formula. Below `EXACT_GAIN_LIMIT` (2^52) the result is ⌊v⌋ corrected by at most 1
 * with exact `Num` comparisons: n+1 if x ≥ threshold(n+1), n−1 if x < threshold(n). From 2^52 on
 * it is ⌊v⌋ itself. Always an integer-valued `Num` ≥ 0, never NaN, and non-decreasing in v and
 * in x (for a v that is non-decreasing in x and thresholds non-decreasing in n).
 *
 * Pass `v` as a `Num` whenever it can leave the double range: build it in log space, for
 * example `pow2((log2Pos(x) - base) / d)`, since `2 ** ((log2 x − base)/d)` overflows to
 * +Infinity (P_gain from x = 2^41088, E_gain from 2^263168). A number +Infinity saturates to
 * `Number.MAX_VALUE`.
 *
 * Build thresholds in log2 space, `pow2(base + d·log2(n/μ))`, not as products such as
 * `pow2(1024).mul(...)`: products round differently, so the threshold would not be the value the
 * log formula inverts (ADR 001).
 */
export function floorGain(v: number | Num, x: Num, threshold: (n: number) => Num): Num {
  return metering ? metered(() => floorGainRaw(v, x, threshold)) : floorGainRaw(v, x, threshold);
}

function subClampRaw(x: Num, cost: Num): Num {
  if (!isValidNum(x) || !isFiniteNum(cost)) return nan();
  if (cost.gte(x)) return ZERO;
  const d = x.sub(cost);
  return d.sign < 0 ? ZERO : d;
}

/**
 * max(0, x − cost): a purchase never leaves a negative x. Invalid input (x NaN, infinite or
 * negative, or cost NaN or infinite) gives a NaN `Num`, so the engine invariant (`isValidNum`,
 * GDD §20.1) reports the corruption instead of a purchase hiding it as 0.
 */
export function subClamp(x: Num, cost: Num): Num {
  return metering ? metered(() => subClampRaw(x, cost)) : subClampRaw(x, cost);
}

// ---------------------------------------------------------------------------------------------
// Validity and the save codec
// ---------------------------------------------------------------------------------------------

/**
 * A `Num` whose sign, layer and mag are all finite (it may be negative). Called with a `Num` it is
 * a plain check (the argument keeps its type in both branches); called with `unknown` it is also
 * a type guard.
 */
export function isFiniteNum(x: Num): boolean;
export function isFiniteNum(x: unknown): x is Num;
export function isFiniteNum(x: unknown): boolean {
  return (
    x instanceof Decimal &&
    Number.isFinite(x.sign) &&
    Number.isFinite(x.layer) &&
    Number.isFinite(x.mag)
  );
}

/**
 * The engine invariant for stored quantities (GDD §20.1): finite and ≥ 0. Like `isFiniteNum`, a
 * plain check for a `Num` argument and a type guard for `unknown`.
 */
export function isValidNum(x: Num): boolean;
export function isValidNum(x: unknown): x is Num;
export function isValidNum(x: unknown): boolean {
  return isFiniteNum(x) && (x.sign === 0 || x.sign === 1);
}

/** `[sign, layer, mag]`, exact through JSON. A negative zero is written as 0. */
export function encodeNum(x: Num): NumCode {
  const sign = x.sign === 0 ? 0 : x.sign < 0 ? -1 : 1;
  return [sign, x.layer + 0, x.mag + 0];
}

/**
 * True when [sign, layer, mag] is a normalized break_eternity form, the only form `encodeNum`
 * writes: zero is [0, 0, 0]; layer 0 has 1/9e15 ≤ mag < 9e15; layers ≥ 1 have
 * log10(9e15) ≤ |mag| < 9e15. Normalizing anything else can be slow: in 2.1.3, [1, L, 0] steps
 * down one layer per loop iteration, so [1, 2^53 − 1, 0] would take years.
 */
function isCanonicalCode(sign: number, layer: number, mag: number): boolean {
  if (sign === 0) return layer === 0 && mag === 0;
  if (layer === 0) return mag >= FIRST_NEG_LAYER && mag < EXP_LIMIT;
  const a = Math.abs(mag);
  return a >= LAYER_DOWN && a < EXP_LIMIT;
}

/**
 * The inverse of `encodeNum`. Accepts only the canonical codes `encodeNum` writes (with a safe
 * integer layer) and builds them without normalizing, so it runs in constant time. Returns `null`
 * for anything else; never throws.
 */
export function decodeNum(code: unknown): Num | null {
  if (!Array.isArray(code) || code.length !== 3) return null;
  const [sign, layer, mag] = code as unknown[];
  if (sign !== -1 && sign !== 0 && sign !== 1) return null;
  if (typeof layer !== 'number' || !Number.isSafeInteger(layer) || layer < 0) return null;
  if (typeof mag !== 'number' || !Number.isFinite(mag)) return null;
  if (!isCanonicalCode(sign, layer, mag)) return null;
  try {
    // `+ 0` turns a JSON −0 into 0.
    const v = Decimal.fromComponents_noNormalize(sign + 0, layer, mag + 0);
    return isFiniteNum(v) ? v : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Bench-only operation counter (GDD §22.12). Nothing in src/ calls it (tests/arch/num.test.ts),
// so the app bundle tree-shakes it.
// ---------------------------------------------------------------------------------------------

export interface OpCounter {
  /** Top-level `Num` operations since install or the last reset. */
  readonly count: number;
  reset(): void;
  /** Restores the original methods. */
  uninstall(): void;
}

/**
 * `Decimal.prototype` members that are not counted: accessors, constructors and mutators, string
 * and number conversions, and the internal helper behind `slog`. Every other method is counted.
 */
const NOT_COUNTED: ReadonlySet<string> = new Set([
  'constructor',
  'normalize',
  'fromComponents',
  'fromComponents_noNormalize',
  'fromMantissaExponent',
  'fromMantissaExponent_noNormalize',
  'fromDecimal',
  'fromNumber',
  'fromString',
  'fromValue',
  'toNumber',
  'mantissaWithDecimalPlaces',
  'magnitudeWithDecimalPlaces',
  'toString',
  'toExponential',
  'toFixed',
  'toPrecision',
  'valueOf',
  'toJSON',
  'toStringWithDecimalPlaces',
  'isNan',
  'isFinite',
  'slog_internal',
]);

/** The `Decimal.prototype` methods the counter wraps: every method not in `NOT_COUNTED`. */
export function countedMethods(): string[] {
  const proto = Decimal.prototype as unknown as Record<string, unknown>;
  return Object.getOwnPropertyNames(proto).filter((name) => {
    if (NOT_COUNTED.has(name)) return false;
    const d = Object.getOwnPropertyDescriptor(proto, name);
    return d !== undefined && typeof d.value === 'function';
  });
}

/**
 * Counts top-level `Num` operations: each call of a `Decimal` method (`countedMethods()`: every
 * arithmetic, comparison, log, tolerance and transcendental method), and each call of a helper
 * in this module, counts once; calls they make internally do not. Static `Decimal` functions
 * delegate to these methods, so they count once too.
 */
export function installOpCounter(): OpCounter {
  if (metering) throw new Error('installOpCounter: a counter is already installed');
  const proto = Decimal.prototype as unknown as Record<string, unknown>;
  const originals = new Map<string, unknown>();
  for (const name of countedMethods()) {
    const original = proto[name];
    if (typeof original !== 'function') continue;
    originals.set(name, original);
    proto[name] = function (this: unknown, ...args: unknown[]): unknown {
      return metered(() => (original as (...a: unknown[]) => unknown).apply(this, args));
    };
  }
  metering = true;
  opCount = 0;
  opDepth = 0;
  let installed = true;
  return {
    get count() {
      return opCount;
    },
    reset() {
      opCount = 0;
    },
    uninstall() {
      if (!installed) return;
      installed = false;
      for (const [name, original] of originals) proto[name] = original;
      metering = false;
    },
  };
}
