#!/usr/bin/env node
// Benchmark runner (GDD §21.7, §22.12). Timing budgets live here, never in `npm run check`.
//
// Usage: npm run bench [-- --guard <k>] [--filter <name>] [--json <file>]
//
// Loads every scripts/bench/*.bench.mjs. A bench module default-exports
//   { name, ops, budgetMs, setup(), run(state),
//     count?(state), expectedCount?, units?, unit?, maxCountPerUnit? }
// - `run` performs one run of `ops` operations (the unit of ops/s); each bench gets 3 warm-up
//   runs and 7 timed runs, and the report shows min / median / max, ops/s, the budget and the
//   guard.
// - `count(state)`, when present, does one extra (untimed) instrumented run and returns the
//   top-level `Num` operations it made (`installOpCounter`). The report shows the count per run
//   and per unit: a run covers `units` of `unit` (default 1 'run'), so an offline bench reports
//   Num operations per macro-step and a tick bench per tick (GDD §21.7, §22.12).
// - `expectedCount` makes the count a self-check (the M1 Num bench knows it makes exactly
//   100,000); `maxCountPerUnit` is a count budget (≤ 400 Num operations per tick).
// Exit codes: 1 when a median exceeds budgetMs × guard (CI's bench job passes --guard 3) or a
// count per unit exceeds maxCountPerUnit; 2 when the bench itself is broken (bad flags, no bench
// matched, a count different from expectedCount, or a malformed bench).
import { readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WARMUP = 3;
const RUNS = 7;

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}

const guard = Number(arg('guard', '1'));
const filter = arg('filter', '');
const jsonOut = arg('json', '');
if (!(guard > 0)) {
  console.error(`--guard must be a positive number, got ${arg('guard', '')}`);
  process.exit(2);
}

const here = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here)
  .filter((f) => f.endsWith('.bench.mjs'))
  .sort();

const results = [];
let failed = false;
let broken = false;
for (const file of files) {
  const bench = (await import(pathToFileURL(join(here, file)).href)).default;
  if (filter && !bench.name.includes(filter)) continue;
  const state = await bench.setup();
  for (let i = 0; i < WARMUP; i++) bench.run(state);
  const times = [];
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now();
    bench.run(state);
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor(RUNS / 2)];
  const counted = typeof bench.count === 'function' ? await bench.count(state) : null;
  const units = bench.units ?? 1;
  const unit = bench.unit ?? 'run';
  if (!(units > 0) || (bench.expectedCount !== undefined && counted === null)) {
    console.error(`${bench.name}: malformed bench (units ${units}, expectedCount without count)`);
    broken = true;
  }
  if (bench.expectedCount !== undefined && counted !== null && counted !== bench.expectedCount) {
    console.error(
      `${bench.name}: counted ${counted} Num operations, expected ${bench.expectedCount}`,
    );
    broken = true;
  }
  const perUnit = counted === null ? null : counted / units;
  const countOk =
    bench.maxCountPerUnit === undefined || perUnit === null || perUnit <= bench.maxCountPerUnit;
  const limit = bench.budgetMs * guard;
  const ok = median <= limit && countOk;
  if (!ok) failed = true;
  const r = {
    name: bench.name,
    ops: bench.ops,
    countedOps: counted,
    units,
    unit,
    countedPerUnit: perUnit,
    maxCountPerUnit: bench.maxCountPerUnit ?? null,
    minMs: times[0],
    medianMs: median,
    maxMs: times[RUNS - 1],
    opsPerSec: Math.round((bench.ops / median) * 1000),
    budgetMs: bench.budgetMs,
    guard,
    ok,
  };
  results.push(r);
  const f = (x) => x.toFixed(2).padStart(8);
  const perUnitText =
    perUnit === null || (units === 1 && bench.maxCountPerUnit === undefined)
      ? ''
      : `, ${perUnit.toLocaleString('en-US', { maximumFractionDigits: 1 })} per ${unit}` +
        (bench.maxCountPerUnit === undefined ? '' : ` (max ${bench.maxCountPerUnit})`);
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${r.name}: ${r.ops.toLocaleString('en-US')} ops` +
      (counted === null
        ? ''
        : ` (counted ${counted.toLocaleString('en-US')} Num ops per run${perUnitText})`),
  );
  console.log(
    `     min ${f(r.minMs)} ms  median ${f(r.medianMs)} ms  max ${f(r.maxMs)} ms  ` +
      `${r.opsPerSec.toLocaleString('en-US')} ops/s  budget ${r.budgetMs} ms × ${guard} = ${limit} ms`,
  );
}

if (results.length === 0) {
  console.error(`no bench matched ${filter ? `--filter ${filter}` : 'scripts/bench/*.bench.mjs'}`);
  process.exit(2);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ guard, results }, null, 2) + '\n');
process.exit(broken ? 2 : failed ? 1 : 0);
