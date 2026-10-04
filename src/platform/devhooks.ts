/**
 * Development hooks (GDD §21.9): `?fixture=<name>&speed=<n>` loads a committed save from
 * `tests/fixtures/dev/<name>.json` and runs the game clock n times faster (1–1000).
 *
 * This module exists only where `import.meta.env.DEV` is true or the build sets
 * `VITE_DEV_HOOKS=1` (`npm run build:playtest`, which writes `dist-playtest/`): `main.tsx`
 * imports it dynamically inside that guard, so the production `dist/` never contains it
 * (`tests/build/bundle.test.ts` greps every file for `DEV_HOOK_MARKER`, which is written to
 * `<html data-dev-hooks>` at run time, and for the fixtures' content).
 *
 * - A fixture is envelope JSON that goes through the normal migrations and `validate()`, so old
 *   fixtures keep loading. A fixture session uses memory storage (it never overwrites the real
 *   save), gets no offline credit, and stays out of the tab lock.
 * - The speed scales the frame clock of the game loop only; the wall clock (save times, offline
 *   credit) is not scaled.
 */
import type { Clock } from './clock.ts';

/** The marker string; only this file holds it (`tests/arch/devhooks.test.ts`). */
export const DEV_HOOK_MARKER = 'isi-dev-hooks';

export const SPEED_RANGE = Object.freeze({ min: 1, max: 1000 } as const);

export interface DevHooks {
  /** A fixture name (`[a-z0-9-]+`), or `null`. */
  readonly fixture: string | null;
  /** The game clock's speed, 1–1000. */
  readonly speed: number;
}

const FIXTURE_NAME = /^[a-z0-9-]+$/;

/**
 * The hooks of a query string, or `null` when it names none. An invalid fixture name is
 * ignored; the speed is clamped to 1–1000 (default 1; a non-number gives 1).
 */
export function readDevHooks(search: string): DevHooks | null {
  const p = new URLSearchParams(search);
  if (!p.has('fixture') && !p.has('speed')) return null;
  const name = p.get('fixture');
  const raw = Number(p.get('speed') ?? '1');
  const speed = Number.isFinite(raw)
    ? Math.min(SPEED_RANGE.max, Math.max(SPEED_RANGE.min, raw))
    : SPEED_RANGE.min;
  return { fixture: name !== null && FIXTURE_NAME.test(name) ? name : null, speed };
}

/** The committed dev fixtures, loaded on demand (one chunk each, only in hook builds). */
const FIXTURES = import.meta.glob<string>('../../tests/fixtures/dev/*.json', {
  query: '?raw',
  import: 'default',
});

/** The fixture names that exist. */
export function devFixtureNames(): string[] {
  return Object.keys(FIXTURES)
    .map((p) => p.replace(/^.*\//, '').replace(/\.json$/, ''))
    .sort();
}

/** A fixture's envelope JSON, or `null` when there is no such fixture. */
export async function loadDevFixture(name: string): Promise<string | null> {
  if (!FIXTURE_NAME.test(name)) return null;
  const load = FIXTURES[`../../tests/fixtures/dev/${name}.json`];
  if (load === undefined) return null;
  try {
    return await load();
  } catch {
    return null;
  }
}

/** A clock that runs `n` times faster than `base` from the moment it is made. */
export function scaledClock(base: Clock, n: number): Clock {
  const t0 = base.now();
  return {
    now: () => t0 + (base.now() - t0) * n,
    requestFrame: (cb) => base.requestFrame(cb),
    cancelFrame: (id) => base.cancelFrame(id),
  };
}

/** Marks the page as running with dev hooks (`<html data-dev-hooks>`). */
export function markDevHooks(doc: Document): void {
  doc.documentElement.dataset.devHooks = DEV_HOOK_MARKER;
}
