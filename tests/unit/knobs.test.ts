// @vitest-environment node
// GDD §14.3: every knob lies within its allowed range (vacuous until M5 adds the first knobs).
import { describe, expect, it } from 'vitest';
import { KNOBS } from '../../src/engine/content/knobs.ts';
import type { KnobDef } from '../../src/engine/content/knobs.ts';

describe('knobs (GDD §14.3)', () => {
  it('every knob is within [min, max] and names its milestone', () => {
    expect(Object.isFrozen(KNOBS)).toBe(true);
    for (const [id, k] of Object.entries(KNOBS) as [string, KnobDef][]) {
      expect(k.min, id).toBeLessThanOrEqual(k.value);
      expect(k.value, id).toBeLessThanOrEqual(k.max);
      expect(k.from, id).toMatch(/^M\d+[a-z]?$/);
    }
  });

  it('keeps the literal knob ids, so a misspelled knob is a compile error (npm run typecheck)', () => {
    // @ts-expect-error: there is no knob with this id
    const missing: unknown = KNOBS.noSuchKnob;
    expect(missing).toBeUndefined();
  });
});
