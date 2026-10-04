// @vitest-environment node
// GDD §21.2: the serialized state, the oracle behind every "exactly equal" and replay test, holds
// every field; and the tier helpers.
import { describe, expect, it } from 'vitest';
import { encodeNum, num } from '../../src/engine/num.ts';
import { integrate } from '../../src/engine/integrate.ts';
import {
  MAX_COUNT,
  TIERS,
  makeState,
  newGame,
  serializeState,
  tierAt,
  tierIndex,
  toSerializable,
  withSum,
} from '../../src/engine/state.ts';
import { MAX_COUNT as BUY_CAP } from '../../src/engine/systems/sum.ts';

const S = makeState({
  x: '1e30',
  amounts: ['1e12', 5e9, 3e7, 2e6, 9e4, 700, 52, 11],
  bought: [130, 95, 72, 55, 42, 30, 20, 11],
  globalLevel: 28,
  time: 723.5,
  pendingMs: 350,
});

describe('toSerializable and serializeState (GDD §21.2)', () => {
  it('holds x, all 8 amounts, the counts, the level, the time and the pending time', () => {
    expect(toSerializable(S)).toEqual({
      sum: {
        x: encodeNum(num('1e30')),
        amounts: ['1e12', 5e9, 3e7, 2e6, 9e4, 700, 52, 11].map((a) => encodeNum(num(a))),
        bought: [130, 95, 72, 55, 42, 30, 20, 11],
        globalLevel: 28,
      },
      time: 723.5,
      pendingMs: 350,
    });
    expect(serializeState(S)).toBe(JSON.stringify(toSerializable(S)));
  });

  it('two states that differ in any one field serialize differently', () => {
    const base = serializeState(S);
    const amounts = S.sum.amounts.map((a, i) => (i === 7 ? a.add(1) : a));
    const bought = S.sum.bought.map((b, i) => (i === 3 ? b + 1 : b));
    const variants = [
      makeState({ ...init(), x: '2e30' }),
      makeState({ ...init(), amounts }),
      makeState({ ...init(), bought }),
      makeState({ ...init(), globalLevel: 29 }),
      makeState({ ...init(), time: 724 }),
      makeState({ ...init(), pendingMs: 400 }),
    ];
    for (const v of variants) expect(serializeState(v)).not.toBe(base);
    expect(serializeState(makeState(init()))).toBe(base);
  });

  it('leaves out the effect table (a cache)', () => {
    const cached = integrate(S, 1);
    expect(cached.table).not.toBeNull();
    expect(serializeState({ ...cached, table: null })).toBe(serializeState(cached));
  });
});

describe('state helpers', () => {
  it('withSum sets the Sum state and marks the table dirty', () => {
    const cached = integrate(newGame(), 1);
    expect(cached.table).not.toBeNull();
    const next = withSum(cached, { ...cached.sum, globalLevel: 1 });
    expect(next.table).toBeNull();
    expect(next.sum.globalLevel).toBe(1);
    expect(next.time).toBe(cached.time);
  });

  it('tierAt inverts tierIndex; the buy cap and the invariant share MAX_COUNT', () => {
    for (const t of TIERS) expect(tierAt(tierIndex(t))).toBe(t);
    expect(MAX_COUNT).toBe(2 ** 53);
    expect(BUY_CAP).toBe(MAX_COUNT);
  });
});

function init() {
  return {
    x: S.sum.x,
    amounts: S.sum.amounts,
    bought: S.sum.bought,
    globalLevel: S.sum.globalLevel,
    time: S.time,
    pendingMs: S.pendingMs,
  };
}
