// The test's inverse of every notation in src/engine/format.ts (GDD §4.2 "Order"): it turns a
// formatted string back into a `Num`, so the format tests can check widths by displayed value
// and weak monotonicity. Mantissas are parsed exactly as written; `e` prefixes become powers
// of ten, suffixes become 10^(3n+3), and `10↑↑h` becomes a tetration.
//
// `parseStrict` also checks the string against one notation's grammar at one precision, and
// throws on anything that notation would never print:
// - Scientific mantissas are [1-9] with exactly p decimals; Engineering mantissas are 1–999 with
//   exactly p decimals and an exponent that is a multiple of 3; Standard suffix mantissas are
//   1–999 with exactly p decimals and a known suffix.
// - Exponents have no leading zeros, are below 1e6 in size, and are comma-grouped exactly from
//   10,000 on. Logarithm values and `10↑↑h` heights have exactly p decimals, grouped the same way.
// - Integers of 1,000 or more are grouped by threes; smaller plain values are not grouped.
// - A stacked exponent uses Engineering in Engineering and Scientific in every other notation.
import { fromComponents, num, pow10, tetrate10, ZERO } from '../../../src/engine/num.ts';
import type { Num } from '../../../src/engine/num.ts';
import { NOTATION, groupDigits, standardSuffix } from '../../../src/engine/format.ts';
import type { Notation, NotationTables } from '../../../src/engine/format.ts';

const MINUS = '−';
const DASH = '—';
const TETRATION = '10↑↑';

/** The top-level shape of a formatted value. */
export type Form =
  | 'zero'
  | 'invalid'
  | 'plain' // 1e-3 ≤ v < 1000 as digits, ungrouped
  | 'grouped' // an integer ≥ 1,000 with comma grouping
  | 'mantissa' // m·10^E as `me E`
  | 'suffix' // Standard: m + suffix
  | 'log' // Logarithm: `e` + log10 v
  | 'stack' // `e` or `e-` + an inner form
  | 'tetration'; // `10↑↑h`

export interface Parsed {
  readonly value: Num;
  readonly form: Form;
  /** For `stack`: the inner form's value (|log10 v|) and form. */
  readonly inner?: Parsed;
  readonly negative?: boolean;
}

function suffixIndex(tables: NotationTables): Map<string, number> {
  const m = new Map<string, number>();
  for (let n = 0; n <= 100; n++) {
    const s = standardSuffix(n, tables.standard);
    if (s !== null) m.set(s, n);
  }
  return m;
}

function mantissaTimesPow10(m: string, e: number): Num {
  if (Math.abs(e) <= 290) return num(Number(`${m}e${e}`));
  return fromComponents(1, 1, e + Math.log10(Number(m)));
}

// ---------------------------------------------------------------------------------------------
// Lenient parsing (any notation, any precision)
// ---------------------------------------------------------------------------------------------

/**
 * Parses any formatted value. With `strict`, the string must also follow that notation's
 * grammar at that precision (see `parseStrict`).
 */
export function parseFormatted(
  s: string,
  tables: NotationTables,
  strict?: { readonly notation: Notation; readonly precision: number },
): Num {
  if (strict) return parseStrict(s, tables, strict.notation, strict.precision).value;
  if (s === DASH) return num(Number.NaN);
  if (s.startsWith(MINUS)) return parseFormatted(s.slice(1), tables).neg();
  return parsePositive(s, suffixIndex(tables));
}

function parseSigned(s: string, suffixes: Map<string, number>): Num {
  return s.startsWith('-') ? parsePositive(s.slice(1), suffixes).neg() : parsePositive(s, suffixes);
}

function parsePositive(s: string, suffixes: Map<string, number>): Num {
  if (s === '0') return ZERO;
  if (s.startsWith(TETRATION)) {
    const rest = s.slice(TETRATION.length);
    const h = rest.includes('e')
      ? parseSigned(rest, suffixes).toNumber()
      : Number(rest.replace(/,/g, ''));
    return tetrate10(h);
  }
  if (s.startsWith('e')) return pow10(parseSigned(s.slice(1), suffixes));
  const suffixed = /^(\d+(?:\.\d+)?)([A-Z][A-Za-z]*)$/.exec(s);
  if (suffixed) {
    const n = suffixes.get(suffixed[2]!);
    if (n === undefined) throw new Error(`unknown suffix in ${s}`);
    return mantissaTimesPow10(suffixed[1]!, 3 * n + 3);
  }
  const mant = /^(\d+(?:\.\d+)?)e(-?[\d,]+)$/.exec(s);
  if (mant) return mantissaTimesPow10(mant[1]!, Number(mant[2]!.replace(/,/g, '')));
  if (/^\d{1,3}(,\d{3})*(\.\d+)?$/.test(s) || /^\d+(\.\d+)?$/.test(s)) {
    return num(Number(s.replace(/,/g, '')));
  }
  throw new Error(`unparseable formatted number: ${JSON.stringify(s)}`);
}

// ---------------------------------------------------------------------------------------------
// Strict parsing (one notation, one precision)
// ---------------------------------------------------------------------------------------------

class GrammarError extends Error {}

interface Grammar {
  readonly notation: Notation;
  readonly p: number;
  readonly suffixes: Map<string, number>;
  readonly whole: string;
}

function fail(g: Grammar, why: string): never {
  throw new GrammarError(`${JSON.stringify(g.whole)} is not a valid form: ${why}`);
}

/** `\d+` with p decimals exactly (no point at p = 0). */
function decimalsRe(p: number): string {
  return p === 0 ? '' : `\\.\\d{${p}}`;
}

/** An integer part grouped exactly from 10,000 on (`9999`, `10,000`), no leading zeros. */
function checkGroupedFrom10k(g: Grammar, int: string, what: string): number {
  if (!/^(0|[1-9]\d*|[1-9]\d{0,2}(,\d{3})+)$/.test(int)) fail(g, `${what} ${int}`);
  const digits = int.replace(/,/g, '');
  const n = Number(digits);
  const expected = n >= 10_000 ? groupDigits(digits) : digits;
  if (int !== expected) fail(g, `${what} ${int} should be ${expected}`);
  return n;
}

/** A displayed exponent: optional ASCII '-', grouped from 10,000, below 1e6 in size. */
function exponentOf(g: Grammar, text: string): number {
  const neg = text.startsWith('-');
  const n = checkGroupedFrom10k(g, neg ? text.slice(1) : text, 'exponent');
  if (neg && n === 0) fail(g, 'exponent -0');
  if (n >= 1e6) fail(g, `exponent ${text} should have been stacked`);
  return neg ? -n : n;
}

/** A fixed-point value with exactly p decimals (Logarithm values and ↑↑ heights). */
function fixedOf(g: Grammar, text: string, signed: boolean): number {
  const neg = signed && text.startsWith('-');
  const body = neg ? text.slice(1) : text;
  const m = new RegExp(`^([\\d,]+)(${decimalsRe(g.p)})$`).exec(body);
  if (!m) fail(g, `fixed value ${text} needs exactly ${g.p} decimals`);
  const n = checkGroupedFrom10k(g, m[1]!, 'integer part');
  const v = Number(m[1]!.replace(/,/g, '') + m[2]!);
  if (neg && v === 0) fail(g, 'negative zero');
  if (n >= 1e6) fail(g, `fixed value ${text} should have been stacked`);
  return neg ? -v : v;
}

/** `me E` in `notation` (Scientific or Engineering grammar). */
function mantissaForm(g: Grammar, s: string, notation: Notation): Parsed | null {
  const m = /^(\d+(?:\.\d+)?)e(-?[\d,]+)$/.exec(s);
  if (!m) return null;
  const mant = m[1]!;
  const intRe = notation === NOTATION.ENGINEERING ? '[1-9]\\d{0,2}' : '[1-9]';
  if (!new RegExp(`^${intRe}${decimalsRe(g.p)}$`).test(mant)) {
    fail(
      g,
      `mantissa ${mant} is not ${notation === NOTATION.ENGINEERING ? '1–999' : '1–9'} with ${g.p} decimals`,
    );
  }
  const e = exponentOf(g, m[2]!);
  if (notation === NOTATION.ENGINEERING && e % 3 !== 0)
    fail(g, `exponent ${e} is not a multiple of 3`);
  return { value: mantissaTimesPow10(mant, e), form: 'mantissa' };
}

/** The positive part of a value printed in `notation` at its top level. */
function strictPositive(g: Grammar, s: string, notation: Notation, top: boolean): Parsed {
  if (top && s === '0') return { value: ZERO, form: 'zero' };
  if (s.startsWith(TETRATION)) {
    const rest = s.slice(TETRATION.length);
    if (rest.includes('e')) {
      const inner = mantissaForm(g, rest, NOTATION.SCIENTIFIC);
      if (!inner) fail(g, `↑↑ height ${rest}`);
      const h = inner.value.toNumber();
      if (h < 1e6) fail(g, `↑↑ height ${rest} should be fixed`);
      return { value: tetrate10(h), form: 'tetration' };
    }
    return { value: tetrate10(fixedOf(g, rest, false)), form: 'tetration' };
  }
  if (s.startsWith('e')) {
    const rest = s.slice(1);
    if (notation === NOTATION.LOGARITHM && !/[e↑]/.test(rest)) {
      const lg = fixedOf(g, rest, true);
      return { value: pow10(lg), form: 'log' };
    }
    const negative = rest.startsWith('-');
    const innerText = negative ? rest.slice(1) : rest;
    const innerNotation =
      notation === NOTATION.ENGINEERING ? NOTATION.ENGINEERING : NOTATION.SCIENTIFIC;
    const inner = strictPositive(g, innerText, innerNotation, false);
    if (inner.form !== 'mantissa' && inner.form !== 'stack' && inner.form !== 'tetration') {
      fail(g, `a stacked exponent cannot be ${inner.form}`);
    }
    if (inner.form === 'mantissa' && inner.value.lt(1e6)) fail(g, 'stacked exponent below 1e6');
    if (inner.form === 'tetration' && !negative) fail(g, 'a positive stack never holds 10↑↑h');
    const value = pow10(negative ? inner.value.neg() : inner.value);
    return { value, form: 'stack', inner, negative };
  }
  if (!top) {
    const inner = mantissaForm(g, s, notation);
    if (inner === null) fail(g, `inner form ${s}`);
    return inner;
  }
  if (notation === NOTATION.STANDARD) {
    const m = /^(\d+(?:\.\d+)?)([A-Z][A-Za-z]*)$/.exec(s);
    if (m) {
      const n = g.suffixes.get(m[2]!);
      if (n === undefined) fail(g, `unknown suffix ${m[2]}`);
      if (!new RegExp(`^[1-9]\\d{0,2}${decimalsRe(g.p)}$`).test(m[1]!)) {
        fail(g, `suffix mantissa ${m[1]} is not 1–999 with ${g.p} decimals`);
      }
      return { value: mantissaTimesPow10(m[1]!, 3 * n + 3), form: 'suffix' };
    }
  }
  const mantNotation =
    notation === NOTATION.ENGINEERING ? NOTATION.ENGINEERING : NOTATION.SCIENTIFIC;
  const mant = mantissaForm(g, s, mantNotation);
  if (mant) {
    if (notation === NOTATION.LOGARITHM) fail(g, 'Logarithm never prints a mantissa form');
    return mant;
  }
  if (/^[1-9]\d{0,2}(,\d{3})+$/.test(s)) {
    const digits = s.replace(/,/g, '');
    if (groupDigits(digits) !== s) fail(g, `grouping of ${s}`);
    return { value: num(Number(digits)), form: 'grouped' };
  }
  if (/^(0|[1-9]\d{0,2})(\.\d+)?$/.test(s)) return { value: num(Number(s)), form: 'plain' };
  return fail(g, 'no notation prints this');
}

/**
 * Parses s, which must be a value printed in `notation` at `precision`; throws otherwise. The
 * result carries the top-level form, so the shape tests can check which form was chosen.
 */
export function parseStrict(
  s: string,
  tables: NotationTables,
  notation: Notation,
  precision: number,
): Parsed & { readonly sign: 1 | -1 } {
  const g: Grammar = { notation, p: precision, suffixes: suffixIndex(tables), whole: s };
  if ((s.match(/e/g)?.length ?? 0) > 3) fail(g, 'more than 3 e characters');
  if (s === DASH) return { value: num(Number.NaN), form: 'invalid', sign: 1 };
  if (s.startsWith(MINUS)) {
    const r = strictPositive(g, s.slice(1), notation, true);
    if (r.form === 'zero') fail(g, 'negative zero');
    return { ...r, value: r.value.neg(), sign: -1 };
  }
  return { ...strictPositive(g, s, notation, true), sign: 1 };
}
