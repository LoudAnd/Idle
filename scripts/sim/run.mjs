#!/usr/bin/env node
// The bot pacing simulation (GDD §22.6): runs the greedy bot of src/sim/bot.ts and writes its
// event timeline to <out>/report.json and <out>/report.md (sim-output/ is gitignored), then
// prints the Markdown timeline. src/sim and src/engine are imported directly through Node's
// type stripping (GDD §21.6).
//
// Usage: npm run sim [-- --profile active|idle] [--minutes N] [--seed N] [--out dir]
//   --profile  the bot profile (default active)
//   --minutes  simulated minutes (default 30)
//   --seed     the bot seed; seeds vary the bot's reaction delays (default 1)
//   --out      the output directory (default sim-output)
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PROFILES, runBot } from '../../src/sim/bot.ts';
import { buildReport, reportMarkdown } from '../../src/sim/report.ts';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}

const profile = arg('profile', 'active');
const minutes = Number(arg('minutes', '30'));
const seed = Number(arg('seed', '1'));
const outDir = resolve(arg('out', 'sim-output'));

if (!PROFILES.includes(profile)) {
  console.error(`--profile must be one of ${PROFILES.join(', ')}, got ${profile}`);
  process.exit(2);
}
if (!(minutes > 0) || !Number.isFinite(minutes)) {
  console.error(`--minutes must be a positive number, got ${arg('minutes', '')}`);
  process.exit(2);
}
if (!Number.isInteger(seed)) {
  console.error(`--seed must be an integer, got ${arg('seed', '')}`);
  process.exit(2);
}

const run = runBot({ profile, seed, seconds: Math.round(minutes * 60) });
const report = buildReport(run);
const markdown = reportMarkdown(report);
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
writeFileSync(resolve(outDir, 'report.md'), markdown);
process.stdout.write(markdown);
console.log(`\nwrote ${resolve(outDir, 'report.json')} and report.md`);
