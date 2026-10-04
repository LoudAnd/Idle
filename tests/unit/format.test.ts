// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import {
  NOTATION,
  createFormatter,
  formatNum,
  groupDigits,
  spokenNum,
  standardSuffix,
} from '../../src/engine/format.ts';
import type { FormatOptions, Notation, NotationTables } from '../../src/engine/format.ts';
import { CAP, TOWER1, fromComponents, log10, num, pow10, tetrate10 } from '../../src/engine/num.ts';
import type { Num } from '../../src/engine/num.ts';
import { NOTATION_TABLES } from '../../src/ui/strings.ts';
import { REPO_ROOT, importSpecifiers, stringLiterals, stripComments } from '../arch/lib/scan.ts';
import {
  FC_10K,
  FC_SEED,
  arbFormatInput,
  sampleFormatInputs,
  uniform,
} from './support/arbitraries.ts';
import { parseFormatted, parseStrict } from './support/notation-parse.ts';
import type { Parsed } from './support/notation-parse.ts';

const PROPERTY = { timeout: 120_000 };
const { SCIENTIFIC, ENGINEERING, LOGARITHM, STANDARD } = NOTATION;
const NOTATIONS: readonly Notation[] = [SCIENTIFIC, ENGINEERING, LOGARITHM, STANDARD];
const NOTATION_NAMES = ['Scientific', 'Engineering', 'Logarithm', 'Standard'] as const;
const THRESHOLDS = [1e3, 1e6, 1e9] as const;

const fmt = (v: Num | number, opts?: Partial<FormatOptions>) => formatNum(v, NOTATION_TABLES, opts);
const parse = (s: string) => parseFormatted(s, NOTATION_TABLES);
/** Parses s, which must follow the notation's grammar at that precision (or the test fails). */
const parseAs = (s: string, notation: Notation, precision: number) =>
  parseFormatted(s, NOTATION_TABLES, { notation, precision });

/** m·10^E on layer 1, built from components (string parsing loses mantissa digits). */
const at = (m: number, e: number) => fromComponents(1, 1, e + Math.log10(m));

interface Row {
  readonly label: string;
  readonly input: Num | number;
  readonly opts?: Partial<FormatOptions>;
  readonly expected: string;
  readonly roadmap?: number;
}

const row = (label: string, input: Num | number, expected: string, roadmap?: number): Row => ({
  label,
  input,
  expected,
  roadmap,
});
const withOpts = (
  label: string,
  input: Num | number,
  opts: Partial<FormatOptions>,
  expected: string,
  roadmap?: number,
): Row => ({ label, input, opts, expected, roadmap });

const eng = { notation: ENGINEERING };
const lg = { notation: LOGARITHM };
const std = { notation: STANDARD };

const FORMAT_TABLE: readonly Row[] = [
  // ROADMAP M1 rows 1–13.
  row('0', 0, '0', 1),
  row('999999', 999999, '999,999', 2),
  row('1234567', 1234567, '1.23e6', 3),
  row('2^1024', CAP, '1.80e308', 4),
  withOpts('9.995e5 (T = 1e3)', 9.995e5, { intThreshold: 1e3 }, '1.00e6', 5),
  row('2^65536', TOWER1, '2.00e19,728', 6),
  row('10^(1.23e45)', pow10(1.23e45), 'e1.23e45', 7),
  withOpts('1.2345e47 Engineering', 1.2345e47, eng, '123.45e45', 8),
  withOpts('1.2345e47 Logarithm', 1.2345e47, lg, 'e47.09', 9),
  withOpts('1.2345e47 Standard', 1.2345e47, std, '123.45QaDc', 10),
  withOpts('1e303 Standard', 1e303, std, '1.00Ce', 11),
  withOpts('9.99999e305 Standard', 9.99999e305, std, '1.00e306', 12),
  row('1e-5', 1e-5, '1.00e-5', 13),

  // GDD §4.2 mode table and Standard rows.
  row('1.2345e47 Scientific', 1.2345e47, '1.23e47'),
  withOpts('2^65536 Engineering', TOWER1, eng, '2.00e19,728'),
  withOpts('2^65536 Logarithm', TOWER1, lg, 'e19,728.30'),
  withOpts('2^65536 Standard', TOWER1, std, '2.00e19,728'),
  withOpts('9.9999e302 Standard', at(9.9999, 302), std, '999.99NoNog'),
  withOpts('9.9999e305 Standard', at(9.9999, 305), std, '999.99Ce'),
  withOpts('1e306 Standard', 1e306, std, '1.00e306'),
  withOpts('1e33 Standard', 1e33, std, '1.00Dc'),
  withOpts('1e45 Standard', 1e45, std, '1.00QaDc'),
  withOpts('1e285 Standard', 1e285, std, '1.00QaNog'),
  row('12.3', 12.3, '12.3'),
  row('0.456', 0.456, '0.456'),

  // The default integer threshold (1e6).
  row('999500 (below the default threshold)', 999500, '999,500'),
  row('10', 10, '10'),
  row('1', 1, '1'),
  row('1000', 1000, '1,000'),
  row('1234.9 floors', 1234.9, '1,234'),
  row('999999.9 floors', 999999.9, '999,999'),
  row('1e6', 1e6, '1.00e6'),
  row('999.6 carries to 1,000', 999.6, '1,000'),

  // Threshold 1e9 and 1e3.
  withOpts('999999999 (T = 1e9)', 999999999, { intThreshold: 1e9 }, '999,999,999'),
  withOpts('1e9 (T = 1e9)', 1e9, { intThreshold: 1e9 }, '1.00e9'),
  withOpts('1234 (T = 1e3)', 1234, { intThreshold: 1e3 }, '1.23e3'),
  withOpts('999 (T = 1e3)', 999, { intThreshold: 1e3 }, '999'),
  withOpts('999.6 carries to 1.00e3 (T = 1e3)', 999.6, { intThreshold: 1e3 }, '1.00e3'),

  // Small values.
  row('0.001', 0.001, '0.00100'),
  row('0.000999', 0.000999, '9.99e-4'),
  row('9.996e-4 carries', 9.996e-4, '1.00e-3'),
  row('1e-400', num('1e-400'), '1.00e-400'),
  row('1.5e-300', 1.5e-300, '1.50e-300'),
  row('1e-999999', num('1e-999999'), '1.00e-999,999'),
  row('0.5', 0.5, '0.500'),
  row('2.0000001', 2.0000001, '2.00'),
  row('9.996', 9.996, '10.0'),
  row('99.996', 99.996, '100'),
  row('1e-10000', num('1e-10000'), '1.00e-10,000'),
  row('1.2e-1000000', at(1.2, -1000000), 'e-1.00e6'),
  row('10^-(10^30)', fromComponents(1, 2, -30), 'e-1.00e30'),

  // Carries and stacks.
  row('9.9999e9999 carries', at(9.9999, 9999), '1.00e10,000'),
  row('9.99e9999', at(9.99, 9999), '9.99e9999'),
  row('9.99e999999', at(9.99, 999999), '9.99e999,999'),
  row('9.996e999999 promotes to the next depth', at(9.996, 999999), 'e1.00e6'),
  row('10^1e6', pow10(1e6), 'e1.00e6'),
  row('10^(9.99e999999)', pow10(at(9.99, 999999)), 'e9.99e999,999'),
  row('10^10^(1.23e45)', pow10(pow10(1.23e45)), 'ee1.23e45'),
  row('10^10^10^1e6', fromComponents(1, 3, 1e6), '10↑↑4.86'),
  row('10↑↑5', tetrate10(5), '10↑↑5.00'),
  row('10↑↑6', tetrate10(6), '10↑↑6.00'),
  row('10↑↑(1e6 + 0.5)', tetrate10(1e6 + 0.5), '10↑↑1.00e6'),

  // Engineering.
  withOpts('1234567 Engineering', 1234567, eng, '1.23e6'),
  withOpts('12345678 Engineering', 12345678, eng, '12.35e6'),
  withOpts('123456789 Engineering', 123456789, eng, '123.46e6'),
  withOpts('9.9999e999998 Engineering', at(9.9999, 999998), eng, '999.99e999,996'),
  withOpts('999999.5 Engineering (T = 1e3)', 999999.5, { ...eng, intThreshold: 1e3 }, '1.00e6'),
  withOpts('1e-5 Engineering', 1e-5, eng, '10.00e-6'),
  withOpts('10^(1.23e45) Engineering', pow10(1.23e45), eng, 'e1.23e45'),
  // A stacked exponent is itself Engineering in Engineering (and Scientific elsewhere).
  withOpts('10^(1.2345e47) Engineering', pow10(1.2345e47), eng, 'e123.45e45'),
  row('10^(1.2345e47) Scientific', pow10(1.2345e47), 'e1.23e47'),
  withOpts('10^-(1.2345e47) Engineering', fromComponents(1, 2, -47.0915), eng, 'e-123.45e45'),
  // Layer-0 carries into 10^(3k+1) and 10^(3k+2) keep the multiple-of-3 exponent.
  withOpts('99999999.9 Engineering', 99999999.9, eng, '100.00e6'),
  withOpts('9999.999 Engineering (T = 1e3)', 9999.999, { ...eng, intThreshold: 1e3 }, '10.00e3'),
  withOpts('9.9999e-5 Engineering', 9.9999e-5, eng, '100.00e-6'),

  // Logarithm.
  withOpts('1234567 Logarithm', 1234567, lg, 'e6.09'),
  withOpts('1e-5 Logarithm', 1e-5, lg, 'e-5.00'),
  withOpts('10^(1.23e45) Logarithm', pow10(1.23e45), lg, 'e1.23e45'),
  withOpts('10^999999.996 Logarithm', pow10(999999.996), lg, 'e1.00e6'),

  // Standard.
  withOpts('1234567 Standard', 1234567, std, '1.23M'),
  withOpts('1e9 Standard', 1e9, std, '1.00B'),
  withOpts('1e12 Standard', 1e12, std, '1.00T'),
  withOpts('1e15 Standard', 1e15, std, '1.00Qa'),
  withOpts('1e30 Standard', 1e30, std, '1.00No'),
  withOpts('1e36 Standard', 1e36, std, '1.00UDc'),
  withOpts('999995 Standard (T = 1e3)', 999995, { ...std, intThreshold: 1e3 }, '1.00M'),
  withOpts('1e3 Standard (T = 1e3)', 1e3, { ...std, intThreshold: 1e3 }, '1.00K'),
  withOpts('1e-5 Standard', 1e-5, std, '1.00e-5'),
  withOpts('99999999.9 Standard', 99999999.9, std, '100.00M'),
  withOpts('9.9999e10 Standard', at(9.9999, 10), std, '100.00B'),
  withOpts('9999.999 Standard (T = 1e3)', 9999.999, { ...std, intThreshold: 1e3 }, '10.00K'),

  // Precision.
  withOpts('1.2345e47 at p = 0', 1.2345e47, { precision: 0 }, '1e47'),
  withOpts('1.2345e47 at p = 4', 1.2345e47, { precision: 4 }, '1.2345e47'),
  withOpts('0.456 at p = 0', 0.456, { precision: 0 }, '0.5'),
  withOpts('12.3 at p = 0', 12.3, { precision: 0 }, '12'),
  withOpts('10^10^10^1e6 at p = 0', fromComponents(1, 3, 1e6), { precision: 0 }, '10↑↑5'),
  withOpts('10^10^10^1e6 at p = 4', fromComponents(1, 3, 1e6), { precision: 4 }, '10↑↑4.8505'),
  withOpts('1.2345e47 Logarithm at p = 0', 1.2345e47, { ...lg, precision: 0 }, 'e47'),
  withOpts('1.2345e47 Logarithm at p = 4', 1.2345e47, { ...lg, precision: 4 }, 'e47.0915'),
  withOpts('1e-5 Logarithm at p = 0', 1e-5, { ...lg, precision: 0 }, 'e-5'),
  withOpts('1e-5 Logarithm at p = 4', 1e-5, { ...lg, precision: 4 }, 'e-5.0000'),
  withOpts('9.99999e9999 carries at p = 4', at(9.99999, 9999), { precision: 4 }, '1.0000e10,000'),
  withOpts('9.6e9999 carries at p = 0', at(9.6, 9999), { precision: 0 }, '1e10,000'),
  withOpts('1.2345NoNog at p = 4', at(1.2345, 300), { ...std, precision: 4 }, '1.2345NoNog'),
  withOpts('precision 7 clamps to 4', 1.2345678e47, { precision: 7 }, '1.2346e47'),
  withOpts('precision −1 clamps to 0', 1.2345678e47, { precision: -1 }, '1e47'),
  // slog10 lands a hair above 5 (5 + 1e-12): the 1e-9 tolerance keeps it at 5.00, not 5.01.
  row('10↑↑(5 + 1e-12) rounds up within the tolerance', tetrate10(5 + 1e-12), '10↑↑5.00'),

  // Sign and invalid values.
  row('−1234567', -1234567, '−1.23e6'),
  row('−0', -0, '0'),
  row('NaN', Number.NaN, '—'),
  row('Infinity', Number.POSITIVE_INFINITY, '—'),
  row('−Infinity', Number.NEGATIVE_INFINITY, '—'),
];

describe('format table', () => {
  it.each(FORMAT_TABLE)('$label → $expected', ({ input, opts, expected }) => {
    expect(fmt(input, opts)).toBe(expected);
  });

  it('the table has ≥ 60 cases and every roadmap row', () => {
    expect(FORMAT_TABLE.length).toBeGreaterThanOrEqual(60);
    const roadmap = FORMAT_TABLE.flatMap((r) => (r.roadmap === undefined ? [] : [r.roadmap]));
    expect(roadmap).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(new Set(FORMAT_TABLE.map((r) => r.label)).size).toBe(FORMAT_TABLE.length);
  });

  it('calls onInvalid once for a non-finite value', () => {
    const onInvalid = vi.fn();
    expect(fmt(Number.NaN, { onInvalid })).toBe('—');
    expect(onInvalid).toHaveBeenCalledTimes(1);
    expect(fmt(5, { onInvalid })).toBe('5');
    expect(onInvalid).toHaveBeenCalledTimes(1);
  });

  it('createFormatter binds the tables', () => {
    const f = createFormatter(NOTATION_TABLES);
    expect(f.format(1234567, { notation: STANDARD })).toBe('1.23M');
    expect(f.spoken(1.23e45)).toBe('1.23 times ten to the 45');
  });

  it('createFormatter binds default options, such as the dev assertion (onInvalid)', () => {
    // GDD §4.2: a non-finite value renders as — and raises a dev assertion. The UI binds the
    // assertion once here; format.ts itself cannot tell a dev build from a release build.
    const onInvalid = vi.fn();
    const f = createFormatter(NOTATION_TABLES, { onInvalid, notation: ENGINEERING });
    expect(f.format(Number.NaN)).toBe('—');
    expect(f.spoken(Number.POSITIVE_INFINITY)).toBe('—');
    expect(onInvalid).toHaveBeenCalledTimes(2);
    expect(f.format(12345678)).toBe('12.35e6');
    expect(f.format(12345678, { notation: SCIENTIFIC })).toBe('1.23e7');
    const assertDev = () => {
      throw new Error('non-finite value');
    };
    expect(() => createFormatter(NOTATION_TABLES, { onInvalid: assertDev }).format(NaN)).toThrow(
      'non-finite value',
    );
  });

  it('groupDigits groups by threes', () => {
    expect(groupDigits('1')).toBe('1');
    expect(groupDigits('1234')).toBe('1,234');
    expect(groupDigits('1234567')).toBe('1,234,567');
    expect(groupDigits('123456789')).toBe('123,456,789');
  });
});

describe('standard suffixes', () => {
  const t = NOTATION_TABLES.standard;

  it('the strings.ts tables have the 10/10/10 shape', () => {
    expect(t.first).toHaveLength(10);
    expect(t.units).toHaveLength(10);
    expect(t.tens).toHaveLength(10);
    expect(t.units[0]).toBe('');
    expect(t.tens[0]).toBe('');
    expect(t.hundred).toBe('Ce');
  });

  it('S(0…100) are all distinct and non-empty', () => {
    const all = Array.from({ length: 101 }, (_, n) => standardSuffix(n, t));
    expect(all.every((s) => s !== null && s.length > 0)).toBe(true);
    expect(new Set(all).size).toBe(101);
  });

  it.each([
    [0, 'K'],
    [1, 'M'],
    [9, 'No'],
    [10, 'Dc'],
    [11, 'UDc'],
    [14, 'QaDc'],
    [94, 'QaNog'],
    [99, 'NoNog'],
    [100, 'Ce'],
  ])('S(%i) = %s', (n, s) => {
    expect(standardSuffix(n, t)).toBe(s);
  });

  it('is null out of range or for a missing table entry (never "undefined")', () => {
    expect(standardSuffix(-1, t)).toBeNull();
    expect(standardSuffix(101, t)).toBeNull();
    expect(standardSuffix(1.5, t)).toBeNull();
    const broken: NotationTables = { ...NOTATION_TABLES, standard: { ...t, first: ['K'] } };
    expect(standardSuffix(1, broken.standard)).toBeNull();
    // The formatter falls back to Scientific instead of printing a missing suffix.
    expect(formatNum(1234567, broken, { notation: STANDARD })).toBe('1.23e6');
  });

  it('every suffix comes from the tables parameter (none is built in)', () => {
    const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    const fake: NotationTables = {
      ...NOTATION_TABLES,
      standard: {
        first: digits.map((d) => `k${d}`),
        units: digits.map((d) => (d === '0' ? '' : `u${d}`)),
        tens: digits.map((d) => (d === '0' ? '' : `t${d}`)),
        hundred: 'h',
      },
    };
    const o = { notation: STANDARD, intThreshold: 1e3 } as const;
    expect(formatNum(1e3, fake, o)).toBe('1.00k0');
    expect(formatNum(1e6, fake, o)).toBe('1.00k1');
    expect(formatNum(1e30, fake, o)).toBe('1.00k9');
    expect(formatNum(1e33, fake, o)).toBe('1.00t1');
    expect(formatNum(1e36, fake, o)).toBe('1.00u1t1');
    expect(formatNum(1e285, fake, o)).toBe('1.00u4t9');
    expect(formatNum(1e303, fake, o)).toBe('1.00h');
  });
});

describe('spoken form', () => {
  const say = (v: Num | number, opts?: Partial<FormatOptions>) =>
    spokenNum(v, NOTATION_TABLES, opts);

  it('reads 1.23e45 as "1.23 times ten to the 45"', () => {
    expect(say(1.23e45)).toBe('1.23 times ten to the 45');
  });

  it('words come from the tables parameter', () => {
    const fake: NotationTables = {
      ...NOTATION_TABLES,
      spoken: { timesTenToThe: 'X', tenToThe: 'Y' },
    };
    expect(spokenNum(1.23e45, fake)).toBe('1.23 X 45');
    expect(spokenNum(pow10(1.23e45), fake)).toBe('Y 1.23 X 45');
  });

  it('uses the Scientific reading whatever the notation', () => {
    expect(say(1.2345e47, { notation: STANDARD })).toBe('1.23 times ten to the 47');
    expect(say(1.2345e47, { notation: ENGINEERING })).toBe('1.23 times ten to the 47');
    expect(say(1.2345e47, { notation: LOGARITHM })).toBe('1.23 times ten to the 47');
  });

  it('reads stacked forms with "ten to the"', () => {
    expect(say(pow10(1.23e45))).toBe('ten to the 1.23 times ten to the 45');
    expect(say(pow10(pow10(1.23e45)))).toBe('ten to the ten to the 1.23 times ten to the 45');
  });

  it('groups exponents and uses U+2212 for negative exponents and values', () => {
    expect(say(TOWER1)).toBe('2.00 times ten to the 19,728');
    expect(say(1e-5)).toBe('1.00 times ten to the −5');
    expect(say(-1234567)).toBe('−1.23 times ten to the 6');
    expect(say(at(1.2, -1000000))).toBe('ten to the −1.00 times ten to the 6');
  });

  it('reads small values, 0, — and 10↑↑ as displayed', () => {
    expect(say(999999)).toBe('999,999');
    expect(say(0)).toBe('0');
    expect(say(0.456)).toBe('0.456');
    expect(say(Number.NaN)).toBe('—');
    expect(say(fromComponents(1, 3, 1e6))).toBe('10↑↑4.86');
  });
});

// ---------------------------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------------------------

const FORBIDDEN = /NaN|Infinity|undefined|(^|[^\d.,])[-−]0(?![.,\d])/;

/**
 * The width limit at precision 2 for a displayed value d (GDD §4.2), bucketed by the displayed
 * value (so a carry such as `1.00e10,000` is judged in the bucket it shows).
 * - 1e-3 ≤ d < 1e10000 and d < e1e6: the GDD table; 11 below 1e9 when T = 1e9.
 * - d < 1e-3: the same columns chosen by the size of the exponent, plus 1 for its minus sign.
 * - Beyond the table (derived, not in the GDD): an `e` prefix adds one character to the
 *   exponent's own limit; `10↑↑h` forms are at most 14 (`10↑↑999,999.99`).
 */
function widthLimit(notation: Notation, t: number, d: Num): number {
  const inner = notation === ENGINEERING ? ENGINEERING : SCIENTIFIC;
  if (d.lt(1e-3)) {
    const lg = log10(d).abs();
    const e = lg.lt(1e15) ? Math.ceil(lg.toNumber()) : Number.POSITIVE_INFINITY;
    const column = notation === STANDARD ? SCIENTIFIC : notation;
    if (e < 10_000) return widthLimit(column, 1e6, num(10)) + 1;
    if (e < 1e6) return widthLimit(column, 1e6, pow10(10_000)) + 1;
    // `e-` + |log10 d|.
    return 2 + widthLimit(inner, 1e6, lg);
  }
  if (t === 1e9 && d.lt(1e9)) return 11;
  if (d.lt(pow10(10_000))) {
    if (notation === ENGINEERING) return 11;
    if (notation === STANDARD && d.lt(1e306)) return 11;
    return 10;
  }
  if (d.lt(pow10(1e6))) return notation === ENGINEERING ? 15 : 13;
  if (d.gte(TETRATION_FROM)) return 14;
  return 1 + widthLimit(inner, 1e6, log10(d));
}

/** 10^10^10^1e6: from here on (and after a carry just below it) the display is `10↑↑h`. */
const TETRATION_FROM = fromComponents(1, 3, 1e6);

const inputs = sampleFormatInputs();

describe('format properties', () => {
  it(
    'never emits NaN, Infinity, undefined or a negative zero (display and spoken)',
    PROPERTY,
    () => {
      fc.assert(
        fc.property(arbFormatInput, fc.boolean(), (v, negate) => {
          const x = negate ? v.neg() : v;
          for (const notation of NOTATIONS) {
            for (const intThreshold of THRESHOLDS) {
              for (let precision = 0; precision <= 4; precision++) {
                const o = { notation, intThreshold, precision };
                const s = fmt(x, o);
                if (s.length === 0 || FORBIDDEN.test(s)) return false;
                const spoken = spokenNum(x, NOTATION_TABLES, o);
                if (spoken.length === 0 || FORBIDDEN.test(spoken)) return false;
              }
            }
          }
          return true;
        }),
        FC_10K,
      );
    },
  );

  it('the forbidden-token pattern catches -0 and −0 but not −0.456 or e-10', () => {
    for (const bad of ['-0', '−0', 'e-0', '1.00e-0', 'NaN', 'x Infinity', 'undefinedK']) {
      expect(bad).toMatch(FORBIDDEN);
    }
    for (const ok of ['−0.456', '0', '1.00e-10', '10.0', '−1,000', 'e-5.00', '0.00100']) {
      expect(ok).not.toMatch(FORBIDDEN);
    }
  });

  it('widths meet GDD §4.2 per notation (10,000 values and the boundary ladders)', PROPERTY, () => {
    const failures: string[] = [];
    for (const v of [...inputs, ...boundaryLadder()]) {
      for (const notation of NOTATIONS) {
        for (const t of THRESHOLDS) {
          const s = fmt(v, { notation, intThreshold: t, precision: 2 });
          const d = parseAs(s, notation, 2);
          const limit = d.sign === 0 ? 1 : widthLimit(notation, t, d);
          if (s.length > limit) {
            failures.push(`${NOTATION_NAMES[notation]} T=${t}: ${s} (${s.length} > ${limit})`);
          }
        }
      }
    }
    expect(failures.slice(0, 20)).toEqual([]);
  });

  it.each([
    ['2.00e19,728', 11, TOWER1, {}],
    ['9.99e999,999', 12, at(9.99, 999999), {}],
    ['1.00e-999,999', 13, num('1e-999999'), {}],
    ['999.99e999,996', 14, at(9.9999, 999998), eng],
    ['999.99NoNog', 11, at(9.9999, 302), std],
    ['999,999,999', 11, 999999999, { intThreshold: 1e9 }],
  ] as const)('boundary width fixture %s (%i characters)', (expected, length, input, opts) => {
    const s = fmt(input, opts);
    expect(s).toBe(expected);
    expect(s.length).toBe(length);
    const notation = (opts as Partial<FormatOptions>).notation ?? SCIENTIFIC;
    const t = (opts as Partial<FormatOptions>).intThreshold ?? 1e6;
    expect(s.length).toBeLessThanOrEqual(widthLimit(notation, t, parse(s)));
  });

  it('weakly monotone per notation (10,000 sorted values)', PROPERTY, () => {
    const sorted = [...inputs].sort((a, b) => a.cmp(b));
    checkMonotone(sorted, [0, 2, 4]);
  });

  it('weakly monotone over boundary ladders', PROPERTY, () => {
    checkMonotone(boundaryLadder(), [0, 1, 2, 3, 4]);
  });

  it('weakly monotone for pairs (v, v·(1 + δ))', PROPERTY, () => {
    fc.assert(
      fc.property(arbFormatInput, uniform(-13, -1), (v, u) => {
        const w = v.mul(1 + 10 ** u);
        for (const notation of NOTATIONS) {
          for (const intThreshold of THRESHOLDS) {
            const o = { notation, intThreshold, precision: 2 };
            expect(parse(fmt(v, o)).lte(parse(fmt(w, o)))).toBe(true);
          }
        }
      }),
      { seed: FC_SEED, numRuns: 2_000 },
    );
  });
});

describe('format shapes', () => {
  it(
    "every output has its notation's shape, region and accuracy (10,000 values, p = 0, 2, 4)",
    PROPERTY,
    () => {
      const failures: string[] = [];
      for (const v of [...inputs, ...boundaryLadder()]) {
        for (const notation of NOTATIONS) {
          for (const t of THRESHOLDS) {
            for (const p of [0, 2, 4]) {
              const s = fmt(v, { notation, intThreshold: t, precision: p });
              const why = shapeProblem(v, s, notation, t, p);
              if (why !== null) {
                failures.push(
                  `${NOTATION_NAMES[notation]} T=${t} p=${p} ${v.toString()} → ${s}: ${why}`,
                );
              }
            }
          }
        }
      }
      expect(failures.slice(0, 20)).toEqual([]);
    },
  );

  it('the strict parser rejects forms no notation prints', () => {
    const bad: [string, Notation, number][] = [
      ['0.50e-400', SCIENTIFIC, 2], // mantissa below 1
      ['12.3e6', SCIENTIFIC, 1], // mantissa of 10 or more
      ['1.234e6', SCIENTIFIC, 2], // too many decimals
      ['1.2e6', SCIENTIFIC, 2], // too few decimals
      ['1234', SCIENTIFIC, 2], // an ungrouped integer of 1,000 or more
      ['1,23,456', SCIENTIFIC, 2], // wrong grouping
      ['1.00e8', ENGINEERING, 2], // exponent not a multiple of 3
      ['1000.00e3', ENGINEERING, 2], // mantissa of 1000
      ['1.00e1000000', SCIENTIFIC, 2], // exponent ≥ 1e6 must stack
      ['1.00e10000', SCIENTIFIC, 2], // exponent ≥ 10,000 must be grouped
      ['1.00e9,999', SCIENTIFIC, 2], // exponent below 10,000 must not be grouped
      ['1000.00K', STANDARD, 2], // suffix mantissa of 1000
      ['e47.1', LOGARITHM, 2], // Logarithm decimals
      ['1.23e47', LOGARITHM, 2], // Logarithm never prints a mantissa
      ['e1.23e45', ENGINEERING, 2], // fine, but ↓ is not
      ['e12.30e45', SCIENTIFIC, 2], // a Scientific stack with an Engineering inner
      ['eeee1.00e6', SCIENTIFIC, 2], // more than 3 e characters
      ['−0', SCIENTIFIC, 2],
    ];
    const accepted = bad.filter(([s, n, p]) => {
      try {
        parseStrict(s, NOTATION_TABLES, n, p);
        return true;
      } catch {
        return false;
      }
    });
    expect(accepted.map(([s]) => s)).toEqual(['e1.23e45']);
  });
});

/** log10 of a positive Num as a double (fine for the layers the shape test samples). */
const lg10 = (x: Num): number => log10(x).toNumber();

/**
 * Why `s`, the format of v in `notation` at threshold t and precision p, has the wrong shape, or
 * null when it is right (GDD §4.2):
 * - the strict grammar of the notation (`parseStrict`);
 * - the region: v < 1e-3 is a mantissa, `e-` or Logarithm form; 1e-3 ≤ v < 1000 is plain digits
 *   with at least p + 1 significant digits (or a carry to 1000); 1000 ≤ v < T is ⌊v⌋ grouped;
 *   v ≥ T is the notation's form, and Standard uses a suffix whenever the shown value is below
 *   1e306; a stack only from 10^1e6 on;
 * - accuracy: a mantissa, suffix or plain value is within half a unit of its last decimal, a
 *   Logarithm value within half a unit of its last decimal in log space, and a stack's exponent
 *   within the same bound of log10 v.
 */
function shapeProblem(v: Num, s: string, notation: Notation, t: number, p: number): string | null {
  let r: Parsed;
  try {
    r = parseStrict(s, NOTATION_TABLES, notation, p);
  } catch (e) {
    return (e as Error).message;
  }
  if (v.sign === 0) return s === '0' ? null : 'zero must be 0';
  const d = r.value;
  if (v.lt(1e-3)) {
    if (!['mantissa', 'stack', 'log'].includes(r.form)) return `a value below 1e-3 as ${r.form}`;
    if (r.form === 'stack' && !r.negative) return 'a value below 1e-3 with a positive stack';
  } else if (v.lt(1000)) {
    if (r.form === 'plain') {
      if (Number.isInteger(v.mag)) {
        if (d.mag !== v.mag) return 'an integer changed';
      } else {
        const sig = s.replace('.', '').replace(/^0+/, '').length;
        if (sig < p + 1) return `${sig} significant digits, fewer than p + 1`;
      }
    } else if (!d.eq(1000)) {
      return `a value below 1000 as ${r.form}`;
    } else if (t > 1000 ? r.form !== 'grouped' : r.form === 'grouped') {
      return `the carry to 1000 as ${r.form}`;
    }
  } else if (v.lt(t)) {
    if (r.form !== 'grouped') return `a value below the threshold as ${r.form}`;
    if (!d.eq(v.floor())) return 'not ⌊v⌋';
    return null;
  } else {
    const allowed: readonly string[] =
      notation === LOGARITHM
        ? ['log', 'stack', 'tetration']
        : notation === STANDARD && d.lt(1e306)
          ? ['suffix']
          : ['mantissa', 'stack', 'tetration'];
    if (!allowed.includes(r.form)) return `${r.form} at or above the threshold`;
    if (r.form === 'stack' && (r.negative || d.lt(pow10(1e6)))) return 'stacked below 10^1e6';
  }
  return accuracyProblem(v, r, p);
}

function accuracyProblem(v: Num, r: Parsed, p: number): string | null {
  const half = 0.5 * 10 ** -p;
  const lv = lg10(v);
  const tol = 1e-12 * Math.max(1, Math.abs(lv));
  switch (r.form) {
    case 'mantissa':
    case 'suffix': {
      const err = Math.abs(lg10(r.value) - lv);
      return err <= Math.log10(1 + half) + tol ? null : `off by ${err} in log10`;
    }
    case 'log': {
      const err = Math.abs(lg10(r.value) - lv);
      return err <= half + tol ? null : `log10 off by ${err}`;
    }
    case 'plain':
    case 'grouped': {
      const err = Math.abs(r.value.toNumber() - v.toNumber()) / v.toNumber();
      return err <= half * (1 + 1e-12) ? null : `relative error ${err}`;
    }
    case 'stack': {
      const inner = r.inner;
      if (inner === undefined || inner.form !== 'mantissa') return null;
      const target = log10(v).abs();
      const err = Math.abs(lg10(inner.value) - lg10(target));
      const tolInner = 1e-12 * Math.max(1, Math.abs(lg10(target)));
      return err <= Math.log10(1 + half) + tolInner ? null : `exponent off by ${err} in log10`;
    }
    default:
      return null;
  }
}

/** For each notation × T × p, parse(format(v)) must not decrease along `sorted`. */
function checkMonotone(sorted: readonly Num[], precisions: readonly number[]): void {
  const combos = NOTATIONS.flatMap((notation) =>
    THRESHOLDS.flatMap((intThreshold) =>
      precisions.map((precision) => ({ notation, intThreshold, precision })),
    ),
  );
  const prev: ({ s: string; d: Num } | null)[] = combos.map(() => null);
  const failures: string[] = [];
  // Values in the outer loop, so each value's ↑↑ height is computed once (format.ts memo).
  for (const v of sorted) {
    combos.forEach((o, i) => {
      const s = fmt(v, o);
      const d = parseAs(s, o.notation, o.precision);
      const p = prev[i];
      if (p && d.lt(p.d)) {
        const name = NOTATION_NAMES[o.notation];
        failures.push(`${name} T=${o.intThreshold} p=${o.precision}: ${p.s} > ${s}`);
      }
      prev[i] = { s, d };
    });
  }
  expect(failures.slice(0, 20)).toEqual([]);
}

/** Values just around every boundary of the notation (GDD §4.2). */
function boundaryLadder(): Num[] {
  const out: Num[] = [];
  const rel = [-1e-3, -2.5e-4, -2.2e-4, -1e-4, -1e-5, -1e-9, -1e-12, 0, 1e-12, 1e-9, 1e-5, 1e-3];
  const near = (x: Num) => {
    for (const r of rel) out.push(x.mul(1 + r));
  };
  // Mantissa carries at p = 0…4 happen at 9.5, 9.95, 9.995, 9.9995 and 9.99995.
  const carries = [9.4, 9.5, 9.6, 9.94, 9.95, 9.96, 9.994, 9.995, 9.996, 9.9994, 9.9995, 9.9996];
  const ladder = (layer: number, e: number) => {
    for (const d of [-1, -1e-3, -1e-5, -1e-7, -1e-9, 0, 1e-9, 1e-7, 1e-5, 1e-3, 1]) {
      out.push(fromComponents(1, layer, e + d));
    }
    for (const m of carries) out.push(fromComponents(1, layer, e - 1 + Math.log10(m)));
  };
  for (const x of [1e-3, 1e3, 1e6, 1e9, 999.5, 99.95, 9.995, 1, 0.1]) near(num(x));
  for (const e of [-1e6, -10_000, -306, 306, 10_000, 1e6, 1e6 + 1]) ladder(1, e);
  for (const e of [1e6, 10_000, -1e6]) ladder(2, e);
  for (const e of [1e6, -1e6]) ladder(3, e);
  for (const h of [4.85, 4.86, 5, 999_999.99, 1e6, 1e6 + 1]) out.push(tetrate10(h));
  for (const x of [...out]) if (x.gt(0)) out.push(x.mul(1 + 1e-12), x.mul(1 - 1e-12));
  return out.filter((x) => x.sign > 0).sort((a, b) => a.cmp(b));
}

// ---------------------------------------------------------------------------------------------
// Locale independence
// ---------------------------------------------------------------------------------------------

describe('locale independence', () => {
  const source = readFileSync(join(REPO_ROOT, 'src', 'engine', 'format.ts'), 'utf8');

  it('format.ts never references Intl or toLocale*', () => {
    // Comments may say so; code and strings may not.
    const code = stripComments(source);
    expect(code).not.toMatch(/\bIntl\b/);
    expect(code).not.toMatch(/toLocale/);
  });

  it('format.ts has no letter-only string literals of 2+ letters', () => {
    // Stricter than the M3 lint: no literal outside an import specifier contains two
    // consecutive letters, so every word must come from the tables parameter.
    const specifiers = new Set(importSpecifiers(source).map((r) => r.start));
    const words = stringLiterals(source).filter(
      (s) => !specifiers.has(s.start) && /\p{L}{2,}/u.test(s.value),
    );
    expect(words.map((w) => `${w.line}: ${w.value}`)).toEqual([]);
  });

  it('formats the same digits whatever the default locale', () => {
    expect(fmt(1234567)).toBe('1.23e6');
    expect(fmt(999999)).toBe('999,999');
    expect(fmt(999999999, { intThreshold: 1e9 })).toBe('999,999,999');
    expect(fmt(TOWER1, { notation: LOGARITHM })).toBe('e19,728.30');
  });

  it.runIf(process.env.ISI_EXPECT_LOCALE === 'de')(
    'the de_DE run really uses a German locale',
    () => {
      expect((1234.5).toLocaleString()).toBe('1.234,5');
    },
  );
});
