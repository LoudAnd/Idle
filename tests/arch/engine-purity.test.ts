// @vitest-environment node
// GDD §2 and §21.1: src/engine is pure TypeScript with no DOM, clock, randomness, locale or
// platform access; its imports stay inside the engine and end in .ts (Node type stripping).
import { describe, expect, it } from 'vitest';
import {
  ENGINE_GLOBALS,
  REPO_ROOT,
  describeViolations,
  loadFixture,
  loadSources,
  scanEngineEnvironment,
  scanEngineImportExtensions,
  scanEngineImports,
  scanTokenizer,
} from './lib/scan.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The 1-based numbers of the lines of a fixture that hold code (not comments or blanks). */
function codeLines(fixture: string): number[] {
  const text = readFileSync(join(REPO_ROOT, 'tests', 'arch', 'fixtures', fixture), 'utf8');
  return text
    .split('\n')
    .flatMap((l, i) => (l.trim() === '' || l.trim().startsWith('//') ? [] : [i + 1]));
}

const src = loadSources('src');
const AT = 'src/engine/x.ts';

describe('the scan is not empty', () => {
  it('sees src/engine/num.ts, src/engine/format.ts and at least 5 files under src', () => {
    const paths = src.map((f) => f.path);
    expect(paths).toContain('src/engine/num.ts');
    expect(paths).toContain('src/engine/format.ts');
    expect(paths.length).toBeGreaterThanOrEqual(5);
  });
});

describe('engine environment', () => {
  it('src/engine has no environment access', () => {
    const vs = scanEngineEnvironment(src);
    expect(vs, describeViolations(vs)).toEqual([]);
  });

  it.each([
    ['engine/math-random.ts', 'engine-random'],
    ['engine/date.ts', 'engine-global'],
    ['engine/document.ts', 'engine-global'],
    ['engine/window.ts', 'engine-global'],
    ['engine/performance.ts', 'engine-global'],
  ])('flags %s as %s', (fixture, rule) => {
    const vs = scanEngineEnvironment([loadFixture(fixture, AT)]);
    expect(vs.map((v) => v.rule)).toContain(rule);
  });

  it('flags every further global and toLocaleString in engine/env-misc.ts', () => {
    const vs = scanEngineEnvironment([loadFixture('engine/env-misc.ts', AT)]);
    const extended = ENGINE_GLOBALS.filter(
      (g) => !['window', 'document', 'Date', 'performance'].includes(g),
    );
    for (const g of extended) {
      expect(
        vs.some((v) => v.rule === 'engine-global' && v.text.includes(g)),
        `${g} not flagged`,
      ).toBe(true);
    }
    expect(vs.map((v) => v.rule)).toContain('engine-locale');
    // One violation per line of the fixture, none missed.
    expect([...new Set(vs.map((v) => v.line))].sort((a, b) => a - b)).toEqual(
      codeLines('engine/env-misc.ts'),
    );
  });

  it('flags Math reached other than as Math.<name>, import.meta and Function in engine/math-alias.ts', () => {
    const vs = scanEngineEnvironment([loadFixture('engine/math-alias.ts', AT)]);
    expect([...new Set(vs.map((v) => v.line))].sort((a, b) => a - b)).toEqual([
      3, 4, 5, 6, 7, 8, 9,
    ]);
    const rules = new Set(vs.map((v) => v.rule));
    for (const r of ['engine-math-alias', 'engine-import-meta', 'engine-eval']) {
      expect(rules, r).toContain(r);
    }
  });

  it('flags window in a ternary, not only as a property base', () => {
    const vs = scanEngineEnvironment([loadFixture('engine/window.ts', AT)]);
    expect(vs.map((v) => v.line)).toEqual([2, 3]);
  });

  it('only checks src/engine', () => {
    const vs = scanEngineEnvironment([loadFixture('engine/window.ts', 'src/ui/x.ts')]);
    expect(vs).toEqual([]);
  });

  it('sees code after regex literals that hold /*, //, a quote or a backtick (tokenizer/regex-engine.ts)', () => {
    const vs = scanEngineEnvironment([loadFixture('tokenizer/regex-engine.ts', AT)]);
    expect(describeViolations(vs)).not.toContain('scan-tokenizer');
    expect([...new Set(vs.map((v) => v.line))].sort((a, b) => a - b)).toEqual([5, 7, 9, 10, 11]);
  });

  it('fails closed on a file that ends inside a block comment (tokenizer/unterminated.ts)', () => {
    const fixture = loadFixture('tokenizer/unterminated.ts', AT);
    expect(scanTokenizer([fixture]).map((v) => v.rule)).toEqual(['scan-tokenizer']);
    expect(scanEngineEnvironment([fixture]).map((v) => v.rule)).toContain('scan-tokenizer');
    expect(scanEngineImports([fixture]).map((v) => v.rule)).toContain('scan-tokenizer');
  });

  it('src tokenizes cleanly', () => {
    const vs = scanTokenizer(src);
    expect(vs, describeViolations(vs)).toEqual([]);
  });

  it('does not flag engine/allowed.ts (names, keys, comments, strings, regexes, divisions)', () => {
    const vs = scanEngineEnvironment([loadFixture('engine/allowed.ts', AT)]);
    expect(vs, describeViolations(vs)).toEqual([]);
  });
});

describe('engine type environment', () => {
  // GDD §21.1, §21.6: the engine runs under plain Node and in the browser, so it is also
  // typechecked without DOM or Node types; a missing global is then a compile error.
  it('npm run typecheck checks src/engine against tsconfig.engine.json (ES2023, no DOM, no types)', () => {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.typecheck).toContain('tsc --noEmit -p tsconfig.engine.json');
    expect(pkg.scripts.build).toContain('npm run typecheck');
    const cfg = JSON.parse(readFileSync(join(REPO_ROOT, 'tsconfig.engine.json'), 'utf8')) as {
      extends: string;
      include: string[];
      compilerOptions: { lib: string[]; types: string[] };
    };
    expect(cfg.extends).toBe('./tsconfig.json');
    expect(cfg.include).toContain('src/engine');
    expect(cfg.compilerOptions.lib.map((l) => l.toLowerCase())).toEqual(['es2023']);
    expect(cfg.compilerOptions.types).toEqual([]);
  });
});

describe('engine imports', () => {
  it('engine imports stay in the engine', () => {
    const vs = scanEngineImports(src);
    expect(vs, describeViolations(vs)).toEqual([]);
  });

  it.each([
    ['engine/ui-import.ts', 'engine-import-outside'],
    ['engine/preact-import.ts', 'engine-import-bare'],
    ['engine/node-builtin.ts', 'engine-import-bare'],
    ['engine/library-import.ts', 'engine-import-bare'],
  ])('flags %s as %s', (fixture, rule) => {
    const vs = scanEngineImports([loadFixture(fixture, AT)]);
    expect(vs.map((v) => v.rule)).toContain(rule);
  });

  it('allows break_eternity.js in src/engine/num.ts only', () => {
    const fixture = loadFixture('engine/library-import.ts', 'src/engine/num.ts');
    expect(scanEngineImports([fixture])).toEqual([]);
  });

  it('does not flag engine/imports/allowed.ts', () => {
    const vs = scanEngineImports([loadFixture('engine/imports/allowed.ts', 'src/engine/sub/x.ts')]);
    expect(vs, describeViolations(vs)).toEqual([]);
  });
});

describe('engine import extensions', () => {
  it('relative engine imports end in .ts', () => {
    const vs = scanEngineImportExtensions(src);
    expect(vs, describeViolations(vs)).toEqual([]);
  });

  it.each([
    'engine/imports/no-extension.ts',
    'engine/imports/js-extension.ts',
    'engine/imports/export-from.ts',
    'engine/imports/dynamic.ts',
  ])('flags %s as engine-import-extension', (fixture) => {
    const vs = scanEngineImportExtensions([loadFixture(fixture, AT)]);
    expect(vs.map((v) => v.rule)).toEqual(['engine-import-extension']);
  });

  it('does not flag engine/imports/allowed.ts', () => {
    const fixture = loadFixture('engine/imports/allowed.ts', 'src/engine/sub/x.ts');
    expect(scanEngineImportExtensions([fixture])).toEqual([]);
  });
});
