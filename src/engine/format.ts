/**
 * Number notation (GDD §4.2): Scientific, Engineering, Logarithm and Standard, the stacked `e`
 * forms, `10↑↑h`, the spoken (screen-reader) form and fixed en-style digit grouping.
 *
 * This module holds no player-visible words: the suffix and spoken-word tables come in as a
 * parameter (from `src/ui/strings.ts`). It never calls `Intl` or `toLocale*String`, so the
 * output does not depend on the machine's locale. Its only string literals are digits, single
 * letters and punctuation, which keeps the M3 string lint green.
 *
 * Regions, for a finite v > 0 at precision p and integer threshold T:
 * - A: v < 1e-3: a mantissa form with a negative exponent, or `e-…` once the exponent reaches
 *   −1e6.
 * - B: 1e-3 ≤ v < 1000: integers as they are; other values with p + 1 significant digits (never
 *   fewer than the integer digits), trailing zeros kept.
 * - C: 1000 ≤ v < T: ⌊v⌋ with comma grouping.
 * - D: v ≥ T: the notation's mantissa form while the true exponent ⌊log10 v⌋ is below 1e6,
 *   then `e` + the exponent formatted recursively (at most 3 `e`s in all), then `10↑↑h` with h
 *   rounded up to p decimals.
 */
import { fromComponents, isFiniteNum, log10, num, slog10 } from './num.ts';
import type { Num } from './num.ts';

export const NOTATION = { SCIENTIFIC: 0, ENGINEERING: 1, LOGARITHM: 2, STANDARD: 3 } as const;
export type Notation = (typeof NOTATION)[keyof typeof NOTATION];

/** Standard suffixes: S(0) = first[0], S(1…9) = first[n], S(10…99) = units + tens, S(100). */
export interface StandardSuffixTable {
  /** S(0)…S(9): K, M, B, T, Qa, Qi, Sx, Sp, Oc, No. */
  readonly first: readonly string[];
  /** U[n mod 10] for 10 ≤ n ≤ 99 (U[0] is empty). */
  readonly units: readonly string[];
  /** T[⌊n/10⌋] for 10 ≤ n ≤ 99 (T[0] is empty). */
  readonly tens: readonly string[];
  /** S(100) (1e303). */
  readonly hundred: string;
}

export interface SpokenWords {
  /** Between mantissa and exponent: "1.23 times ten to the 45". */
  readonly timesTenToThe: string;
  /** Before a stacked exponent: "ten to the 1.23 times ten to the 45". */
  readonly tenToThe: string;
}

export interface NotationTables {
  readonly standard: StandardSuffixTable;
  readonly spoken: SpokenWords;
}

export interface FormatOptions {
  notation: Notation;
  /** Decimal places of mantissas, 0–4 (GDD §19). */
  precision: number;
  /** Values below this are shown as grouped integers: 1e3, 1e6 or 1e9. */
  intThreshold: number;
  /**
   * Called with a non-finite input before it renders as `—`. This is the GDD §4.2 dev assertion:
   * the engine cannot know whether it runs in a dev build, so the UI binds it once with
   * `createFormatter(tables, { onInvalid })` (M2) to an assertion that throws in dev builds.
   */
  onInvalid?: (v: Num) => void;
}

export const DEFAULT_FORMAT_OPTIONS: Readonly<FormatOptions> = Object.freeze({
  notation: NOTATION.SCIENTIFIC,
  precision: 2,
  intThreshold: 1e6,
});

const MINUS = '−'; // U+2212, for negative values
const INVALID = '—';
const TETRATION = '10↑↑';
/** Exponents (and Logarithm integer parts, and ↑↑ heights) are grouped from this value on. */
const GROUP_FROM = 10_000;
/** The true exponent at which a mantissa form becomes a stacked `e` form. */
const STACK_FROM = 1e6;
/** Standard suffixes are used below 1e306 (3n + 3 < 306). */
const STANDARD_LIMIT = 306;
/** At most this many `e` characters in one output; deeper values use `10↑↑h`. */
const E_BUDGET = 3;
/** Tolerance when rounding a ↑↑ height up, so 10↑↑5 shows 5.00, not 5.01. */
const HEIGHT_TOLERANCE = 1e-9;

const SMALL = num(1e-3);
const THOUSAND = num(1000);

// A formatted value is built as a small tree, rendered either for display or for speech.
const K_PLAIN = 0; // text shown as is (regions B and C, zero)
const K_MANT = 1; // m·10^e
const K_SUFFIX = 2; // m + Standard suffix
const K_LOG = 3; // Logarithm: `e` + log10 v
const K_STACK = 4; // `e` (or `e-`) + inner
const K_TET = 5; // `10↑↑` + height text
const K_TET_BIG = 6; // `10↑↑` + inner

type Piece =
  | { readonly k: typeof K_PLAIN; readonly text: string }
  | { readonly k: typeof K_MANT; readonly m: string; readonly e: number }
  | { readonly k: typeof K_SUFFIX; readonly m: string; readonly suffix: string }
  | { readonly k: typeof K_LOG; readonly text: string }
  | { readonly k: typeof K_STACK; readonly neg: boolean; readonly inner: Piece }
  | { readonly k: typeof K_TET; readonly text: string }
  | { readonly k: typeof K_TET_BIG; readonly inner: Piece };

interface Ctx {
  readonly notation: Notation;
  readonly p: number;
  readonly t: number;
  readonly tables: NotationTables;
}

// ---------------------------------------------------------------------------------------------
// Grouping and suffixes
// ---------------------------------------------------------------------------------------------

/** Fixed en-style grouping of a string of digits: '1234567' → '1,234,567'. */
export function groupDigits(digits: string): string {
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ',';
    out += digits.charAt(i);
  }
  return out;
}

/** An integer exponent: plain below 10,000, grouped from 10,000 on; ASCII '-' when negative. */
function exponentText(e: number, minus: string): string {
  const a = Math.abs(e);
  const digits = String(a);
  return (e < 0 ? minus : '') + (a >= GROUP_FROM ? groupDigits(digits) : digits);
}

/** A fixed-point string such as '-12345.67': its integer part grouped from 10,000 on. */
function groupFixed(s: string): string {
  const neg = s.charAt(0) === '-';
  const body = neg ? s.slice(1) : s;
  const dot = body.indexOf('.');
  const int = dot < 0 ? body : body.slice(0, dot);
  const frac = dot < 0 ? '' : body.slice(dot);
  const grouped = Number(int) >= GROUP_FROM ? groupDigits(int) : int;
  return (neg ? '-' : '') + grouped + frac;
}

/** The Standard suffix S(n) for 0 ≤ n ≤ 100, or `null` (out of range or a missing entry). */
export function standardSuffix(n: number, t: StandardSuffixTable): string | null {
  if (!Number.isInteger(n) || n < 0 || n > 100) return null;
  if (n === 100) return t.hundred.length > 0 ? t.hundred : null;
  if (n < 10) {
    const s = t.first[n];
    return s !== undefined && s.length > 0 ? s : null;
  }
  const u = t.units[n % 10];
  const d = t.tens[Math.floor(n / 10)];
  if (u === undefined || d === undefined || d.length === 0) return null;
  return u + d;
}

// ---------------------------------------------------------------------------------------------
// Mantissas
// ---------------------------------------------------------------------------------------------

function mod(a: number, b: number): number {
  return ((a % b) + b) % b;
}

interface Mant {
  /** The mantissa with exactly p decimals: [1, 10) for g = 1, [1, 1000) for g = 3. */
  readonly m: string;
  /** The displayed exponent (a multiple of g). */
  readonly e: number;
  /** The true (Scientific) exponent of the rounded value. */
  readonly sci: number;
}

function splitExponential(s: string): { digits: string; e: number } {
  const i = s.indexOf('e');
  return { digits: s.slice(0, i).replace('.', ''), e: Number(s.slice(i + 1)) };
}

function withPoint(digits: string, intDigits: number): string {
  const frac = digits.slice(intDigits);
  return frac.length > 0 ? digits.slice(0, intDigits) + '.' + frac : digits.slice(0, intDigits);
}

/**
 * m·10^e for v > 0 on layer 0 or 1, rounded to p decimals, exponent a multiple of g (1 for
 * Scientific, 3 for Engineering and Standard). A rounding carry moves to the next exponent, so
 * Scientific never shows a mantissa of 10 and Engineering never shows 1000.
 */
function mantissa(v: Num, p: number, g: 1 | 3): Mant {
  if (v.layer === 0) {
    // Layer 0: toExponential rounds the exact binary value correctly.
    const x = v.mag;
    const e0 = splitExponential(x.toExponential()).e;
    const k = g === 3 ? mod(e0, 3) : 0;
    const r = splitExponential(x.toExponential(p + k));
    if (r.e === e0) return { m: withPoint(r.digits, k + 1), e: e0 - k, sci: e0 };
    // Carried to 10^(e0+1): the mantissa is exactly 10^k'.
    const k1 = g === 3 ? mod(r.e, 3) : 0;
    return { m: Math.pow(10, k1).toFixed(p), e: r.e - k1, sci: r.e };
  }
  // Layer 1: v = 10^lg with |lg| ≥ 15.95; lg − e is exact.
  const lg = v.mag;
  const sci0 = Math.floor(lg);
  let e = g === 3 ? 3 * Math.floor(sci0 / 3) : sci0;
  let m = Math.pow(10, lg - e).toFixed(p);
  if (Number(m) >= (g === 3 ? 1000 : 10)) {
    e += g;
    m = (1).toFixed(p);
  }
  const dot = m.indexOf('.');
  const intDigits = dot < 0 ? m.length : dot;
  return { m, e, sci: e + intDigits - 1 };
}

// ---------------------------------------------------------------------------------------------
// Regions
// ---------------------------------------------------------------------------------------------

/** Region D and every inner exponent: v ≥ 1000. `null` once the `e` budget is spent. */
function big(v: Num, notation: Notation, c: Ctx, budget: number): Piece | null {
  if (notation === NOTATION.LOGARITHM) {
    const lg = log10(v);
    if (lg.layer === 0) {
      const s = lg.mag.toFixed(c.p);
      if (Number(s) < STACK_FROM) return { k: K_LOG, text: groupFixed(s) };
    }
    return stack(lg, NOTATION.SCIENTIFIC, c, budget);
  }
  if (v.layer < 2) {
    const me = mantissa(v, c.p, notation === NOTATION.SCIENTIFIC ? 1 : 3);
    if (me.sci < STACK_FROM) {
      if (notation !== NOTATION.STANDARD) return { k: K_MANT, m: me.m, e: me.e };
      const suffix = me.e < STANDARD_LIMIT ? standardSuffix(me.e / 3 - 1, c.tables.standard) : null;
      if (suffix !== null) return { k: K_SUFFIX, m: me.m, suffix };
      return big(v, NOTATION.SCIENTIFIC, c, budget);
    }
  }
  const inner = notation === NOTATION.ENGINEERING ? NOTATION.ENGINEERING : NOTATION.SCIENTIFIC;
  return stack(log10(v), inner, c, budget);
}

/** `e` + lg formatted with one less `e` to spend. */
function stack(lg: Num, inner: Notation, c: Ctx, budget: number): Piece | null {
  if (budget < 2) return null;
  const p = big(lg, inner, c, budget - 1);
  return p === null ? null : { k: K_STACK, neg: false, inner: p };
}

// slog10 is slow (about 0.4 ms: the library refines it with 100 tetrations), and a value is
// usually formatted twice in a row (display and spoken form, or several notations), so the
// last height is memoized. This is a pure cache: the result depends only on v.
let memoLayer = Number.NaN;
let memoMag = Number.NaN;
let memoHeight = 0;

function height(v: Num): number {
  if (v.layer !== memoLayer || v.mag !== memoMag) {
    memoHeight = slog10(v);
    memoLayer = v.layer;
    memoMag = v.mag;
  }
  return memoHeight;
}

/** 10↑↑h with h = slog10 v rounded up to p decimals (so it never shows less than the value). */
function tetration(v: Num, c: Ctx): Piece {
  const h = height(v);
  const scale = Math.pow(10, c.p);
  const up = Math.ceil((h - HEIGHT_TOLERANCE) * scale) / scale;
  if (up < STACK_FROM) return { k: K_TET, text: groupFixed(up.toFixed(c.p)) };
  return { k: K_TET_BIG, inner: { k: K_MANT, ...mantissaOf(num(h), c.p) } };
}

function mantissaOf(v: Num, p: number): { m: string; e: number } {
  const me = mantissa(v, p, 1);
  return { m: me.m, e: me.e };
}

/** Region A: 0 < v < 1e-3. */
function tiny(v: Num, c: Ctx): Piece {
  if (c.notation === NOTATION.LOGARITHM) {
    const lg = log10(v);
    if (lg.layer === 0) {
      const s = (lg.sign * lg.mag).toFixed(c.p);
      if (Number(s) > -STACK_FROM) return { k: K_LOG, text: groupFixed(s) };
    }
  } else if (v.layer < 2) {
    const me = mantissa(v, c.p, c.notation === NOTATION.ENGINEERING ? 3 : 1);
    if (me.sci > -STACK_FROM) return { k: K_MANT, m: me.m, e: me.e };
  }
  // v ≤ 10^-1e6: `e-` + |log10 v|, with the leading `e` counted against the budget.
  const a = log10(v).abs();
  const inner = c.notation === NOTATION.ENGINEERING ? NOTATION.ENGINEERING : NOTATION.SCIENTIFIC;
  const p = big(a, inner, c, E_BUDGET - 1) ?? tetration(a, c);
  return { k: K_STACK, neg: true, inner: p };
}

/** Region B: 1e-3 ≤ v < 1000 (always layer 0). */
function small(v: Num, c: Ctx): Piece | null {
  const x = v.mag;
  if (Number.isInteger(x)) return { k: K_PLAIN, text: String(x) };
  const intDigits = x >= 1 ? String(Math.floor(x)).length : 0;
  const s = Math.max(c.p + 1, intDigits);
  let text = x.toPrecision(s);
  const r = Number(text);
  if (r >= 1000) return null; // carry into 1000
  // A carry to 10 or 100 when s equals the integer digits gives '1e+1'; show it as digits.
  if (text.indexOf('e') >= 0) text = r.toPrecision(s + 1);
  return { k: K_PLAIN, text };
}

function positive(v: Num, c: Ctx): Piece {
  if (v.lt(SMALL)) return tiny(v, c);
  if (v.lt(THOUSAND)) {
    const p = small(v, c);
    if (p !== null) return p;
    return positive(THOUSAND, c);
  }
  if (v.lt(c.t)) return { k: K_PLAIN, text: groupDigits(String(Math.floor(v.mag))) };
  return big(v, c.notation, c, E_BUDGET) ?? tetration(v, c);
}

// ---------------------------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------------------------

function display(p: Piece): string {
  switch (p.k) {
    case K_PLAIN:
      return p.text;
    case K_TET:
      return TETRATION + p.text;
    case K_MANT:
      return p.m + 'e' + exponentText(p.e, '-');
    case K_SUFFIX:
      return p.m + p.suffix;
    case K_LOG:
      return 'e' + p.text;
    case K_STACK:
      return 'e' + (p.neg ? '-' : '') + display(p.inner);
    case K_TET_BIG:
      return TETRATION + display(p.inner);
  }
}

function speak(p: Piece, w: SpokenWords): string {
  switch (p.k) {
    case K_MANT:
      return p.m + ' ' + w.timesTenToThe + ' ' + exponentText(p.e, MINUS);
    case K_STACK:
      return w.tenToThe + ' ' + (p.neg ? MINUS : '') + speak(p.inner, w);
    default:
      return display(p);
  }
}

// ---------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------

function context(tables: NotationTables, opts: Partial<FormatOptions> | undefined): Ctx {
  const o = opts ?? {};
  const p = o.precision ?? DEFAULT_FORMAT_OPTIONS.precision;
  return {
    notation: o.notation ?? DEFAULT_FORMAT_OPTIONS.notation,
    p: Number.isInteger(p) ? Math.min(4, Math.max(0, p)) : DEFAULT_FORMAT_OPTIONS.precision,
    t: o.intThreshold ?? DEFAULT_FORMAT_OPTIONS.intThreshold,
    tables,
  };
}

/** Builds the piece for v; zero and invalid values become plain text. */
function build(value: Num | number, c: Ctx, onInvalid?: (v: Num) => void): Built {
  const v = num(value);
  if (!isFiniteNum(v)) {
    onInvalid?.(v);
    return { neg: false, piece: { k: K_PLAIN, text: INVALID } };
  }
  if (v.sign === 0) return { neg: false, piece: { k: K_PLAIN, text: '0' } };
  if (v.sign < 0) return { neg: true, piece: positive(fromComponents(1, v.layer, v.mag), c) };
  return { neg: false, piece: positive(v, c) };
}

interface Built {
  readonly neg: boolean;
  readonly piece: Piece;
}

/** Formats v for display (GDD §4.2). Never returns NaN, Infinity, undefined or -0. */
export function formatNum(
  v: Num | number,
  tables: NotationTables,
  opts?: Partial<FormatOptions>,
): string {
  const b = build(v, context(tables, opts), opts?.onInvalid);
  return (b.neg ? MINUS : '') + display(b.piece);
}

/**
 * The screen-reader form: "1.23 times ten to the 45". Mantissa forms are always read in the
 * Scientific reading (whatever the notation), stacked forms as "ten to the …", and values below
 * the integer threshold and `10↑↑h` as displayed.
 */
export function spokenNum(
  v: Num | number,
  tables: NotationTables,
  opts?: Partial<FormatOptions>,
): string {
  const c = context(tables, { ...opts, notation: NOTATION.SCIENTIFIC });
  const b = build(v, c, opts?.onInvalid);
  return (b.neg ? MINUS : '') + speak(b.piece, tables.spoken);
}

export interface Formatter {
  format(v: Num | number, opts?: Partial<FormatOptions>): string;
  spoken(v: Num | number, opts?: Partial<FormatOptions>): string;
}

/**
 * Binds the tables, and optionally default options, once:
 * `createFormatter(NOTATION_TABLES, { onInvalid: devAssert }).format(x)`. Options passed to a call
 * override the defaults.
 */
export function createFormatter(
  tables: NotationTables,
  defaults?: Partial<FormatOptions>,
): Formatter {
  const merge = (opts?: Partial<FormatOptions>) =>
    defaults === undefined ? opts : { ...defaults, ...opts };
  return {
    format: (v, opts) => formatNum(v, tables, merge(opts)),
    spoken: (v, opts) => spokenNum(v, tables, merge(opts)),
  };
}
