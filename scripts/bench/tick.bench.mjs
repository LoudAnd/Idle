// Num operations per flushing tick (GDD §21.7: ≤ 400 per tick). Each unit is one 50 ms tick that
// flushes 1 s of pending time through the exact integrator, from a late-M2 state with all eight
// tiers owned (the most expensive integration: 36 tier pairs). Most ticks do not flush and cost
// a handful of operations; this measures the worst regular tick.
import { installOpCounter } from '../../src/engine/num.ts';
import { makeState } from '../../src/engine/state.ts';
import { tick } from '../../src/engine/tick.ts';

const TICKS = 1000;

function setup() {
  // Counts and level of an active bot run near 2^128 (docs/balance/M2.md), 950 ms pending.
  const fixture = makeState({
    x: '1e40',
    amounts: ['1e20', '1e17', '1e14', '1e11', '1e8', '1e6', '1e4', 20],
    bought: [160, 120, 92, 72, 57, 44, 33, 20],
    globalLevel: 40,
    pendingMs: 950,
  });
  // Warm the effect table so every unit measures a steady-state tick.
  return { fixture: { ...fixture, table: tick(fixture, []).table }, sink: 0 };
}

function run(state) {
  let acc = 0;
  for (let i = 0; i < TICKS; i++) {
    const out = tick(state.fixture, []);
    acc += out.time;
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
  name: 'tick: flushing 50 ms ticks (late M2, 8 tiers)',
  ops: TICKS,
  // GDD §21.7: a late-game tick p50 ≤ 0.3 ms in Node.
  budgetMs: TICKS * 0.3,
  setup,
  run,
  count,
  units: TICKS,
  unit: 'flushing tick',
  maxCountPerUnit: 400,
};
