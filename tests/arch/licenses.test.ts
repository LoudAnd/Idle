// @vitest-environment node
// GDD §16.5 and docs/SOURCES.md: every bundled runtime library is MIT, and its licence notice
// ships verbatim in public/LICENSES/ (copied into dist/) from the first build that bundles it.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './lib/scan.ts';

const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>;
};
const runtime = Object.keys(pkg.dependencies).sort();

/** public/LICENSES/MIT-<name>.txt, with a trailing `.js` dropped from the package name. */
const noticePath = (name: string) =>
  join(REPO_ROOT, 'public', 'LICENSES', `MIT-${name.replace(/\.js$/, '')}.txt`);

describe('runtime library notices', () => {
  it('covers Preact and break_eternity.js', () => {
    expect(runtime).toEqual(['break_eternity.js', 'preact']);
  });

  it.each(runtime)('%s is MIT and its LICENSE ships verbatim in public/LICENSES/', (name) => {
    const dir = join(REPO_ROOT, 'node_modules', name);
    const meta = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
      license: string;
    };
    expect(meta.license).toBe('MIT');
    expect(existsSync(noticePath(name)), noticePath(name)).toBe(true);
    expect(readFileSync(noticePath(name), 'utf8')).toBe(readFileSync(join(dir, 'LICENSE'), 'utf8'));
  });
});
