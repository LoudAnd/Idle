// @vitest-environment node
// GDD §21.8: the test-only effect hook (`installTestEffect` in src/engine/effects.ts) is used by
// tests only. Nothing else in src/ references it, so production code cannot inject an effect
// and the app bundle tree-shakes it (like the bench-only op counter, tests/arch/num.test.ts).
import { describe, expect, it } from 'vitest';
import { describeViolations, loadFixture, loadSources, scanTestHooks } from './lib/scan.ts';

const src = loadSources('src');

describe('test-only hooks', () => {
  it('nothing in src except effects.ts references installTestEffect', () => {
    const vs = scanTestHooks(src);
    expect(vs, describeViolations(vs)).toEqual([]);
    // ... and effects.ts really defines it (the rule is not vacuous).
    const effects = src.find((f) => f.path === 'src/engine/effects.ts')!;
    expect(scanTestHooks([{ ...effects, path: 'src/engine/other.ts' }]).length).toBeGreaterThan(0);
  });

  it('flags engine/test-effect.ts as test-hook', () => {
    const vs = scanTestHooks([loadFixture('engine/test-effect.ts', 'src/ui/x.ts')]);
    expect(vs.map((v) => v.rule)).toEqual(['test-hook', 'test-hook']);
  });

  it('does not flag num/allowed.ts', () => {
    expect(scanTestHooks([loadFixture('num/allowed.ts', 'src/ui/x.ts')])).toEqual([]);
  });
});
