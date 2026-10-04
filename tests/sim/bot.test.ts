// @vitest-environment node
// GDD §22.6: the active policy is the sim2.py rule the §5.5 and §15 reference numbers come from.
// The pacing bands are wide, so the policy itself is pinned here: highest affordable tier from
// G8 down, Buy 1, and a global level when it costs less than 3× that tier's purchase.
import { describe, expect, it } from 'vitest';
import { makeState, newGame } from '../../src/engine/state.ts';
import {
  GLOBAL_PREFERENCE,
  IDLE_PERIOD_S,
  IDLE_WINDOW_S,
  MAX_REACTION_DELAY_S,
  canAct,
  nextAction,
} from '../../src/sim/bot.ts';

/** Every tier at count 100, so its next purchase costs far more than x in these fixtures. */
const PRICEY = [100, 100, 100, 100, 100, 100, 100, 100];

describe('the active policy (GDD §22.6)', () => {
  it('the constants of the sim2.py rule', () => {
    expect(GLOBAL_PREFERENCE).toBe(3);
    expect(MAX_REACTION_DELAY_S).toBe(2);
    expect([IDLE_PERIOD_S, IDLE_WINDOW_S]).toEqual([900, 10]);
  });

  it('a new game buys one G1', () => {
    expect(nextAction(newGame())).toEqual({ type: 'buy', tier: 1, mode: 'one' });
  });

  it('takes the highest affordable tier, one at a time', () => {
    // x = 1e4 pays G1 (10), G2 (100) and G3 (1e4), not G4 (1e7); level 5 costs 1e7.
    const s = makeState({ x: 1e4, globalLevel: 5 });
    expect(nextAction(s)).toEqual({ type: 'buy', tier: 3, mode: 'one' });
    expect(nextAction(makeState({ x: '1e29', globalLevel: 40 }))).toEqual({
      type: 'buy',
      tier: 8,
      mode: 'one',
    });
  });

  it('buys a global level instead when it costs less than 3× that tier purchase', () => {
    // G3 costs 1e4; level 2 costs 1e4 < 3e4.
    expect(nextAction(makeState({ x: 1e4, globalLevel: 2 }))).toEqual({
      type: 'buyGlobal',
      mode: 'one',
    });
    // Level 3 costs 1e5 ≥ 3 · 1e4 (and is affordable at x = 1e5, where G4's 1e7 is not).
    expect(nextAction(makeState({ x: 1e5, globalLevel: 3 }))).toEqual({
      type: 'buy',
      tier: 3,
      mode: 'one',
    });
  });

  it('buys a global level when no tier is affordable, and nothing when nothing is', () => {
    expect(nextAction(makeState({ x: 100, bought: PRICEY }))).toEqual({
      type: 'buyGlobal',
      mode: 'one',
    });
    expect(nextAction(makeState({ x: 99, bought: PRICEY }))).toBeNull();
    expect(nextAction(makeState({ x: 5 }))).toBeNull();
  });

  it('the idle profile acts only in the first 10 s of every 15 min; active always', () => {
    expect([0, 9, 900, 909].every((t) => canAct('idle', t))).toBe(true);
    expect([10, 899, 910].some((t) => canAct('idle', t))).toBe(false);
    expect([0, 10, 899].every((t) => canAct('active', t))).toBe(true);
  });
});
