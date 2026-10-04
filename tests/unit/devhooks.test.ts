// GDD §21.9: the dev hooks `?fixture=<name>&speed=<n>`: the query is parsed (fixture names
// [a-z0-9-]+, speed clamped to 1–1000), every committed fixture loads and validates through the
// normal save pipeline, and the speed scales the frame clock only. (Vitest runs with
// import.meta.env.DEV true, the condition under which main.tsx loads this module.)
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { log10Floor1 } from '../../src/engine/num.ts';
import { decodeSaveJson } from '../../src/engine/save/envelope.ts';
import {
  DEV_HOOK_MARKER,
  devFixtureNames,
  loadDevFixture,
  markDevHooks,
  readDevHooks,
  scaledClock,
} from '../../src/platform/devhooks.ts';
import { createFakeClock } from '../ui/support/fakeClock.ts';

const DIR = join(__dirname, '..', 'fixtures', 'dev');

describe('dev hooks (GDD §21.9)', () => {
  it('vitest runs with DEV true', () => {
    expect(import.meta.env.DEV).toBe(true);
  });

  it('parses the query: fixture names and a clamped speed', () => {
    expect(readDevHooks('')).toBeNull();
    expect(readDevHooks('?other=1')).toBeNull();
    expect(readDevHooks('?fixture=late-sum&speed=100')).toEqual({
      fixture: 'late-sum',
      speed: 100,
    });
    expect(readDevHooks('?fixture=late-sum')).toEqual({ fixture: 'late-sum', speed: 1 });
    expect(readDevHooks('?speed=5000')).toEqual({ fixture: null, speed: 1000 });
    expect(readDevHooks('?speed=0.1')).toEqual({ fixture: null, speed: 1 });
    expect(readDevHooks('?speed=abc')).toEqual({ fixture: null, speed: 1 });
    expect(readDevHooks('?speed=2.5')).toEqual({ fixture: null, speed: 2.5 });
    for (const bad of ['../x', 'Late', 'a b', 'a/b', '']) {
      expect(readDevHooks(`?fixture=${encodeURIComponent(bad)}`)?.fixture).toBeNull();
    }
  });

  it('every committed dev fixture loads, migrates and validates', async () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith('.json'));
    expect(devFixtureNames()).toEqual(files.map((f) => f.replace(/\.json$/, '')).sort());
    expect(devFixtureNames()).toEqual(['late-sum', 'mid-sum', 'new-game', 'pre-product']);
    for (const name of devFixtureNames()) {
      const text = await loadDevFixture(name);
      expect(text).toBe(readFileSync(join(DIR, `${name}.json`), 'utf8'));
      const r = decodeSaveJson(text!);
      expect(r.kind, name).toBe('ok');
    }
    expect(await loadDevFixture('missing')).toBeNull();
    expect(await loadDevFixture('../../package')).toBeNull();
  });

  it('the fixtures have their documented shapes', async () => {
    const load = async (n: string) => {
      const r = decodeSaveJson((await loadDevFixture(n))!);
      if (r.kind !== 'ok') throw new Error(n);
      return r.save.game;
    };
    const owned = (s: Awaited<ReturnType<typeof load>>) => s.sum.bought.filter((b) => b > 0).length;
    expect(owned(await load('new-game'))).toBe(0);
    expect(owned(await load('mid-sum'))).toBeGreaterThanOrEqual(4);
    const pre = await load('pre-product');
    expect(log10Floor1(pre.sum.x)).toBeGreaterThan(127 * Math.log10(2));
    expect(log10Floor1(pre.sum.x)).toBeLessThan(128 * Math.log10(2));
    const late = await load('late-sum');
    expect(owned(late)).toBe(8);
    expect(log10Floor1(late.sum.x)).toBeGreaterThanOrEqual(100);
    expect(log10Floor1(late.sum.x)).toBeLessThan(101);
  });

  it('scaledClock runs n times faster from its creation; frames pass through', () => {
    const base = createFakeClock(1000);
    const fast = scaledClock(base, 100);
    expect(fast.now()).toBe(1000);
    base.advance(50);
    expect(fast.now()).toBe(1000 + 5000);
    let ran = 0;
    fast.requestFrame(() => ran++);
    expect(base.pendingFrames).toBe(1);
    base.frame(16);
    expect(ran).toBe(1);
  });

  it('marks the page', () => {
    markDevHooks(document);
    expect(document.documentElement.dataset.devHooks).toBe(DEV_HOOK_MARKER);
    delete document.documentElement.dataset.devHooks;
  });
});
