// @vitest-environment node
// GDD §16.5, §21.7, ROADMAP M3: a production build emits exactly the four JetBrains Mono woff2
// files (byte-identical to the package's, about 52 KB together) and no other font format, and
// its JavaScript is at most 120 KB gzip. The build runs in a child process into a temporary
// directory, so it never touches dist/ (which the playtests serve).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../arch/lib/scan.ts';

const FONT_FILES = [
  'jetbrains-mono-greek-400-normal',
  'jetbrains-mono-greek-500-normal',
  'jetbrains-mono-latin-400-normal',
  'jetbrains-mono-latin-500-normal',
];
const JS_BUDGET = 120 * 1024;

let out = '';
let files: string[] = [];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const sha256 = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');

beforeAll(() => {
  out = mkdtempSync(join(tmpdir(), 'isi-build-'));
  execFileSync(
    process.execPath,
    [
      join(REPO_ROOT, 'node_modules', 'vite', 'bin', 'vite.js'),
      'build',
      '--outDir',
      out,
      '--emptyOutDir',
    ],
    { cwd: REPO_ROOT, stdio: 'pipe', timeout: 180_000 },
  );
  files = walk(out).map((p) => relative(out, p).split('\\').join('/'));
}, 180_000);

afterAll(() => {
  if (out) rmSync(out, { recursive: true, force: true });
});

describe('the production build', () => {
  it('the build emits exactly the four JetBrains Mono woff2 files', () => {
    const woff2 = files.filter((f) => f.endsWith('.woff2'));
    // Vite names them <name>-<hash>.woff2.
    expect(
      woff2.map((f) => f.replace(/^.*\//, '').replace(/-[\w-]{8}\.woff2$/, '')).sort(),
    ).toEqual(FONT_FILES);
    expect(files.filter((f) => /\.(woff|ttf|otf|eot)$/.test(f))).toEqual([]);
    let total = 0;
    for (const f of woff2) {
      const name = FONT_FILES.find((n) => f.includes(n))!;
      const source = join(
        REPO_ROOT,
        'node_modules',
        '@fontsource',
        'jetbrains-mono',
        'files',
        `${name}.woff2`,
      );
      expect(sha256(join(out, f)), f).toBe(sha256(source));
      total += statSync(join(out, f)).size;
    }
    expect(total).toBeGreaterThanOrEqual(50_000);
    expect(total).toBeLessThanOrEqual(54_000);
    // ... and the CSS references them (none was inlined as a data: URI).
    const css = files
      .filter((f) => f.endsWith('.css'))
      .map((f) => readFileSync(join(out, f), 'utf8'))
      .join('\n');
    expect(css).not.toMatch(/data:font/);
    expect((css.match(/@font-face/g) ?? []).length).toBe(4);
  });

  it('JS is at most 120 KB gzip', () => {
    const js = files.filter((f) => f.endsWith('.js'));
    expect(js.length).toBeGreaterThan(0);
    const gz = js.reduce((n, f) => n + gzipSync(readFileSync(join(out, f))).length, 0);
    console.log(`JS: ${js.length} file(s), ${gz} B gzip`);
    expect(gz).toBeLessThanOrEqual(JS_BUDGET);
  });

  it('ships the licence notices, including the font’s OFL', () => {
    expect(files).toEqual(
      expect.arrayContaining([
        'LICENSES/OFL-1.1.txt',
        'LICENSES/MIT-preact.txt',
        'LICENSES/MIT-break_eternity.txt',
      ]),
    );
  });
});
