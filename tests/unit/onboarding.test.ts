// @vitest-environment node
// GDD §17.1, §17.2, §17.4: the onboarding memory is one monotone value (reveals, goals done,
// tabs visited), and its stored form (M4) is validated ids: unknown ids are dropped, and the
// start tab is always visited.
import { describe, expect, it } from 'vitest';
import { num } from '../../src/engine/num.ts';
import { map8 } from '../../src/engine/state.ts';
import {
  memoryFromIds,
  memoryToIds,
  newMemory,
  observeMemory,
  visitTab,
} from '../../src/ui/onboarding.ts';

const ctx = (x: number, bought: readonly number[] = [], globalLevel = 0) => ({
  x: num(x),
  bought: map8((i) => bought[i] ?? 0),
  globalLevel,
});

describe('onboarding memory (GDD §17.4)', () => {
  it('a new game: nothing revealed or done, Sum visited', () => {
    expect(memoryToIds(newMemory())).toEqual({ revealed: [], done: [], visited: ['sum'] });
  });

  it('observing merges reveals and done goals, monotonically, and returns the same value when nothing is new', () => {
    const m0 = newMemory();
    const m1 = observeMemory(m0, ctx(60));
    expect(memoryToIds(m1)).toEqual({
      revealed: ['global', 'maxAll', 'tier.2'],
      done: [],
      visited: ['sum'],
    });
    const m2 = observeMemory(m1, ctx(0, [1, 1]));
    expect(memoryToIds(m2).done).toEqual(['goal.g2']);
    expect(observeMemory(m2, ctx(0, [1]))).toBe(m2); // spending or a reset forgets nothing
    expect(visitTab(m2, 'sum')).toBe(m2);
    expect(memoryToIds(visitTab(m2, 'product')).visited).toEqual(['product', 'sum']);
    expect(memoryToIds(m0)).toEqual(memoryToIds(newMemory())); // inputs are never changed
  });

  it('stored ids round-trip; unknown ids, wrong types and missing fields are dropped', () => {
    const m = observeMemory(observeMemory(newMemory(), ctx(1e5)), ctx(0, [1, 1]));
    expect(memoryFromIds(memoryToIds(m))).toEqual(m);
    expect(
      memoryToIds(
        memoryFromIds({
          revealed: ['tier.2', 'tier.9', 3, null],
          done: 'goal.g2',
          visited: ['nope', 'sum'],
        }),
      ),
    ).toEqual({ revealed: ['tier.2'], done: [], visited: ['sum'] });
    for (const raw of [null, undefined, 3, 'x', []]) {
      expect(memoryToIds(memoryFromIds(raw))).toEqual(memoryToIds(newMemory()));
    }
  });
});
