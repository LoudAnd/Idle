// @vitest-environment node
// GDD §2: no procedural or synthesized audio. Only sample playback of shipped CC0 files is
// allowed, so the APIs that synthesize sound or write samples are banned anywhere in src/.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AUDIO_BANNED,
  REPO_ROOT,
  describeViolations,
  listFiles,
  loadFixture,
  loadSources,
  scanAudio,
} from './lib/scan.ts';

const src = loadSources('src');
const AT = 'src/platform/audio.ts';

describe('the scan is not empty', () => {
  it('sees src/engine/num.ts, src/engine/format.ts and at least 5 files under src', () => {
    const paths = src.map((f) => f.path);
    expect(paths).toContain('src/engine/num.ts');
    expect(paths).toContain('src/engine/format.ts');
    expect(paths.length).toBeGreaterThanOrEqual(5);
  });
});

describe('synthesized audio', () => {
  it('src has no synthesized-audio API', () => {
    const vs = scanAudio(src);
    expect(vs, describeViolations(vs)).toEqual([]);
  });

  it.each([
    'audio/oscillator.ts',
    'audio/create-buffer.ts',
    'audio/new-audiobuffer.ts',
    'audio/copy-to-channel.ts',
    'audio/get-channel-data.ts',
  ])('flags %s as audio-synthesis', (fixture) => {
    const vs = scanAudio([loadFixture(fixture, AT)]);
    expect(vs.map((v) => v.rule)).toEqual(['audio-synthesis']);
  });

  it('flags every further API in audio/synth-misc.ts, including a bracketed name', () => {
    const vs = scanAudio([loadFixture('audio/synth-misc.ts', AT)]);
    expect(new Set(vs.map((v) => v.line)).size).toBe(8);
    for (const api of AUDIO_BANNED.slice(5).map((p) => p.replace(/\\b/g, ''))) {
      expect(
        vs.some((v) => v.text.includes(api)),
        `${api} not flagged`,
      ).toBe(true);
    }
    expect(vs.some((v) => v.text.includes("['createOscillator']"))).toBe(true);
  });

  it('applies everywhere in src, not only the platform layer', () => {
    expect(scanAudio([loadFixture('audio/oscillator.ts', 'src/engine/x.ts')])).toHaveLength(1);
    expect(scanAudio([loadFixture('audio/oscillator.ts', 'src/ui/x.tsx')])).toHaveLength(1);
  });

  it('does not flag audio/allowed.ts (playback of shipped files and fetched bytes, a comment)', () => {
    const vs = scanAudio([loadFixture('audio/allowed.ts', AT)]);
    expect(vs, describeViolations(vs)).toEqual([]);
  });

  it.each([
    ['audio/riffwave.ts', ['audio-built-bytes', 'audio-wav-header', 'audio-mime']],
    ['audio/data-uri.ts', ['audio-data-uri']],
    ['audio/decode-built.ts', ['audio-built-bytes', 'audio-wav-header']],
  ])(
    'flags %s (a WAV built in JavaScript and played through allowed playback)',
    (fixture, rules) => {
      const vs = scanAudio([loadFixture(fixture, AT)]);
      for (const r of rules)
        expect(
          vs.map((v) => v.rule),
          r,
        ).toContain(r);
    },
  );

  it('sees synthesis after regex literals that hold /* or // (tokenizer/regex-audio.ts)', () => {
    const vs = scanAudio([loadFixture('tokenizer/regex-audio.ts', AT)]);
    expect(vs.map((v) => [v.rule, v.line])).toEqual([
      ['audio-synthesis', 4],
      ['audio-synthesis', 5],
    ]);
  });

  it('fails closed on a file that ends inside a block comment', () => {
    const vs = scanAudio([loadFixture('tokenizer/unterminated.ts', AT)]);
    expect(vs.map((v) => v.rule)).toEqual(['scan-tokenizer']);
  });
});

describe('no shipped code outside src', () => {
  // The scans above read src/ only, so nothing else may ship script: public/ is copied into
  // dist verbatim, and index.html's scripts would bypass the bundle.
  it('public/ holds no scripts', () => {
    const scripts = listFiles(join(REPO_ROOT, 'public'), [
      '.js',
      '.mjs',
      '.cjs',
      '.ts',
      '.tsx',
      '.jsx',
      '.wasm',
      '.html',
    ]);
    expect(scripts).toEqual([]);
  });

  it('index.html has no inline script, and its only script is the bundled src entry', () => {
    const html = readFileSync(join(REPO_ROOT, 'index.html'), 'utf8');
    const tags = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
    expect(tags.map((t) => t[2]!.trim())).toEqual(tags.map(() => ''));
    const srcs = tags.map((t) => /\bsrc\s*=\s*["']([^"']+)["']/.exec(t[1]!)?.[1]);
    expect(srcs).toEqual(['/src/main.tsx']);
    expect(html).not.toMatch(/\son[a-z]+\s*=/i); // no inline event handlers either
  });
});
