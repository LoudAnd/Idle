// @vitest-environment node
// GDD §21.2, §22 item 9: the same action log gives the same serialized state, also after the
// log has been stored as JSON and validated with `isAction`.
import { describe, expect, it } from 'vitest';
import { encodeNum } from '../../src/engine/num.ts';
import { applyAction, isAction } from '../../src/engine/actions.ts';
import type { Action } from '../../src/engine/actions.ts';
import { buildEventTable } from '../../src/engine/effects.ts';
import type { EffectTable } from '../../src/engine/effects.ts';
import { makeState, newGame, serializeState } from '../../src/engine/state.ts';
import type { GameState, Tier } from '../../src/engine/state.ts';
import { replay, tick } from '../../src/engine/tick.ts';
import { createRng } from '../../src/sim/rng.ts';
import type { Rng } from '../../src/sim/rng.ts';
import { FC_SEED } from './support/arbitraries.ts';

const MODES = ['one', 'until10', 'max'] as const;

function randomAction(rng: Rng): Action {
  const r = rng.int(10);
  if (r < 7) {
    return { type: 'buy', tier: (1 + rng.int(8)) as Tier, mode: MODES[rng.int(3)] ?? 'one' };
  }
  if (r < 9) return { type: 'buyGlobal', mode: rng.int(2) === 0 ? 'one' : 'max' };
  return { type: 'maxAll' };
}

/** 2,000 ticks; about one tick in ten carries 1–3 actions. */
function randomLog(seed: number, ticks = 2000): Action[][] {
  const rng = createRng(seed);
  return Array.from({ length: ticks }, () =>
    rng.int(10) === 0 ? Array.from({ length: 1 + rng.int(3) }, () => randomAction(rng)) : [],
  );
}

/** A table as plain codes: every tier's m and every factor's id, params and value. */
function tableCodes(t: EffectTable): unknown {
  return t.tiers.map((tier) => ({
    m: encodeNum(tier.m),
    factors: tier.factors.map((f) => [f.id, f.params, encodeNum(f.value)]),
  }));
}

const fixtures: readonly [string, GameState][] = [
  ['a new game', newGame()],
  [
    'a mid-game state',
    makeState({
      x: '1e30',
      amounts: ['1e12', 5e9, 3e7, 2e6, 9e4, 700, 52, 11],
      bought: [130, 95, 72, 55, 42, 30, 20, 11],
      globalLevel: 28,
      time: 723,
      pendingMs: 350,
    }),
  ],
];

describe('replay (GDD §21.2)', () => {
  it.each(fixtures)(
    'replaying the same action log twice gives identical serialized state (%s)',
    { timeout: 60_000 },
    (_name, initial) => {
      const log = randomLog(FC_SEED);
      const a = serializeState(replay(initial, log));
      const b = serializeState(replay(initial, log));
      expect(a).toBe(b);
      expect(a).not.toBe(serializeState(initial));
      // Stored as JSON and read back through the guard, the log replays to the same bytes.
      const stored = JSON.parse(JSON.stringify(log)) as unknown[][];
      expect(stored.every((entry) => entry.every(isAction))).toBe(true);
      expect(serializeState(replay(initial, stored as Action[][]))).toBe(a);
    },
  );

  it('replay equals ticking live', () => {
    const log = randomLog(7, 400);
    let live = fixtures[1]![1];
    for (const actions of log) live = tick(live, actions);
    expect(serializeState(replay(fixtures[1]![1], log))).toBe(serializeState(live));
  });

  it.each(fixtures)(
    'the cached effect table always equals a fresh rebuild after every tick and action (%s)',
    { timeout: 60_000 },
    (_name, initial) => {
      // Every event must mark the table dirty (GDD §21.3); a stale cache would keep producing
      // with the old multipliers while invariants, replay and the UI tests stay green.
      const log = randomLog(FC_SEED + 1, 1500);
      let s = initial;
      let checked = 0;
      const coherent = (st: GameState, where: string) => {
        if (st.table === null) return;
        checked++;
        expect(tableCodes(st.table), where).toEqual(tableCodes(buildEventTable(st)));
      };
      log.forEach((actions, t) => {
        let a = s;
        for (const act of actions) {
          a = applyAction(a, act);
          coherent(a, `tick ${t}, after ${JSON.stringify(act)}`);
        }
        s = tick(s, actions);
        coherent(s, `after tick ${t}`);
      });
      expect(checked).toBeGreaterThan(1000);
    },
  );

  it('different logs give different states', () => {
    const s = fixtures[1]![1];
    expect(serializeState(replay(s, randomLog(1, 500)))).not.toBe(
      serializeState(replay(s, randomLog(2, 500))),
    );
  });
});

describe('isAction and applyAction', () => {
  it.each([
    [{ type: 'buy', tier: 1, mode: 'one' }, true],
    [{ type: 'buy', tier: 8, mode: 'until10' }, true],
    [{ type: 'buy', tier: 3, mode: 'max' }, true],
    [{ type: 'buyGlobal', mode: 'one' }, true],
    [{ type: 'buyGlobal', mode: 'max' }, true],
    [{ type: 'maxAll' }, true],
    [{ type: 'buy', tier: 0, mode: 'one' }, false],
    [{ type: 'buy', tier: 9, mode: 'one' }, false],
    [{ type: 'buy', tier: 2.5, mode: 'one' }, false],
    [{ type: 'buy', tier: '1', mode: 'one' }, false],
    [{ type: 'buy', tier: 1, mode: 'until10x' }, false],
    [{ type: 'buyGlobal', mode: 'until10' }, false],
    [{ type: 'reset' }, false],
    [{}, false],
    [null, false],
    ['maxAll', false],
    [42, false],
  ])('isAction(%j) is %s', (v, ok) => {
    expect(isAction(v)).toBe(ok);
  });

  it('a malformed action is a no-op and never throws', () => {
    const s = makeState({ x: '1e50' });
    for (const bad of [null, {}, { type: 'buy', tier: 12, mode: 'max' }, { type: 'x' }]) {
      expect(applyAction(s, bad as unknown as Action)).toBe(s);
    }
  });
});
