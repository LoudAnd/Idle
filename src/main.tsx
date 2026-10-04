import { render } from 'preact';
import { browserClock } from './platform/clock.ts';
import { createErrorHub, installGlobalHandlers } from './platform/errors.ts';
import type { Fault } from './platform/errors.ts';
import { createGameLoop } from './platform/loop.ts';
import { App } from './ui/App.tsx';
import { buildSumView, checkSumView } from './ui/sum/view.ts';

function logFault(f: Fault): void {
  console.error('game paused:', f.kind, f.error ?? f.problems);
}

const hub = createErrorHub({ onFault: logFault });
installGlobalHandlers(window, hub);
const loop = createGameLoop({
  clock: browserClock(window),
  derive: buildSumView,
  checkView: checkSumView,
  hub,
});

const root = document.getElementById('app');
if (root) {
  render(<App loop={loop} />, root);
  loop.start();
}
