// @vitest-environment node
// GDD §17.4, §20.1: the save stores the onboarding memory as ids that the engine validates, so
// the engine's id lists (content/onboarding.ts) and the UI's rule ids (reveal.ts, goals.ts,
// shell/tabs.ts) must be equal sets, and checkSave refuses an unknown or duplicate id.
import { describe, expect, it } from 'vitest';
import {
  GOAL_IDS,
  REVEAL_IDS,
  TAB_IDS,
  isKnownOnboardingId,
} from '../../src/engine/content/onboarding.ts';
import { checkSave } from '../../src/engine/invariants.ts';
import { newGame } from '../../src/engine/state.ts';
import { GOAL_IDS as UI_GOAL_IDS } from '../../src/ui/goals.ts';
import { memoryToIds, newMemory } from '../../src/ui/onboarding.ts';
import { REVEAL_IDS as UI_REVEAL_IDS } from '../../src/ui/reveal.ts';
import { TAB_DEFS } from '../../src/ui/shell/tabs.ts';

const asSet = (xs: readonly string[]) => new Set(xs);

describe('onboarding ids (GDD §17.4, §20.1)', () => {
  it('the engine lists equal the UI rule ids', () => {
    expect(asSet(REVEAL_IDS)).toEqual(asSet(UI_REVEAL_IDS));
    expect(asSet(GOAL_IDS)).toEqual(asSet(UI_GOAL_IDS));
    expect(asSet(TAB_IDS)).toEqual(asSet(TAB_DEFS.map((t) => t.id)));
    // In the same order too, and without duplicates.
    expect([...REVEAL_IDS]).toEqual([...UI_REVEAL_IDS]);
    expect([...GOAL_IDS]).toEqual([...UI_GOAL_IDS]);
    for (const l of [REVEAL_IDS, GOAL_IDS, TAB_IDS]) expect(asSet(l).size).toBe(l.length);
    for (const l of [REVEAL_IDS, GOAL_IDS, TAB_IDS]) expect(Object.isFrozen(l)).toBe(true);
  });

  it('ids are known only in their own list', () => {
    expect(isKnownOnboardingId('revealed', 'tier.2')).toBe(true);
    expect(isKnownOnboardingId('done', 'tier.2')).toBe(false);
    expect(isKnownOnboardingId('done', 'goal.g2')).toBe(true);
    expect(isKnownOnboardingId('visited', 'sum')).toBe(true);
    expect(isKnownOnboardingId('visited', 'product')).toBe(false);
    expect(isKnownOnboardingId('revealed', 3)).toBe(false);
  });

  it('checkSave adds every id known and unique to the state invariant', () => {
    const ok = { game: newGame(), onboarding: memoryToIds(newMemory()) };
    expect(checkSave(ok)).toEqual([]);
    expect(
      checkSave({ ...ok, onboarding: { ...ok.onboarding, revealed: ['tier.2', 'tier.9'] } }),
    ).toEqual(['onboarding.revealed[1]: unknown id']);
    expect(
      checkSave({ ...ok, onboarding: { ...ok.onboarding, done: ['goal.g2', 'goal.g2'] } }),
    ).toEqual(['onboarding.done[1]: duplicate id']);
    expect(
      checkSave({ ...ok, onboarding: { ...ok.onboarding, visited: 'sum' as unknown as string[] } }),
    ).toEqual(['onboarding.visited: not an array']);
  });
});
