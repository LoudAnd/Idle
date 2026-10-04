// @vitest-environment node
// GDD §21.9: the dev hooks exist only in development and playtest builds. Only src/main.tsx
// imports platform/devhooks.ts, dynamically, inside the environment guard; the marker string
// that tests/build/bundle.test.ts greps the production build for appears only in devhooks.ts.
// Each rule is proven against a planted fixture.
import { describe, expect, it } from 'vitest';
import { DEV_HOOK_MARKER } from '../../src/platform/devhooks.ts';
import { ENTRY, MARKER, scanDevHooks } from './lib/devhooks.ts';
import { describeViolations, loadFixture, loadSources } from './lib/scan.ts';

const src = loadSources('src');

describe('dev hooks (GDD §21.9)', () => {
  it('src/ passes: the marker only in devhooks.ts, the import only in main.tsx inside the guard', () => {
    expect(MARKER).toBe(DEV_HOOK_MARKER);
    const vs = scanDevHooks(src);
    expect(vs, describeViolations(vs)).toEqual([]);
    // The scan sees the real import (it is not vacuous).
    const main = src.find((f) => f.path === ENTRY)!;
    expect(main.source).toContain("import('./platform/devhooks.ts')");
    expect(src.map((f) => f.path)).toContain('src/platform/devhooks.ts');
  });

  it('the guarded dynamic import in main.tsx is allowed (devhooks/allowed.tsx)', () => {
    expect(scanDevHooks([loadFixture('devhooks/allowed.tsx', ENTRY)])).toEqual([]);
  });

  it.each([
    ['devhooks/static-import.tsx', ENTRY],
    ['devhooks/unguarded.tsx', ENTRY],
    ['devhooks/wrong-guard.tsx', ENTRY],
    ['devhooks/allowed.tsx', 'src/ui/App.tsx'],
  ])('flags %s as %s', (fixture, at) => {
    const vs = scanDevHooks([loadFixture(fixture, at)]);
    expect(vs.map((v) => v.rule)).toEqual(['devhooks-import']);
  });

  it('flags the marker outside devhooks.ts (devhooks/marker.ts)', () => {
    const vs = scanDevHooks([loadFixture('devhooks/marker.ts', 'src/ui/x.ts')]);
    expect(vs.map((v) => v.rule)).toEqual(['devhooks-marker']);
    expect(scanDevHooks([loadFixture('devhooks/marker.ts', 'src/platform/devhooks.ts')])).toEqual(
      [],
    );
  });
});
