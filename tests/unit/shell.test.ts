// @vitest-environment node
// GDD §17.1, §17.2, §17.4, §21.8: the shell's view (reveals, goal, growth, the 10 Hz headline),
// its onboarding memory (remembered reveals and goals, observed at every tick boundary, read
// and reset as one value), its check on extreme states, and the tab table.
import { describe, expect, it } from 'vitest';
import { CAP, ZERO, encodeNum, num, pow2 } from '../../src/engine/num.ts';
import { makeState } from '../../src/engine/state.ts';
import { createGameLoop } from '../../src/platform/loop.ts';
import { memoryFromIds, memoryToIds, newMemory } from '../../src/ui/onboarding.ts';
import {
  HEADLINE_INTERVAL_S,
  checkShellView,
  createShellDeriver,
} from '../../src/ui/shell/view.ts';
import { createFakeClock } from '../ui/support/fakeClock.ts';
import { TAB_DEFS, splitTabs, visibleTabs } from '../../src/ui/shell/tabs.ts';
import type { TabDef } from '../../src/ui/shell/tabs.ts';

describe('shell view (GDD §17.1, §17.4)', () => {
  it('a new game: x = 10, rate 0, growth — (null), goal Buy G2 at 0 %, nothing revealed', () => {
    const v = createShellDeriver().derive(makeState());
    expect(v.header.x.toNumber()).toBe(10);
    expect(v.header.rate.toNumber()).toBe(0);
    expect(v.header.growth).toBeNull();
    expect(v.goal).toMatchObject({ id: 'goal.g2', pct: 0 });
    expect(v.revealed).toEqual([]);
    expect(v.sum.tiers.map((r) => r.state)).toEqual([
      'owned',
      'hidden',
      'hidden',
      'hidden',
      'hidden',
      'hidden',
      'hidden',
      'hidden',
    ]);
    expect(v.sum.levels.state).toBe('hidden');
    expect(v.sum.maxAll.shown).toBe(false);
    expect(checkShellView(v)).toEqual([]);
  });

  it('remembers reveals: a G2 silhouette stays after x drops below 50', () => {
    const d = createShellDeriver();
    expect(d.derive(makeState({ x: 50, time: 1 })).sum.tiers[1].state).toBe('silhouette');
    const after = d.derive(makeState({ x: 0, bought: [1], time: 2 }));
    expect(after.sum.tiers[1].state).toBe('silhouette');
    expect(after.revealed).toEqual(['tier.2', 'global', 'maxAll']);
    expect(d.derive(makeState({ x: 0, bought: [1, 1], time: 3 })).sum.tiers[1].state).toBe('owned');
  });

  it('remembers done goals: the chip stays on Reach 2^1024 after Max all spends x below 2^128, and after a reset of the bought counts', () => {
    const d = createShellDeriver();
    const all = [1, 1, 1, 1, 1, 1, 1, 1];
    expect(d.derive(makeState({ x: pow2(128), bought: all, time: 1 })).goal).toMatchObject({
      id: 'goal.power',
    });
    expect(d.derive(makeState({ x: 5, bought: all, time: 2 })).goal).toEqual({
      id: 'goal.power',
      key: 'goal.reach2',
      params: { n: 1024 },
      pct: 0,
    });
    // M5's Product reset sets b back to 0: the tier goals were done, so they stay done.
    expect(d.derive(makeState({ x: 10, time: 3 })).goal?.id).toBe('goal.power');
    expect([...d.memory().done]).toContain('goal.product');
  });

  it('observe() records a reveal without deriving a view; memory() and reset() read and replace the whole memory', () => {
    const d = createShellDeriver();
    d.observe(makeState({ x: 5000, bought: [1, 1] }));
    expect(d.memory().revealed.has('tier.3')).toBe(true);
    // The next view shows the G3 silhouette although its own x is below the half.
    expect(d.derive(makeState({ x: 10, bought: [1, 1], time: 1 })).sum.tiers[2].state).toBe(
      'silhouette',
    );
    d.visit('sum');
    const before = d.memory();
    d.visit('sum');
    expect(d.memory()).toBe(before); // nothing new, the same value
    // A fresh game after an in-page replacement (M4's import or hard reset) starts clean.
    d.derive(makeState({ x: '1e30', time: 500 }));
    d.reset();
    const fresh = d.derive(makeState());
    expect(fresh.revealed).toEqual([]);
    expect(fresh.goal?.id).toBe('goal.g2');
    expect(fresh.sum.tiers.filter((r) => r.state !== 'hidden')).toHaveLength(1);
    expect(fresh.header.growth).toBeNull();
    // ... or with a given memory.
    d.reset(memoryFromIds({ revealed: ['tier.2', 'global'], done: ['goal.g2'] }));
    const seeded = d.derive(makeState());
    expect(seeded.revealed).toEqual(['tier.2', 'global', 'maxAll']); // Max all comes with them
    expect(seeded.goal?.id).toBe('goal.g3');
    expect(createShellDeriver(memoryFromIds(memoryToIds(d.memory()))).memory()).toEqual(d.memory());
    expect(newMemory().visited.has('sum')).toBe(true);
  });

  it('a reveal crossed between two derives is recorded even when a queued Max all spends x first (uiFps 10)', () => {
    const clock = createFakeClock();
    const d = createShellDeriver();
    const loop = createGameLoop({
      clock,
      derive: d.derive,
      observe: d.observe,
      checkView: checkShellView,
      initial: makeState({ x: 4975, amounts: [150], bought: [1, 1] }),
    });
    loop.setUiFps(10);
    loop.start();
    clock.frame(50); // one tick, derived: x = 4990, G3 (half 5,000) not revealed
    expect(loop.view()!.sum.x.toNumber()).toBeCloseTo(4990, 9);
    expect(loop.view()!.revealed).not.toContain('tier.3');
    clock.frame(50); // one tick, not derived (50 ms < 1/10 s): x = 5,005
    loop.enqueue({ type: 'maxAll' });
    clock.frame(50); // Max all at tick 0 spends x, then a derive
    const v = loop.view()!;
    expect(v.sum.x.lt(5000)).toBe(true);
    expect(v.revealed).toContain('tier.3');
    expect(v.sum.tiers[2].state).toBe('silhouette');
  });

  it('the headline updates at most every 0.1 s of game time; rows update every derive', () => {
    const d = createShellDeriver();
    const a = d.derive(makeState({ x: 10 }));
    const b = d.derive(makeState({ x: 20, pendingMs: 50 }));
    expect(b.header.x.toNumber()).toBe(10);
    expect(b.sum.x.toNumber()).toBe(20);
    const c = d.derive(makeState({ x: 30, pendingMs: HEADLINE_INTERVAL_S * 1000 }));
    expect(c.header.x.toNumber()).toBe(30);
    expect(a.gameTime).toBe(0);
  });

  it('the rate is A1·m1 exactly, and equals G1’s production', () => {
    const v = createShellDeriver().derive(
      makeState({ amounts: [7], bought: [20], globalLevel: 2 }),
    );
    expect(encodeNum(v.header.rate)).toEqual(encodeNum(v.sum.tiers[0].production));
    expect(v.header.rate.toNumber()).toBeCloseTo(7 * 2 * 1.15 ** 2 * 4, 9);
  });

  it('extreme states pass the view check (x = 0, x = CAP, no production): no NaN or Infinity', () => {
    for (const s of [
      makeState({ x: 0 }),
      makeState({ x: ZERO, bought: [1], amounts: [1] }),
      makeState({
        x: CAP,
        bought: [400, 300, 200, 100, 50, 40, 30, 20],
        amounts: Array(8).fill('1e300'),
      }),
      makeState({ x: '1e-400', bought: [1], amounts: ['1e-300'] }),
      makeState({ x: num('1e300') }),
    ]) {
      const d = createShellDeriver();
      d.derive(s);
      const v = d.derive({ ...s, time: s.time + 1 });
      expect(checkShellView(v)).toEqual([]);
    }
  });
});

describe('tabs (GDD §17.2, §17.6)', () => {
  it('M3 has only Sum, shown from the start', () => {
    expect(TAB_DEFS.map((t) => t.id)).toEqual(['sum']);
    expect(visibleTabs([]).map((t) => t.id)).toEqual(['sum']);
  });

  it('a tab appears with its reveal', () => {
    const defs: TabDef[] = [
      ...TAB_DEFS,
      { id: 'product', labelKey: 'tab.sum', reveal: 'tab.product' },
    ];
    expect(visibleTabs([], defs).map((t) => t.id)).toEqual(['sum']);
    expect(visibleTabs(['tab.product'], defs).map((t) => t.id)).toEqual(['sum', 'product']);
    expect(visibleTabs(new Set(['tab.product'] as const), defs).map((t) => t.id)).toEqual([
      'sum',
      'product',
    ]);
  });

  it('the mobile bar holds 5 tabs, the rest go behind More', () => {
    expect(splitTabs([1, 2, 3])).toEqual({ bar: [1, 2, 3], more: [] });
    expect(splitTabs([1, 2, 3, 4, 5])).toEqual({ bar: [1, 2, 3, 4, 5], more: [] });
    expect(splitTabs([1, 2, 3, 4, 5, 6, 7])).toEqual({ bar: [1, 2, 3, 4, 5], more: [6, 7] });
  });
});
