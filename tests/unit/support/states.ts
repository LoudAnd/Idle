// Random reachable saves for the save tests (GDD §20.1, §22 item 2): states the game can
// actually reach, from seeded action logs replayed tick by tick and from bot runs of random
// length, each with the onboarding memory observed along the way (as the loop's `observe`
// does). Seeded with src/sim/rng.ts, so the same seed always gives the same states.
import type { Action } from '../../../src/engine/actions.ts';
import type { SaveData } from '../../../src/engine/save/envelope.ts';
import { makeState } from '../../../src/engine/state.ts';
import type { GameState, Tier } from '../../../src/engine/state.ts';
import { step, tick } from '../../../src/engine/tick.ts';
import { runBot } from '../../../src/sim/bot.ts';
import { createRng } from '../../../src/sim/rng.ts';
import type { Rng } from '../../../src/sim/rng.ts';
import {
  memoryToIds,
  newMemory,
  observeContext,
  observeMemory,
} from '../../../src/ui/onboarding.ts';
import type { OnboardingMemory } from '../../../src/ui/onboarding.ts';

const TIER_MODES = ['one', 'until10', 'max'] as const;

function randomAction(rng: Rng): Action {
  const r = rng.int(10);
  if (r < 6) {
    return { type: 'buy', tier: (1 + rng.int(8)) as Tier, mode: TIER_MODES[rng.int(3)]! };
  }
  if (r < 8) return { type: 'buyGlobal', mode: rng.int(2) === 0 ? 'one' : 'max' };
  return { type: 'maxAll' };
}

/** A seeded action log replayed with 50 ms ticks from a random starting x, memory observed. */
function fromActionLog(rng: Rng): SaveData {
  // x from 10 to 1e60, so a range of tiers becomes affordable.
  let s: GameState = makeState({ x: `1e${1 + rng.int(60)}` });
  let m: OnboardingMemory = newMemory();
  const ticks = 20 + rng.int(400);
  for (let i = 0; i < ticks; i++) {
    m = observeMemory(m, observeContext(s));
    const actions = rng.int(4) === 0 ? [randomAction(rng), randomAction(rng)] : [];
    s = tick(s, actions);
  }
  m = observeMemory(m, observeContext(s));
  return { game: s, onboarding: memoryToIds(m) };
}

/** A bot run of random length (up to 15 min), replayed with its 1 s steps, memory observed. */
function fromBot(rng: Rng): SaveData {
  const run = runBot({
    profile: rng.int(3) === 0 ? 'idle' : 'active',
    seed: 1 + rng.int(5),
    seconds: 1 + rng.int(900),
  });
  let s = run.initial;
  let m = newMemory();
  for (const actions of run.log) {
    m = observeMemory(m, observeContext(s));
    s = step(s, actions, 1);
  }
  m = observeMemory(m, observeContext(s));
  // Some time pending, as a save made between two flushes has.
  if (rng.int(2) === 0) s = tick(s, []);
  return { game: s, onboarding: memoryToIds(m) };
}

/** `n` reachable saves for `seed`: alternately from action logs and bot runs. */
export function reachableStates(n: number, seed: number): SaveData[] {
  const rng = createRng(seed);
  const out: SaveData[] = [];
  for (let i = 0; i < n; i++) out.push(i % 2 === 0 ? fromActionLog(rng) : fromBot(rng));
  return out;
}
