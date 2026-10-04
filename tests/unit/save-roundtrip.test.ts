// @vitest-environment node
// ROADMAP M4, GDD §20.1, §21.2: save then load gives byte-identical serialized state for 100
// random reachable states (and the same onboarding ids and the same re-encoded blob), and the
// same action log gives the same save bytes.
import { describe, expect, it } from 'vitest';
import { checkSave } from '../../src/engine/invariants.ts';
import { decodeSave, encodeSave } from '../../src/engine/save/envelope.ts';
import { serializeState } from '../../src/engine/state.ts';
import { tick } from '../../src/engine/tick.ts';
import { runBot } from '../../src/sim/bot.ts';
import { FC_SEED } from './support/arbitraries.ts';
import { META } from './support/invalidSaves.ts';
import { reachableStates } from './support/states.ts';

describe('save round trip (GDD §20.1)', () => {
  it(
    'save then load gives byte-identical serialized state for 100 random reachable states',
    { timeout: 60_000 },
    () => {
      const saves = reachableStates(100, FC_SEED);
      let tiersOwned = 0;
      for (const save of saves) {
        expect(checkSave(save)).toEqual([]);
        const { blob } = encodeSave(save, META);
        const r = decodeSave(blob);
        expect(r.kind).toBe('ok');
        if (r.kind !== 'ok') continue;
        expect(serializeState(r.save.game)).toBe(serializeState(save.game));
        expect(r.save.onboarding).toEqual(save.onboarding);
        expect(encodeSave(r.save, r.meta).blob).toBe(blob);
        // The loaded state plays on exactly like the original.
        expect(serializeState(tick(r.save.game, [{ type: 'maxAll' }]))).toBe(
          serializeState(tick(save.game, [{ type: 'maxAll' }])),
        );
        tiersOwned = Math.max(tiersOwned, save.game.sum.bought.filter((b) => b > 0).length);
      }
      // The sample is not trivial: some state owns at least 5 tiers, some has pending time.
      expect(tiersOwned).toBeGreaterThanOrEqual(5);
      expect(saves.some((s) => s.game.pendingMs > 0)).toBe(true);
      expect(saves.some((s) => s.onboarding.done.length > 0)).toBe(true);
    },
  );

  it('the same action log gives the same save bytes (GDD §21.2)', { timeout: 30_000 }, () => {
    const a = runBot({ profile: 'active', seed: 3, seconds: 400 });
    const b = runBot({ profile: 'active', seed: 3, seconds: 400 });
    const save = (s: typeof a.final) => ({
      game: s,
      onboarding: { revealed: [], done: [], visited: ['sum'] },
    });
    expect(encodeSave(save(a.final), META).blob).toBe(encodeSave(save(b.final), META).blob);
  });
});
