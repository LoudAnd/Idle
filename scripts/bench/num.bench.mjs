// 100,000 mixed `Num` operations (GDD §4.1, §21.7): 10,000 iterations of 10 operations each
// over a deterministic pool of 1,024 values spread across layers 0–2. Budget 250 ms.
import {
  fromComponents,
  installOpCounter,
  log10Floor1,
  num,
  pow10,
  subClamp,
} from '../../src/engine/num.ts';

const ITERATIONS = 10_000;
const OPS_PER_ITERATION = 10;
const POOL = 1024;

/** A small LCG (no Math.random), so every run uses the same values. */
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function setup() {
  const rnd = lcg(20261004);
  const pool = [];
  for (let i = 0; i < POOL; i++) {
    const layer = i % 3;
    // Layer 0: 1e-3 … 1e15; layers 1 and 2: mags 16 … 1e6 (both well inside the range).
    const u = rnd();
    pool.push(layer === 0 ? num(10 ** (-3 + 18 * u)) : fromComponents(1, layer, 16 + 1e6 * u));
  }
  const exps = pool.map((_, i) => (i % 50) - 10 + rnd());
  return { pool, exps, sink: 0 };
}

function run(state) {
  const { pool, exps } = state;
  let acc = 0;
  for (let i = 0; i < ITERATIONS; i++) {
    const a = pool[i & (POOL - 1)];
    const b = pool[(i * 7 + 3) & (POOL - 1)];
    const s = a.add(b); // 1
    const d = subClamp(s, b); // 2
    const m = a.mul(b); // 3
    const q = m.div(b); // 4
    const p = d.pow(1.15); // 5
    acc += q.cmp(p); // 6
    acc += log10Floor1(a); // 7
    const mx = a.max(b); // 8
    const t = pow10(exps[i & (POOL - 1)]); // 9
    if (mx.gte(t)) acc++; // 10
  }
  state.sink = acc;
}

function count(state) {
  const counter = installOpCounter();
  try {
    run(state);
    return counter.count;
  } finally {
    counter.uninstall();
  }
}

export default {
  name: 'num: 100k mixed Num operations',
  ops: ITERATIONS * OPS_PER_ITERATION,
  budgetMs: 250,
  setup,
  run,
  count,
  // A self-check: every operation in `run` is one top-level Num operation.
  expectedCount: ITERATIONS * OPS_PER_ITERATION,
  units: ITERATIONS,
  unit: 'iteration',
  maxCountPerUnit: OPS_PER_ITERATION,
};
