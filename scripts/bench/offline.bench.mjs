// Offline catch-up (GDD §20.2, §21.7: 24 h without autobuyers ≤ 300 ms in Node). One run is
// `advance(fixture, 86400)` from the late-M2 state of tick.bench.mjs (all eight tiers owned, the
// most expensive integration): 2,000 macro-steps through the exact integrator. The report lists
// `Num` operations per macro-step (§22.12).
import { installOpCounter } from '../../src/engine/num.ts';
import { advance, macroSteps } from '../../src/engine/offline.ts';
import { makeState } from '../../src/engine/state.ts';

const SPAN_S = 86_400;

function setup() {
  // Counts and level of an active bot run near 2^128 (docs/balance/M2.md), 950 ms pending.
  const fixture = makeState({
    x: '1e40',
    amounts: ['1e20', '1e17', '1e14', '1e11', '1e8', '1e6', '1e4', 20],
    bought: [160, 120, 92, 72, 57, 44, 33, 20],
    globalLevel: 40,
    pendingMs: 950,
  });
  return { fixture, sink: 0 };
}

function run(state) {
  state.sink = advance(state.fixture, SPAN_S).time;
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
  name: 'offline: advance 24 h without autobuyers (late M2, 8 tiers)',
  ops: 1,
  // GDD §21.7: 24 h of offline time without autobuyers ≤ 300 ms in Node.
  budgetMs: 300,
  setup,
  run,
  count,
  units: macroSteps(SPAN_S).length,
  unit: 'macro-step',
};
