// @vitest-environment node
// GDD §16.5: src/ui/fonts.css declares exactly four @font-face rules (JetBrains Mono, Latin and
// Greek at 400 and 500, woff2 only, font-display: swap), each with the unicode-range of the
// package's unicode.json; the package is pinned at exactly 5.3.0. (The build test checks that
// exactly these four files ship.)
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './lib/scan.ts';

const CSS = readFileSync(join(REPO_ROOT, 'src', 'ui', 'fonts.css'), 'utf8');
const PKG_DIR = join(REPO_ROOT, 'node_modules', '@fontsource', 'jetbrains-mono');
const UNICODE = JSON.parse(readFileSync(join(PKG_DIR, 'unicode.json'), 'utf8')) as Record<
  string,
  string
>;

/** A unicode-range in a comparable form: split on commas, trimmed, uppercased. */
const normalize = (r: string) =>
  r
    .split(',')
    .map((p) => p.trim().toUpperCase())
    .filter((p) => p.length > 0);

interface FontFace {
  readonly [prop: string]: string;
}

function fontFaces(css: string): FontFace[] {
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...noComments.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => {
    const props: Record<string, string> = {};
    for (const decl of m[1]!.split(';')) {
      const i = decl.indexOf(':');
      if (i < 0) continue;
      props[decl.slice(0, i).trim()] = decl
        .slice(i + 1)
        .replace(/\s+/g, ' ')
        .trim();
    }
    return props;
  });
}

const faces = fontFaces(CSS);

describe('fonts.css (GDD §16.5)', () => {
  it('fonts.css has 4 @font-face rules whose unicode-range equals unicode.json', () => {
    expect(faces).toHaveLength(4);
    const seen = new Set<string>();
    for (const f of faces) {
      expect(f['font-family']).toBe("'JetBrains Mono'");
      expect(f['font-style']).toBe('normal');
      expect(f['font-display']).toBe('swap');
      const m =
        /^url\('@fontsource\/jetbrains-mono\/files\/jetbrains-mono-(latin|greek)-(400|500)-normal\.woff2'\) format\('woff2'\)$/.exec(
          f.src ?? '',
        );
      expect(m, f.src).not.toBeNull();
      const [, subset, weight] = m!;
      expect(f['font-weight']).toBe(weight);
      expect(normalize(f['unicode-range'] ?? '')).toEqual(normalize(UNICODE[subset!]!));
      expect(
        existsSync(join(PKG_DIR, 'files', `jetbrains-mono-${subset}-${weight}-normal.woff2`)),
      ).toBe(true);
      seen.add(`${subset}-${weight}`);
    }
    expect([...seen].sort()).toEqual(['greek-400', 'greek-500', 'latin-400', 'latin-500']);
  });

  it('only woff2, and nothing imports the package’s own CSS', () => {
    expect(CSS).not.toMatch(/\.woff['"]|\.ttf|\.otf|format\('woff'\)/);
    expect(CSS).not.toMatch(/@import/);
  });

  it('package.json pins @fontsource/jetbrains-mono at exactly 5.3.0', () => {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies['@fontsource/jetbrains-mono']).toBe('5.3.0');
    const installed = JSON.parse(readFileSync(join(PKG_DIR, 'package.json'), 'utf8')) as {
      version: string;
    };
    expect(installed.version).toBe('5.3.0');
  });
});
