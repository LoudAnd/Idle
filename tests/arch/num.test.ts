// @vitest-environment node
// GDD §2 and §4.1: only src/engine/num.ts touches break_eternity.js; nothing else calls a raw
// log method on a Num (.log10(), .log2(), .ln(), .log(b), …); and the bench-only op counter is
// never installed by production code.
import { describe, expect, it } from 'vitest';
import {
  describeViolations,
  loadFixture,
  loadSources,
  scanBreakEternityImports,
  scanOpCounter,
  scanRawLogs,
} from './lib/scan.ts';

const src = loadSources('src');
const AT = 'src/ui/x.ts';

describe('the scan is not empty', () => {
  it('sees src/engine/num.ts, src/engine/format.ts and at least 5 files under src', () => {
    const paths = src.map((f) => f.path);
    expect(paths).toContain('src/engine/num.ts');
    expect(paths).toContain('src/engine/format.ts');
    expect(paths.length).toBeGreaterThanOrEqual(5);
  });
});

describe('break_eternity.js imports', () => {
  it('only num.ts imports break_eternity.js', () => {
    const vs = scanBreakEternityImports(src);
    expect(vs, describeViolations(vs)).toEqual([]);
    // ... and num.ts really does (the rule is not vacuous).
    const num = src.find((f) => f.path === 'src/engine/num.ts')!;
    expect(scanBreakEternityImports([{ ...num, path: AT }])).toHaveLength(1);
  });

  it.each([
    'num/import.ts',
    'num/import-type.ts',
    'num/dynamic-import.ts',
    'num/require-subpath.ts',
    'engine/library-import.ts',
  ])('flags %s as num-library-import', (fixture) => {
    const vs = scanBreakEternityImports([loadFixture(fixture, AT)]);
    expect(vs.map((v) => v.rule)).toEqual(['num-library-import']);
  });

  it('does not flag num/allowed.ts', () => {
    expect(scanBreakEternityImports([loadFixture('num/allowed.ts', AT)])).toEqual([]);
  });
});

describe('raw logs', () => {
  it('no raw Num log outside num.ts', () => {
    const vs = scanRawLogs(src);
    expect(vs, describeViolations(vs)).toEqual([]);
  });

  it.each(['num/raw-log10.ts', 'num/raw-log2.ts'])('flags %s as num-raw-log', (fixture) => {
    const vs = scanRawLogs([loadFixture(fixture, AT)]);
    expect(vs.map((v) => v.rule)).toEqual(['num-raw-log']);
  });

  it('flags every further log method, optional call and bracketed name in num/raw-log-misc.ts', () => {
    const vs = scanRawLogs([loadFixture('num/raw-log-misc.ts', AT)]);
    expect(vs.every((v) => v.rule === 'num-raw-log')).toBe(true);
    expect([...new Set(vs.map((v) => v.line))].sort((a, b) => a - b)).toEqual([
      6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    ]);
  });

  it('flags a raw log in another engine module too', () => {
    const vs = scanRawLogs([loadFixture('num/raw-log10.ts', 'src/engine/format.ts')]);
    expect(vs).toHaveLength(1);
  });

  it('does not flag num/allowed.ts (helpers, Math and console logs of doubles, comments, strings)', () => {
    const vs = scanRawLogs([loadFixture('num/allowed.ts', AT)]);
    expect(vs, describeViolations(vs)).toEqual([]);
  });
});

describe('op counter', () => {
  it('nothing in src installs the op counter', () => {
    const vs = scanOpCounter(src);
    expect(vs, describeViolations(vs)).toEqual([]);
  });

  it('flags num/op-counter.ts as num-op-counter', () => {
    const vs = scanOpCounter([loadFixture('num/op-counter.ts', AT)]);
    expect(vs.map((v) => v.rule)).toContain('num-op-counter');
  });

  it('does not flag num/allowed.ts', () => {
    expect(scanOpCounter([loadFixture('num/allowed.ts', AT)])).toEqual([]);
  });
});
