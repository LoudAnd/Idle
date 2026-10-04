// @vitest-environment node
// GDD §16.5 and docs/SOURCES.md: every bundled runtime dependency ships its licence verbatim in
// public/LICENSES/ (copied into dist/) from the first build that bundles it. Libraries are MIT
// (`MIT-<name>.txt`); the font is OFL-1.1 (`OFL-1.1.txt`, from M3). Any other licence fails.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './lib/scan.ts';

const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>;
};
const runtime = Object.keys(pkg.dependencies).sort();

/** The shipped notice of a dependency with this licence, or `null` for a licence not allowed. */
function noticePath(name: string, license: string): string | null {
  const dir = join(REPO_ROOT, 'public', 'LICENSES');
  if (license === 'MIT') return join(dir, `MIT-${name.replace(/\.js$/, '')}.txt`);
  // OFL-1.1 is allowed for fonts only: the one font package's LICENSE ships as OFL-1.1.txt.
  if (license === 'OFL-1.1' && name.startsWith('@fontsource/')) return join(dir, 'OFL-1.1.txt');
  return null;
}

describe('runtime dependency notices', () => {
  it('covers JetBrains Mono, break_eternity.js and Preact', () => {
    expect(runtime).toEqual(['@fontsource/jetbrains-mono', 'break_eternity.js', 'preact']);
  });

  it.each(runtime)(
    '%s is MIT or OFL-1.1 and its LICENSE ships verbatim in public/LICENSES/',
    (name) => {
      const dir = join(REPO_ROOT, 'node_modules', name);
      const meta = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
        license: string;
      };
      const notice = noticePath(name, meta.license);
      expect(notice, `${name}: licence ${meta.license} is not allowed`).not.toBeNull();
      expect(existsSync(notice!), notice!).toBe(true);
      expect(readFileSync(notice!, 'utf8')).toBe(readFileSync(join(dir, 'LICENSE'), 'utf8'));
    },
  );

  it('any other licence is refused', () => {
    expect(noticePath('left-pad', 'WTFPL')).toBeNull();
    expect(noticePath('some-lib', 'OFL-1.1')).toBeNull(); // OFL only for fonts
    expect(noticePath('@fontsource/x', 'GPL-3.0')).toBeNull();
  });
});
