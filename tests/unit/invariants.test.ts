// @vitest-environment node
// GDD §20.1: the engine invariant. Every Num is finite and ≥ 0, every count an integer in
// [0, 2^53]; it reports problems and never throws.
import { describe, expect, it } from 'vitest';
import { num } from '../../src/engine/num.ts';
import { checkInvariants, checkValues } from '../../src/engine/invariants.ts';
import { makeState, newGame } from '../../src/engine/state.ts';
import type { GameState } from '../../src/engine/state.ts';

const base = makeState({ x: 5, amounts: [1, 2], bought: [3, 4], globalLevel: 2 });

function withSum(patch: Record<string, unknown>): GameState {
  return { ...base, sum: { ...base.sum, ...patch } } as GameState;
}

describe('checkInvariants (GDD §20.1)', () => {
  it('a new game and a valid state are valid', () => {
    expect(checkInvariants(newGame())).toEqual([]);
    expect(checkInvariants(base)).toEqual([]);
    expect(checkInvariants(withSum({ bought: [2 ** 53, 0, 0, 0, 0, 0, 0, 0] }))).toEqual([]);
  });

  it.each([
    ['x is NaN', withSum({ x: num(Number.NaN) }), 'sum.x'],
    ['x is +Infinity', withSum({ x: num(Number.POSITIVE_INFINITY) }), 'sum.x'],
    ['x is negative', withSum({ x: num(-1) }), 'sum.x'],
    [
      'an amount is NaN',
      withSum({ amounts: base.sum.amounts.map((a, i) => (i === 3 ? num(Number.NaN) : a)) }),
      'sum.amounts[3]',
    ],
    [
      'an amount is negative',
      withSum({ amounts: base.sum.amounts.map((a, i) => (i === 0 ? num(-2) : a)) }),
      'sum.amounts[0]',
    ],
    ['7 amounts', withSum({ amounts: base.sum.amounts.slice(0, 7) }), 'sum.amounts'],
    ['a fractional count', withSum({ bought: [1.5, 0, 0, 0, 0, 0, 0, 0] }), 'sum.bought[0]'],
    ['a negative count', withSum({ bought: [0, -1, 0, 0, 0, 0, 0, 0] }), 'sum.bought[1]'],
    [
      'a count above 2^53',
      withSum({ bought: [0, 0, 2 ** 53 + 2, 0, 0, 0, 0, 0] }),
      'sum.bought[2]',
    ],
    ['a NaN count', withSum({ bought: [0, 0, 0, Number.NaN, 0, 0, 0, 0] }), 'sum.bought[3]'],
    ['9 counts', withSum({ bought: [0, 0, 0, 0, 0, 0, 0, 0, 0] }), 'sum.bought'],
    ['a fractional level', withSum({ globalLevel: 0.5 }), 'sum.globalLevel'],
    ['a negative level', withSum({ globalLevel: -1 }), 'sum.globalLevel'],
    ['NaN time', { ...base, time: Number.NaN }, 'time'],
    ['negative time', { ...base, time: -1 }, 'time'],
    ['infinite pending time', { ...base, pendingMs: Number.POSITIVE_INFINITY }, 'pendingMs'],
  ])('reports %s', (_name, s, field) => {
    const problems = checkInvariants(s);
    expect(problems.length).toBeGreaterThan(0);
    expect(
      problems.some((p) => p.startsWith(field + ':')),
      problems.join('; '),
    ).toBe(true);
  });

  it('never throws, even for garbage', () => {
    for (const junk of [{}, { sum: null }, { sum: { amounts: 3 } }, null]) {
      expect(() => checkInvariants(junk as unknown as GameState)).not.toThrow();
      expect(checkInvariants(junk as unknown as GameState).length).toBeGreaterThan(0);
    }
  });
});

describe('checkValues (GDD §21.8): every value in a derived tree', () => {
  it('a clean tree has no problems', () => {
    const view = { x: num(5), rows: [{ a: num(0), n: 3, ok: true, label: 'G1' }], f: () => 1 };
    expect(checkValues(view)).toEqual([]);
    expect(checkValues(null)).toEqual([]);
    expect(checkValues(num(1))).toEqual([]);
  });

  it('reports every invalid Num and non-finite number, with its path, at any depth', () => {
    const view = {
      x: num(Number.NaN),
      rows: [{ a: num(1) }, { a: num(-1), deep: { deeper: [Number.POSITIVE_INFINITY] } }],
      n: Number.NaN,
    };
    expect(checkValues(view, 'view')).toEqual([
      'view.x: not a valid Num',
      'view.rows[1].a: not a valid Num',
      'view.rows[1].deep.deeper[0]: not a finite number',
      'view.n: not a finite number',
    ]);
  });

  it('never throws, and survives cycles and very deep trees', () => {
    const a: Record<string, unknown> = { x: num(1) };
    a.self = a;
    expect(checkValues(a)).toEqual([]);
    let deep: unknown = num(Number.NaN);
    for (let i = 0; i < 100; i++) deep = [deep];
    expect(checkValues(deep).length).toBe(1);
    const hostile = {
      get boom() {
        throw new Error('getter');
      },
    };
    expect(() => checkValues(hostile)).not.toThrow();
    expect(checkValues(hostile)).toEqual(['view: unreadable']);
  });
});
