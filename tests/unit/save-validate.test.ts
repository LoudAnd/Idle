// @vitest-environment node
// GDD §20.1: `validate()` reports and never repairs. A NaN, infinite, negative or wrong-typed
// field, a missing field, an unknown key or an unknown id makes the save invalid (one fixture
// each); the input is never changed; it never throws, whatever it is given.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { validate } from '../../src/engine/save/validate.ts';
import { FC_SEED } from './support/arbitraries.ts';
import { INVALID_CASES, invalidEnvelope, validEnvelope } from './support/invalidSaves.ts';

function deepFreeze<T>(v: T): T {
  if (typeof v === 'object' && v !== null) {
    for (const k of Object.keys(v)) deepFreeze((v as Record<string, unknown>)[k]);
    Object.freeze(v);
  }
  return v;
}

describe('validate() (GDD §20.1)', () => {
  it('a valid envelope has no problems', () => {
    expect(validate(validEnvelope())).toEqual([]);
  });

  it.each(INVALID_CASES.map(([name]) => name))(
    'rejects a blob with a %s field and leaves its input unchanged',
    (name) => {
      const env = invalidEnvelope(name);
      const before = structuredClone(env);
      deepFreeze(env);
      const problems = validate(env);
      expect(problems.length, name).toBeGreaterThan(0);
      expect(problems.join('\n')).not.toContain('unreadable');
      // Nothing was repaired: the input is exactly what it was.
      expect(env).toEqual(before);
    },
  );

  it('names the offending field', () => {
    expect(validate(invalidEnvelope('NaN'))).toEqual(['state.sum.x: not a canonical Num code']);
    expect(validate(invalidEnvelope('negative'))).toEqual([
      'state.sum.amounts[0]: not finite and ≥ 0',
    ]);
    expect(validate(invalidEnvelope('missing'))).toEqual(['state.sum.globalLevel: missing']);
    expect(validate(invalidEnvelope('unknown key'))).toEqual(['state."extra": unknown key']);
    expect(validate(invalidEnvelope('unknown id'))).toEqual([
      'state.onboarding.revealed[7]: unknown id',
    ]);
    expect(validate(invalidEnvelope('wrong type'))).toEqual([
      'state.sum.bought[2]: not an integer in [0, 2^53] (a string)',
    ]);
  });

  it('every envelope key is required, and so is every state key', () => {
    for (const k of Object.keys(validEnvelope())) {
      const env = validEnvelope();
      delete env[k];
      expect(validate(env), k).toContain(`envelope.${k}: missing`);
    }
    for (const k of Object.keys(validEnvelope().state)) {
      const env = validEnvelope();
      delete env.state[k];
      expect(validate(env), k).toContain(`state.${k}: missing`);
    }
  });

  it('never throws on fc.anything(), and anything that is not an envelope is invalid', () => {
    fc.assert(
      fc.property(fc.anything(), (v) => {
        const problems = validate(v);
        expect(problems.length).toBeGreaterThan(0);
      }),
      { seed: FC_SEED, numRuns: 2000 },
    );
  });

  it('never throws on a valid envelope with one random subtree replaced', () => {
    const paths = [
      ['state'],
      ['state', 'sum'],
      ['state', 'sum', 'x'],
      ['state', 'sum', 'amounts'],
      ['state', 'sum', 'amounts', 3],
      ['state', 'sum', 'bought'],
      ['state', 'onboarding'],
      ['state', 'onboarding', 'visited'],
      ['savedAt'],
    ] as const;
    fc.assert(
      fc.property(fc.constantFrom(...paths), fc.anything(), (path, v) => {
        const env = validEnvelope();
        let o: any = env;
        for (const k of path.slice(0, -1)) o = o[k];
        o[path[path.length - 1]!] = v;
        expect(() => validate(env)).not.toThrow();
      }),
      { seed: FC_SEED, numRuns: 2000 },
    );
  });

  it('a getter that throws is reported, not thrown', () => {
    const env = validEnvelope();
    Object.defineProperty(env.state, 'time', {
      enumerable: true,
      get() {
        throw new Error('boom');
      },
    });
    expect(validate(env)).toContain('envelope: unreadable');
  });
});
