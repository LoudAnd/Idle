// @vitest-environment node
// GDD §16.5, §21.7, ROADMAP M3: a production build emits exactly the four JetBrains Mono woff2
// files (byte-identical to the package's, about 52 KB together) and no other font format, and
// its JavaScript is at most 120 KB gzip. GDD §21.9, ROADMAP M4: the production build holds no
// dev-hook marker and no dev fixture in any file (sourcemaps included), while a playtest build
// (`--mode playtest`, `.env.playtest`) does, so the check is not vacuous. The builds run in a
// child process into temporary directories, so they never touch dist/ (which the playtests
// serve).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../arch/lib/scan.ts';
import { DEV_HOOK_MARKER } from '../../src/platform/devhooks.ts';

const FONT_FILES = [
  'jetbrains-mono-greek-400-normal',
  'jetbrains-mono-greek-500-normal',
  'jetbrains-mono-latin-400-normal',
  'jetbrains-mono-latin-500-normal',
];
const JS_BUDGET = 120 * 1024;

let out = '';
let files: string[] = [];
let playtestOut = '';
let playtestFiles: string[] = [];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const sha256 = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');

function build(dir: string, extra: readonly string[] = []): string[] {
  execFileSync(
    process.execPath,
    [
      join(REPO_ROOT, 'node_modules', 'vite', 'bin', 'vite.js'),
      'build',
      ...extra,
      '--outDir',
      dir,
      '--emptyOutDir',
    ],
    // NODE_ENV is `test` under vitest, which would make the build a development one
    // (import.meta.env.DEV true); `npm run build` runs with it unset, which Vite treats as this.
    {
      cwd: REPO_ROOT,
      stdio: 'pipe',
      timeout: 180_000,
      env: { ...process.env, NODE_ENV: 'production' },
    },
  );
  return walk(dir).map((p) => relative(dir, p).split('\\').join('/'));
}

beforeAll(() => {
  out = mkdtempSync(join(tmpdir(), 'isi-build-'));
  files = build(out);
  playtestOut = mkdtempSync(join(tmpdir(), 'isi-build-playtest-'));
  playtestFiles = build(playtestOut, ['--mode', 'playtest']);
}, 360_000);

afterAll(() => {
  if (out) rmSync(out, { recursive: true, force: true });
  if (playtestOut) rmSync(playtestOut, { recursive: true, force: true });
});

const DEV_FIXTURES = join(REPO_ROOT, 'tests', 'fixtures', 'dev');

/** Distinctive pieces of every dev fixture: its JSON's state part, raw and as a JS string. */
function fixturePieces(): string[] {
  return readdirSync(DEV_FIXTURES)
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => {
      const text = readFileSync(join(DEV_FIXTURES, f), 'utf8').trim();
      const state = text.slice(text.indexOf('"state"'));
      return [state, JSON.stringify(state).slice(1, -1)];
    });
}

/** Every file of a build that holds `needle` (text files: js, css, html, map, txt, json). */
function holding(dir: string, list: readonly string[], needle: string): string[] {
  return list
    .filter((f) => /\.(js|css|html|map|txt|json|svg)$/.test(f))
    .filter((f) => readFileSync(join(dir, f), 'utf8').includes(needle));
}

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

describe('the dev hooks (GDD §21.9)', () => {
  it('the production build contains no dev-hook marker or dev fixture, sourcemaps included', () => {
    expect(files.some((f) => f.endsWith('.map'))).toBe(true);
    expect(holding(out, files, DEV_HOOK_MARKER)).toEqual([]);
    expect(holding(out, files, 'tests/fixtures/dev')).toEqual([]);
    for (const piece of fixturePieces()) expect(holding(out, files, piece)).toEqual([]);
    expect(files.filter((f) => /devhooks|late-sum|pre-product|mid-sum|new-game/.test(f))).toEqual(
      [],
    );
  });

  it('the playtest build contains the marker and the fixtures', () => {
    expect(holding(playtestOut, playtestFiles, DEV_HOOK_MARKER).length).toBeGreaterThan(0);
    const pieces = fixturePieces();
    expect(pieces.length).toBe(8);
    // Each fixture is in the build, raw or escaped as a JavaScript string.
    for (let i = 0; i < pieces.length; i += 2) {
      const found = [pieces[i]!, pieces[i + 1]!].flatMap((p) =>
        holding(playtestOut, playtestFiles, p),
      );
      expect(found.length, pieces[i]!.slice(0, 40)).toBeGreaterThan(0);
    }
  });
});
