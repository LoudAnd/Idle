// @vitest-environment node
// GDD §2 "Enforcement": the string lint. strings.ts entries are at most 32 characters and no
// sentence; src/**/*.tsx has no JSX text literal and no literal with 2 or more letters in any
// attribute or prop that is not on the short non-text list (also inside object literals and
// spread objects); the UI code holds no two-word literal outside strings.ts and legal.ts; every
// content `label:` is a strings.ts key; format.ts holds no words; fill() never takes a literal
// template. Each rule is proven against a planted fixture. legal.ts entries are at most 200
// characters, of a declared kind, and either quoted verbatim from a licence file in
// public/LICENSES/ or exactly a notice line the GDD fixes in §16.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SUM_EFFECTS } from '../../src/engine/content/sum.ts';
import { LEGAL } from '../../src/ui/legal.ts';
import { NOTATION_TABLES, STRINGS, isStringKey } from '../../src/ui/strings.ts';
import { REPO_ROOT, describeViolations, loadFixture, loadSources } from './lib/scan.ts';
import type { SourceFile, Violation } from './lib/scan.ts';
import {
  MAX_ENTRY_LENGTH,
  SENTENCE,
  TEXT_ATTRIBUTES,
  checkEntries,
  checkLegal,
  codePoints,
  gddSection16,
  scanContentLabels,
  scanFormatLetters,
  scanJsxStrings,
  scanTemplateArgs,
  scanUiWords,
  stringLeaves,
} from './lib/strings.ts';
import type { LegalEntry } from './lib/strings.ts';

const src = loadSources('src');

/** Every rule over a set of files. */
function scanAll(files: readonly SourceFile[]): Violation[] {
  return [
    ...scanJsxStrings(files),
    ...scanUiWords(files),
    ...scanContentLabels(files, isStringKey),
    ...scanFormatLetters(files),
    ...scanTemplateArgs(files),
  ];
}

/** A fixture module's STRINGS table (fixtures are plain TS modules, loaded as code). */
async function fixtureStrings(name: string): Promise<Record<string, string>> {
  const url = pathToFileURL(join(REPO_ROOT, 'tests', 'arch', 'fixtures', name)).href;
  const mod = (await import(url)) as { STRINGS: Record<string, string> };
  return mod.STRINGS;
}

const rules = (vs: readonly Violation[]) => vs.map((v) => v.rule);

describe('the string lint on src/ (GDD §2)', () => {
  it('src/ passes every string rule', () => {
    const entries = [
      ...checkEntries(stringLeaves(STRINGS, 'STRINGS'), 'src/ui/strings.ts'),
      ...checkEntries(stringLeaves(NOTATION_TABLES, 'NOTATION_TABLES'), 'src/ui/strings.ts'),
    ];
    const vs = [...entries, ...scanAll(src)];
    expect(vs, describeViolations(vs)).toEqual([]);
  });

  it('the scans are not vacuous: they read every .tsx, the content tables and format.ts', () => {
    const tsx = src.filter((f) => f.path.endsWith('.tsx')).map((f) => f.path);
    expect(tsx).toContain('src/main.tsx');
    expect(tsx).toContain('src/ui/sum/GeneratorRow.tsx');
    expect(tsx.length).toBeGreaterThanOrEqual(10);
    expect(src.some((f) => f.path === 'src/engine/content/sum.ts')).toBe(true);
    // The rules fire on real code moved to the wrong place: sum.ts's labels are keys, but its
    // numbers would not be; format.ts's literals are not words, but strings.ts's are.
    const strings = src.find((f) => f.path === 'src/ui/strings.ts')!;
    expect(
      scanFormatLetters([{ ...strings, path: 'src/engine/format.ts' }]).length,
    ).toBeGreaterThan(20);
    expect(stringLeaves(STRINGS, 'STRINGS').length).toBe(Object.keys(STRINGS).length);
  });

  it('content labels are strings.ts keys at runtime too (SUM_EFFECTS)', () => {
    for (const e of SUM_EFFECTS) expect(isStringKey(e.label), e.id).toBe(true);
  });

  it('a decimal template passes: ρ_k ×(1 − 0.03c) and Slot exponent ×(1 + 0.03c)', async () => {
    const table = await fixtureStrings('strings/decimal.ts');
    expect(Object.values(table)).toEqual(['ρ_k ×(1 − 0.03c)', 'Slot exponent ×(1 + 0.03c)']);
    expect(checkEntries(stringLeaves(table, 'STRINGS'), 'decimal.ts')).toEqual([]);
    // The second one has the shape of a sentence except for the trailing (\s|$).
    expect(/[a-z]{3,}\s[a-z]{3,}.*[.!?]/i.test(table['challenge.c1.reward']!)).toBe(true);
    expect(SENTENCE.test(table['challenge.c1.reward']!)).toBe(false);
  });
});

describe('planted fixtures (each rule fails on its plant)', () => {
  it('flags a 33-character entry (string-length)', async () => {
    const table = await fixtureStrings('strings/long-entry.ts');
    const text = Object.values(table)[0]!;
    expect(codePoints(text)).toBe(MAX_ENTRY_LENGTH + 1);
    expect(rules(checkEntries(stringLeaves(table, 'STRINGS'), 'long-entry.ts'))).toEqual([
      'string-length',
    ]);
    // A 32-character entry passes.
    const ok = { k: [...text].slice(0, MAX_ENTRY_LENGTH).join('') };
    expect(checkEntries(stringLeaves(ok, 'STRINGS'), 'x')).toEqual([]);
  });

  it('flags a sentence (string-sentence)', async () => {
    const table = await fixtureStrings('strings/sentence.ts');
    expect(rules(checkEntries(stringLeaves(table, 'STRINGS'), 'sentence.ts'))).toEqual([
      'string-sentence',
    ]);
  });

  it('flags JSX text literals, also as child expressions and in ?:, && and || branches and static templates (jsx-text)', () => {
    const vs = scanJsxStrings([loadFixture('strings/jsx-text.tsx', 'src/ui/x.tsx')]);
    expect(rules(vs)).toEqual(Array(6).fill('jsx-text'));
    expect(vs.map((v) => v.line)).toEqual([6, 7, 8, 9, 10, 11]);
    expect(vs.map((v) => v.text)).toEqual([
      'Buy now',
      'Buy now',
      'Ready',
      'Ready',
      'Fallback',
      'Buy now',
    ]);
  });

  it('flags a literal in every text attribute GDD §2 names, in component props, in object literals and in spread objects (jsx-attr)', () => {
    const vs = scanJsxStrings([loadFixture('strings/jsx-attr.tsx', 'src/ui/x.tsx')]);
    expect(rules(vs).every((r) => r === 'jsx-attr')).toBe(true);
    const flagged = vs.map((v) => v.text.slice(0, v.text.indexOf('=')));
    // One plant per named text attribute, in order …
    expect(flagged.slice(0, TEXT_ATTRIBUTES.size)).toEqual([...TEXT_ATTRIBUTES]);
    // … then component props (any name that is not a non-text attribute), a prop holding an
    // object literal, a spread object literal, a spread variable and a spread function's result.
    expect(vs.slice(TEXT_ATTRIBUTES.size).map((v) => v.text)).toEqual([
      'name=Quantum Forge',
      'description=Forged in a star',
      'description=Cold',
      'items=The Archive of Lost Sums',
      '...=Ancient tome of numbers',
      '...=Panel name',
      '...=Open panel',
      '...=Closed panel',
    ]);
  });

  it('a spread the lint cannot resolve to object literals fails closed (jsx-spread)', () => {
    const vs = scanJsxStrings([loadFixture('strings/jsx-spread.tsx', 'src/ui/x.tsx')]);
    expect(rules(vs)).toEqual(['jsx-spread']);
  });

  it('flags two-word literals in UI code, but not classes or diagnostics (ui-words)', () => {
    const vs = scanUiWords([loadFixture('strings/ui-words.ts', 'src/ui/x.ts')]);
    expect(vs.map((v) => v.text)).toEqual(['"Quantum Forge"', '" ancient sums"']);
    expect(rules(vs)).toEqual(['ui-words', 'ui-words']);
    // ... and only in the UI: engine code is covered by its own rules.
    expect(scanUiWords([loadFixture('strings/ui-words.ts', 'src/engine/x.ts')])).toEqual([]);
    expect(scanUiWords([loadFixture('strings/ui-words.ts', 'src/main.tsx')])).toHaveLength(2);
  });

  it('closes the routes the M3 review found: a component prop, a spread, an object prop and a module constant', () => {
    const f = loadFixture('strings/bypass.tsx', 'src/ui/x.tsx');
    const vs = [...scanJsxStrings([f]), ...scanUiWords([f])];
    expect(vs.map((v) => `${v.rule} ${v.text}`)).toEqual([
      'jsx-attr ...=Ancient tome of numbers',
      'jsx-attr name=Quantum Forge',
      'jsx-attr description=Forged in the heart of a dying star.',
      'jsx-attr items=The Archive of Lost Sums',
      'ui-words "Quantum Forge"',
      'ui-words "Ancient tome of numbers"',
      'ui-words "Quantum Forge"',
      'ui-words "Forged in the heart of a dying star."',
      'ui-words "The Archive of Lost Sums"',
    ]);
  });

  it('does not flag strings.ts lookups, ids, classes, data-*, role, non-text props, resolvable spreads, symbols or single letters', () => {
    const vs = scanJsxStrings([loadFixture('strings/jsx-allowed.tsx', 'src/ui/x.tsx')]);
    expect(vs, describeViolations(vs)).toEqual([]);
    const words = scanUiWords([loadFixture('strings/jsx-allowed.tsx', 'src/ui/x.tsx')]);
    expect(words, describeViolations(words)).toEqual([]);
  });

  it('flags a literal label: in src/engine/content that is not a key, and any non-literal label (content-label)', () => {
    const vs = scanContentLabels(
      [loadFixture('strings/content-label.ts', 'src/engine/content/x.ts')],
      isStringKey,
    );
    expect(rules(vs)).toEqual(['content-label', 'content-label', 'content-label', 'content-label']);
    expect(vs.map((v) => v.line)).toEqual([6, 8, 9, 10]); // literal, identifier, template, shorthand
    // ... and only there: the same file elsewhere is not a content table.
    expect(
      scanContentLabels([loadFixture('strings/content-label.ts', 'src/ui/x.ts')], isStringKey),
    ).toEqual([]);
  });

  it('flags letter literals in format.ts, but not e, symbols or the import (format-letters)', () => {
    const vs = scanFormatLetters([
      loadFixture('strings/format-letters.ts', 'src/engine/format.ts'),
    ]);
    expect(vs.map((v) => v.text)).toEqual(['"K"', '"Qa"']);
    expect(rules(vs)).toEqual(['format-letters', 'format-letters']);
  });

  it('flags a literal template passed to fill or fillParts (template-literal)', () => {
    const vs = scanTemplateArgs([loadFixture('strings/fill-literal.tsx', 'src/ui/x.tsx')]);
    expect(rules(vs)).toEqual(['template-literal', 'template-literal']);
    expect(vs.map((v) => v.line)).toEqual([5, 6]);
  });

  it('a file that does not parse is a violation of every AST rule (fail closed)', () => {
    const at = (p: string) => [loadFixture('strings/parse-error.tsx', p)];
    expect(rules(scanJsxStrings(at('src/ui/x.tsx')))).toEqual(['parse-error']);
    expect(rules(scanUiWords(at('src/ui/x.tsx')))).toEqual(['parse-error']);
    expect(rules(scanContentLabels(at('src/engine/content/x.tsx'), isStringKey))).toEqual([
      'parse-error',
    ]);
    expect(rules(scanTemplateArgs(at('src/ui/x.tsx')))).toEqual(['parse-error']);
  });
});

describe('legal.ts (GDD §2)', () => {
  const GDD = readFileSync(join(REPO_ROOT, 'docs', 'GAME_DESIGN.md'), 'utf8');
  const read = (p: string): string | null => {
    const abs = join(REPO_ROOT, p);
    return existsSync(abs) ? readFileSync(abs, 'utf8') : null;
  };
  const check = (notices: readonly LegalEntry[]) =>
    checkLegal(notices, read, gddSection16(GDD), 'src/ui/legal.ts');

  it('every notice is at most 200 characters, of a declared kind, and quoted from a licence file or fixed by the GDD', () => {
    expect(LEGAL.length).toBeGreaterThan(0);
    const vs = check(LEGAL);
    expect(vs, describeViolations(vs)).toEqual([]);
  });

  it('flags each planted breach: not verbatim, a source outside public/LICENSES, a licence without its file, an unfixed sourceless notice, an unknown kind, an over-long text', async () => {
    const url = pathToFileURL(join(REPO_ROOT, 'tests', 'arch', 'fixtures', 'strings', 'legal.ts'));
    const { LEGAL: planted } = (await import(url.href)) as { LEGAL: LegalEntry[] };
    expect(check(planted).map((v) => `${v.rule} ${v.text.slice(0, v.text.indexOf(':'))}`)).toEqual([
      'legal-verbatim a',
      'legal-source b',
      'legal-source c',
      'legal-fixed d',
      'legal-length e',
      'legal-kind e',
      'legal-verbatim e',
    ]);
    // The GDD's fixed lines include the ones later milestones need (§16.1, §16.2).
    const fixed = (text: string) => check([{ kind: 'nonAffiliation', subject: 'x', text }]);
    expect(fixed('Not affiliated with or endorsed by the OEIS Foundation.')).toEqual([]);
    expect(fixed('Data: OEIS {a} · © OEIS Foundation Inc. · CC BY-SA 4.0')).toEqual([]);
  });

  it('covers the font and every runtime library', () => {
    const subjects = new Set(LEGAL.map((n) => n.subject));
    expect([...subjects].sort()).toEqual([
      '@fontsource/jetbrains-mono',
      'break_eternity.js',
      'preact',
    ]);
  });
});
