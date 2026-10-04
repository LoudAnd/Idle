// @vitest-environment node
// GDD §17.4: time-to-afford text: `≈ 12s`, `≈ 3.40m`, `≈ 2.10h`, `≈ 1,234d`, `—`. The unit is
// chosen after rounding, so a value never shows as 60 of its unit (or 24 hours).
import { describe, expect, it } from 'vitest';
import { NOTATION } from '../../src/engine/format.ts';
import { formatEta } from '../../src/ui/duration.ts';
import { fmt } from '../../src/ui/fmt.ts';

const f = (v: number) => fmt.format(v);

describe('formatEta (GDD §17.4)', () => {
  it.each([
    [null, '—'],
    [0, '≈ 1s'], // never shown: an affordable button shows ✓
    [0.2, '≈ 1s'],
    [11.2, '≈ 12s'],
    [58.9, '≈ 59s'],
    [59.2, '≈ 1m'], // rounds up to 60 s, which is 1 m
    [59.5, '≈ 1m'],
    [60, '≈ 1m'],
    [204, '≈ 3.40m'],
    [3596, '≈ 59.9m'],
    [3599, '≈ 1.00h'], // 59.98 m would show as 60.0 m
    [3600, '≈ 1h'],
    [7560, '≈ 2.10h'],
    [86_219, '≈ 23.9h'],
    [86_399, '≈ 1.00d'], // 23.9997 h would show as 24.0 h
    [86_400, '≈ 1d'],
    [1234.5 * 86_400, '≈ 1,234d'],
    [1e300, '≈ 1.16e295d'],
  ])('%s s → %s', (s, want) => {
    expect(formatEta(s, f)).toBe(want);
  });

  it('invalid input is —, never NaN or Infinity', () => {
    for (const v of [Number.NaN, Number.POSITIVE_INFINITY, -1]) expect(formatEta(v, f)).toBe('—');
  });

  it('numbers follow the formatter (notation and precision settings)', () => {
    const eng = (v: number) => fmt.format(v, { notation: NOTATION.ENGINEERING, precision: 0 });
    expect(formatEta(204, eng)).toBe('≈ 3m');
    expect(formatEta(1e20, eng)).toBe('≈ 1e15d');
  });

  it('the rollover follows the precision: what the formatter would show decides the unit', () => {
    const p = (precision: number) => (v: number) => fmt.format(v, { precision });
    // 3599 s = 59.983 m: "60" at precision 0 and "60.0" at 2 roll over; "59.983" at 4 does not.
    expect(formatEta(3599, p(0))).toBe('≈ 1h');
    expect(formatEta(3599, p(4))).toBe('≈ 59.983m');
    expect(formatEta(3570, p(0))).toBe('≈ 1h'); // 59.5 m shows as 60 at precision 0
    expect(formatEta(3540, p(0))).toBe('≈ 59m');
    expect(formatEta(86_390, p(4))).toBe('≈ 23.997h');
    expect(formatEta(86_399, p(4))).toBe('≈ 0.99999d'); // 23.99972 h shows as 24.000 h
  });
});
