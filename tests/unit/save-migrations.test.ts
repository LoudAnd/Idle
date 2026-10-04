// @vitest-environment node
// GDD §20.1: `MIGRATIONS[i]` turns version i + 1 into i + 2, so there are SAVE_VERSION − 1 of
// them; one frozen fixture per shipped version (tests/fixtures/saves/vN.json), each of which
// migrates and validates; the fixtures never change (their sha256 is pinned here).
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeSaveJson, encodeSave } from '../../src/engine/save/envelope.ts';
import {
  MIGRATIONS,
  SAVE_FORMAT,
  SAVE_VERSION,
  migrate,
} from '../../src/engine/save/migrations.ts';
import type { Migration } from '../../src/engine/save/migrations.ts';
import { validate } from '../../src/engine/save/validate.ts';

const DIR = join(__dirname, '..', 'fixtures', 'saves');
const fixtures = readdirSync(DIR)
  .filter((f) => /^v\d+\.json$/.test(f))
  .sort();

/** The sha256 of every frozen fixture: a later edit of one fails here. */
const PINNED: Readonly<Record<string, string>> = {
  'v1.json': '57106e64904c1417a64dd3ed9c9ea254607212baad34bd59f2059dcb021774a4',
};

describe('save migrations (GDD §20.1)', () => {
  it('MIGRATIONS.length === SAVE_VERSION − 1', () => {
    expect(MIGRATIONS.length).toBe(SAVE_VERSION - 1);
    expect(Object.isFrozen(MIGRATIONS)).toBe(true);
    expect(SAVE_FORMAT).toBe(1);
  });

  it('v1.json exists, with one vN.json for each N in 1…SAVE_VERSION', () => {
    expect(fixtures).toContain('v1.json');
    expect(fixtures).toEqual(Array.from({ length: SAVE_VERSION }, (_, i) => `v${i + 1}.json`));
  });

  it('the frozen fixtures are unchanged (sha256)', () => {
    for (const f of fixtures) {
      const sha = createHash('sha256')
        .update(readFileSync(join(DIR, f)))
        .digest('hex');
      expect(sha, f).toBe(PINNED[f]);
    }
  });

  it.each(fixtures)('%s migrates and validates', (f) => {
    const text = readFileSync(join(DIR, f), 'utf8');
    const r = decodeSaveJson(text);
    expect(r.kind, JSON.stringify(r)).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.from).toBe(Number(/\d+/.exec(f)![0]));
    // v1 is the current version: it re-encodes to its own bytes.
    if (r.from === SAVE_VERSION) expect(encodeSave(r.save, r.meta).json + '\n').toBe(text);
    // A non-trivial state: G1–G5 owned, a global level, pending time, reveals and goals.
    expect(r.save.game.sum.bought.filter((b) => b > 0).length).toBeGreaterThanOrEqual(5);
    expect(r.save.game.sum.globalLevel).toBeGreaterThan(0);
    expect(r.save.game.pendingMs).toBeGreaterThan(0);
    expect(r.save.onboarding.revealed.length).toBeGreaterThan(0);
    expect(r.save.onboarding.done.length).toBeGreaterThan(0);
  });

  it('migrate applies the chain in order, and a migration that throws is an error', () => {
    const add =
      (field: string): Migration =>
      (env) => ({
        ...env,
        saveVersion: (env.saveVersion as number) + 1,
        [field]: true,
      });
    const chain = [add('two'), add('three')];
    const r = migrate({ format: 1, saveVersion: 1 }, chain, 3);
    expect(r).toEqual({
      kind: 'ok',
      env: { format: 1, saveVersion: 3, two: true, three: true },
      from: 1,
    });
    const input = Object.freeze({ format: 1, saveVersion: 2 });
    expect(migrate(input, chain, 3)).toMatchObject({ kind: 'ok', from: 2 });
    expect(input).toEqual({ format: 1, saveVersion: 2 }); // inputs are never changed
    const boom: Migration = () => {
      throw new Error('boom');
    };
    expect(migrate({ format: 1, saveVersion: 1 }, [boom], 2)).toEqual({
      kind: 'error',
      problem: 'migration: boom',
    });
    expect(migrate({ format: 1, saveVersion: 1 }, [], 2)).toEqual({
      kind: 'error',
      problem: 'no migration from v1',
    });
  });

  it('a newer version or format is newer; a bad version is an error', () => {
    expect(migrate({ format: 1, saveVersion: SAVE_VERSION + 1 })).toEqual({
      kind: 'newer',
      saveVersion: SAVE_VERSION + 1,
    });
    expect(migrate({ format: SAVE_FORMAT + 1 })).toMatchObject({ kind: 'newer' });
    for (const v of [0, -1, 1.5, '1', null, undefined]) {
      expect(migrate({ format: 1, saveVersion: v }).kind).toBe('error');
    }
    expect(migrate([])).toEqual({ kind: 'error', problem: 'envelope: not an object' });
    // Migration never validates: that is validate()'s job, after it.
    const m = migrate({ format: 1, saveVersion: 1 });
    expect(m.kind).toBe('ok');
    if (m.kind === 'ok') expect(validate(m.env).length).toBeGreaterThan(0);
  });
});
