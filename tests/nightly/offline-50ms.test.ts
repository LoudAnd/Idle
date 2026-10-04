// @vitest-environment node
// GDD §22 items 7 and 9 (nightly): offline `advance()` against the 50 ms reference, the game's
// own fixed-timestep ticks (576,000 of them for 8 h, so this is not part of `npm run check`).
// Skipped unless ISI_NIGHTLY is set: `ISI_NIGHTLY=1 npx vitest run tests/nightly`.
import { describe, expect, it } from 'vitest';
import type { Action } from '../../src/engine/actions.ts';
import { TICK_MS } from '../../src/engine/content/sum.ts';
import { flush } from '../../src/engine/integrate.ts';
import { log10Floor1 } from '../../src/engine/num.ts';
import { advance } from '../../src/engine/offline.ts';
import { newGame } from '../../src/engine/state.ts';
import type { GameState } from '../../src/engine/state.ts';
import { tick } from '../../src/engine/tick.ts';
import { runBot } from '../../src/sim/bot.ts';

const HOUR = 3600;
const MAX_ALL: Action = { type: 'maxAll' };
const TICKS_PER_S = 1000 / TICK_MS;

/** 50 ms ticks for `seconds`, with `actionsAt(t)` at the tick that starts second t. */
function ticks(s: GameState, seconds: number, actionsAt: (t: number) => Action[]): GameState {
  let out = s;
  for (let i = 0; i < seconds * TICKS_PER_S; i++) {
    out = tick(out, i % TICKS_PER_S === 0 ? actionsAt(i / TICKS_PER_S) : []);
  }
  return flush(out, { force: true });
}

const relLog = (a: GameState, b: GameState) =>
  Math.abs(log10Floor1(a.sum.x) - log10Floor1(b.sum.x)) / Math.abs(log10Floor1(b.sum.x));

describe.skipIf(!process.env.ISI_NIGHTLY)('offline against the 50 ms reference (nightly)', () => {
  it(
    '1 h without actions is within 0.5% of the 50 ms reference in log10 x',
    { timeout: 600_000 },
    () => {
      const s0 = runBot({ profile: 'active', seed: 1, seconds: 360 }).final;
      expect(
        relLog(
          advance(s0, HOUR),
          ticks(s0, HOUR, () => []),
        ),
      ).toBeLessThanOrEqual(0.005);
    },
  );

  it(
    '48 scripted Max-all purchases over 8 h match the 50 ms reference within 1e-6 relative in log10 x',
    { timeout: 1_800_000 },
    () => {
      const s0 = newGame();
      const span = 8 * HOUR;
      const schedule = Array.from({ length: 48 }, (_, k) => ({ at: 600 * k, actions: [MAX_ALL] }));
      const ref = ticks(s0, span, (t) => (t % 600 === 0 ? [MAX_ALL] : []));
      const off = advance(s0, span, schedule);
      expect(off.sum.bought).toEqual(ref.sum.bought);
      expect(relLog(off, ref)).toBeLessThanOrEqual(1e-6);
    },
  );
});
