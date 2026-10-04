// @vitest-environment node
// GDD §22.6: `npm run sim -- --profile active --minutes 30` runs the bot through Node's type
// stripping and writes the event timeline to sim-output/ (gitignored).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../arch/lib/scan.ts';

const out = mkdtempSync(join(tmpdir(), 'isi-sim-'));
afterAll(() => rmSync(out, { recursive: true, force: true }));

describe('npm run sim', () => {
  it('package.json runs scripts/sim/run.mjs, and sim-output/ is gitignored', () => {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.sim).toBe('node scripts/sim/run.mjs');
    const ignored = readFileSync(join(REPO_ROOT, '.gitignore'), 'utf8').split('\n');
    expect(ignored).toContain('sim-output/');
  });

  it(
    'writes report.json and report.md with the event timeline and prints it',
    { timeout: 60_000 },
    () => {
      const env = { ...process.env };
      delete env.NODE_OPTIONS;
      const stdout = execFileSync(
        process.execPath,
        ['scripts/sim/run.mjs', '--profile', 'active', '--minutes', '30', '--out', out],
        { cwd: REPO_ROOT, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      );
      const report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8')) as {
        profile: string;
        seed: number;
        minutes: number;
        events: { minutes: number; label: string }[];
      };
      expect(report.profile).toBe('active');
      expect(report.seed).toBe(1);
      expect(report.minutes).toBe(30);
      const labels = report.events.map((e) => e.label);
      for (const l of ['G1', 'G2', 'G5', 'G8', '2^128', '1e40']) expect(labels).toContain(l);
      const md = readFileSync(join(out, 'report.md'), 'utf8');
      expect(md).toContain('| Minutes | Event |');
      expect(md).toMatch(/\| \d+\.\d\d \| G8 \|/);
      expect(stdout).toContain(md.trim());
    },
  );

  it('rejects an unknown profile', { timeout: 30_000 }, () => {
    const env = { ...process.env };
    delete env.NODE_OPTIONS;
    expect(() =>
      execFileSync(process.execPath, ['scripts/sim/run.mjs', '--profile', 'nope', '--out', out], {
        cwd: REPO_ROOT,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    ).toThrow();
  });
});
