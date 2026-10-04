// @vitest-environment node
// GDD §2, §16.5: every code point the game can show is in the shipped font subsets or in the
// fallback allowlist (≈ ≤ ≥ ∈ ⌊ ⌋ → ✓, which render with the system monospace font). That
// covers strings.ts, legal.ts, format.ts's literals, every string literal in src/ui/**, the JSX
// text of every src/**/*.tsx (a symbol written as JSX text passes the string lint, which needs 2
// letters, and is not a string literal) and every Appendix C template.
//
// "In the shipped subsets" means a real glyph: the code point is in a subset's unicode-range
// AND its woff2 cmap maps it to a glyph, at both shipped weights. The range alone is too weak:
// the Latin range declares 100 code points (≥ U+0020) without a glyph, the Greek range 58.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LEGAL } from '../../src/ui/legal.ts';
import { NOTATION_TABLES, STRINGS } from '../../src/ui/strings.ts';
import { parseAppendixC } from './lib/appendix.ts';
import { REPO_ROOT, loadFixture, loadSources, stringLiterals } from './lib/scan.ts';
import { jsxTexts, stringLeaves } from './lib/strings.ts';
import { cmapOf, unicodeRange } from './lib/woff2.ts';

const PKG = join(REPO_ROOT, 'node_modules', '@fontsource', 'jetbrains-mono');
const RANGES = JSON.parse(readFileSync(join(PKG, 'unicode.json'), 'utf8')) as Record<
  string,
  string
>;
const SUBSETS = ['latin', 'greek'] as const;
const WEIGHTS = [400, 500] as const;

/** The fallback allowlist of GDD §16.5. */
const ALLOWLIST: ReadonlySet<number> = new Set([...'≈≤≥∈⌊⌋→✓'].map((c) => c.codePointAt(0)!));

/** Code points with a glyph in one weight: (cmap(latin) ∩ range(latin)) ∪ (cmap(greek) ∩ range(greek)). */
function coveredAt(weight: number): Set<number> {
  const out = new Set<number>();
  for (const subset of SUBSETS) {
    const cmap = cmapOf(join(PKG, 'files', `jetbrains-mono-${subset}-${weight}-normal.woff2`));
    for (const cp of unicodeRange(RANGES[subset]!)) if (cmap.has(cp)) out.add(cp);
  }
  return out;
}

const [w400, w500] = WEIGHTS.map(coveredAt) as [Set<number>, Set<number>];
/** Covered at every shipped weight. */
const COVERED = new Set([...w400].filter((cp) => w500.has(cp)));

interface Text {
  readonly where: string;
  readonly text: string;
}

/** The code points of the texts that are neither covered nor allowlisted. */
function outside(texts: readonly Text[]): string[] {
  const out: string[] = [];
  for (const { where, text } of texts) {
    for (const ch of text) {
      const cp = ch.codePointAt(0)!;
      if (COVERED.has(cp) || ALLOWLIST.has(cp)) continue;
      out.push(`${where}: '${ch}' U+${cp.toString(16).toUpperCase().padStart(4, '0')}`);
    }
  }
  return out;
}

const leaves = (table: unknown, name: string): Text[] =>
  stringLeaves(table, name).map((l) => ({ where: l.path, text: l.value }));

const has = (ch: string) => COVERED.has(ch.codePointAt(0)!);

describe('glyph coverage (GDD §2, §16.5)', () => {
  it('the woff2 reader is not vacuous: digits, ×, ·, −, ↑, ↓, Σ, Λ, ε, β, λ, ρ, π have glyphs; ∑ and ≈ do not', () => {
    for (const ch of '0123456789×·−↑↓ΣΛΔΠεβλρδμπ') expect(has(ch), ch).toBe(true);
    expect(has('∑')).toBe(false); // U+2211, not U+03A3
    expect(has('≈')).toBe(false); // hence the allowlist
    expect(has('★')).toBe(false);
    // The ranges declare code points without a glyph, so the cmap check is stricter.
    const latinRange = unicodeRange(RANGES.latin!);
    const noGlyph = [...latinRange].filter((cp) => cp >= 0x20 && !COVERED.has(cp));
    expect(noGlyph.length).toBeGreaterThan(50);
    expect(COVERED.size).toBeGreaterThan(250);
  });

  it('every code point in strings.ts is in the shipped subsets or the allowlist', () => {
    const texts = [...leaves(STRINGS, 'STRINGS'), ...leaves(NOTATION_TABLES, 'NOTATION_TABLES')];
    expect(outside(texts)).toEqual([]);
  });

  it('... and in legal.ts, format.ts’s literals, every UI string literal, all JSX text and every Appendix C template', () => {
    const src = loadSources('src');
    const literals = (pred: (p: string) => boolean): Text[] =>
      src
        .filter((f) => pred(f.path))
        .flatMap((f) =>
          stringLiterals(f.source).map((l) => ({ where: `${f.path}:${l.line}`, text: l.value })),
        );
    const appendix = parseAppendixC(
      readFileSync(join(REPO_ROOT, 'docs', 'GAME_DESIGN.md'), 'utf8'),
    );
    const texts: Text[] = [
      ...LEGAL.map((n) => ({ where: `LEGAL ${n.subject}`, text: n.text })),
      ...literals((p) => p === 'src/engine/format.ts'),
      ...literals((p) => p.startsWith('src/ui/')),
      ...jsxTexts(src),
      ...[...appendix.templates].map(([id, t]) => ({ where: `Appendix C ${id}`, text: t })),
    ];
    expect(outside(texts)).toEqual([]);
    // format.ts's own symbols are among them.
    const format = literals((p) => p === 'src/engine/format.ts').map((t) => t.text);
    for (const s of ['−', '—', '10↑↑']) expect(format).toContain(s);
  });

  it('flags ★ and ∑ in glyphs/outside.ts; passes ≈ ✓ Σ in glyphs/allowed.ts', async () => {
    const load = async (name: string) =>
      (
        (await import(
          pathToFileURL(join(REPO_ROOT, 'tests', 'arch', 'fixtures', 'glyphs', name)).href
        )) as {
          STRINGS: Record<string, string>;
        }
      ).STRINGS;
    expect(outside(leaves(await load('outside.ts'), 'STRINGS'))).toEqual([
      "STRINGS.x.star: '★' U+2605",
      "STRINGS.x.sum: '∑' U+2211",
    ]);
    expect(outside(leaves(await load('allowed.ts'), 'STRINGS'))).toEqual([]);
  });

  it('flags ★ written as JSX text (glyphs/jsx-text.tsx), which no string literal holds', () => {
    const f = loadFixture('glyphs/jsx-text.tsx', 'src/ui/x.tsx');
    expect(stringLiterals(f.source).map((l) => l.value)).toEqual([]);
    expect(outside(jsxTexts([f]))).toEqual(["src/ui/x.tsx:5: '★' U+2605"]);
    // The scan reads every .tsx of src/, main.tsx included, and is not vacuous on the allowed
    // symbols (× is JSX text in the planted file too).
    expect(jsxTexts([f]).map((t) => t.text)).toEqual(['★', '×']);
    expect(jsxTexts([{ ...f, path: 'src/main.tsx' }])).toHaveLength(2);
  });
});
