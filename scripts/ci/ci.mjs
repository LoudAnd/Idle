#!/usr/bin/env node
// Runs the CI pipeline of .github/workflows/ci.yml locally (GDD §23), in the same order:
//   npm ci → npm run check → npm run build → the format tests under LANG=de_DE.UTF-8
// It stops at the first failing step and exits non-zero, then prints a step summary.
//
// Usage: npm run ci [-- --skip-install]
//   --skip-install  skip `npm ci` (which otherwise deletes and reinstalls node_modules)
//
// PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD defaults to 1, so installing never downloads browsers.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const skipInstall = process.argv.includes('--skip-install');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const baseEnv = {
  ...process.env,
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD ?? '1',
};
const deEnv = { LANG: 'de_DE.UTF-8', LC_ALL: 'de_DE.UTF-8', ISI_EXPECT_LOCALE: 'de' };

const steps = [
  { name: 'npm ci', cmd: npm, args: ['ci'], skip: skipInstall },
  { name: 'npm run check', cmd: npm, args: ['run', 'check'] },
  { name: 'npm run build', cmd: npm, args: ['run', 'build'] },
  {
    name: 'format tests under de_DE',
    cmd: npx,
    args: ['vitest', 'run', 'tests/unit/format.test.ts'],
    env: deEnv,
  },
];

const summary = [];
let failed = false;
for (const step of steps) {
  if (failed) {
    summary.push([step.name, 'not run']);
    continue;
  }
  if (step.skip) {
    summary.push([step.name, 'skipped']);
    continue;
  }
  console.log(`\n=== ${step.name} ===`);
  const t0 = Date.now();
  const r = spawnSync(step.cmd, step.args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...baseEnv, ...step.env },
  });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const ok = r.status === 0;
  summary.push([step.name, ok ? `ok (${secs} s)` : `FAILED (exit ${r.status ?? r.signal})`]);
  if (!ok) failed = true;
}

console.log('\n=== ci summary ===');
for (const [name, result] of summary) console.log(`${name.padEnd(28)} ${result}`);
process.exit(failed ? 1 : 0);
