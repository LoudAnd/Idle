// GDD §20.2, ROADMAP M4 (jsdom): offline catch-up runs behind the progress modal, then the
// While-away modal shows the before and after values of x and of each generator (owned or
// revealed); Close takes the focus, and Escape closes it and returns the focus.
import { act, cleanup, fireEvent, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { formatNum } from '../../src/engine/format.ts';
import { previewSum } from '../../src/engine/integrate.ts';
import { advance as advanceGame } from '../../src/engine/offline.ts';
import { encodeSave } from '../../src/engine/save/envelope.ts';
import { makeState } from '../../src/engine/state.ts';
import type { GameState } from '../../src/engine/state.ts';
import { KEYS } from '../../src/platform/storage.ts';
import { NOTATION_TABLES, STRINGS } from '../../src/ui/strings.ts';
import { createStorageArea } from '../unit/support/fakeStorage.ts';
import { META } from '../unit/support/invalidSaves.ts';
import { WALL_T0, createFakeWall, setupApp, shown } from './support/app.tsx';
import type { FakeClock } from './support/fakeClock.ts';

afterEach(() => {
  cleanup();
});

const HOUR_MS = 3_600_000;
const away = makeState({
  x: 1e4,
  amounts: [500, 40, 3],
  bought: [21, 12, 3],
  globalLevel: 2,
  pendingMs: 350,
});

/** Runs frames (inside act, so promises settle) until the catch-up is over. */
async function finishCatchUp(clock: FakeClock, done: () => boolean): Promise<void> {
  for (let i = 0; i < 400 && !done(); i++) {
    await act(async () => {
      clock.frame(16);
    });
  }
}

function storedAway(maxSeenAt: number, game: GameState = away) {
  const area = createStorageArea();
  const onboarding = {
    revealed: ['global', 'maxAll', 'tier.2', 'tier.3', 'tier.4'],
    done: ['goal.g2', 'goal.g3', 'goal.g4'],
    visited: ['sum'],
  };
  area.data.set(KEYS.meta, JSON.stringify({ active: 'a', seq: 1, owner: null }));
  area.data.set(
    KEYS.a,
    encodeSave({ game, onboarding }, { ...META, savedAt: maxSeenAt, maxSeenAt }).blob,
  );
  return area;
}

const fmt = (v: Parameters<typeof formatNum>[0]) => formatNum(v, NOTATION_TABLES);

describe('While away (GDD §20.2)', () => {
  it('a catch-up runs behind the progress modal, then the summary', async () => {
    const area = storedAway(WALL_T0 - 2 * HOUR_MS);
    const { clock, container, session } = setupApp(undefined, {
      storage: area.connect(),
      wall: createFakeWall(WALL_T0),
    });
    const progress = screen.getByRole('dialog', { name: STRINGS['away.progress'] });
    expect(progress.getAttribute('aria-modal')).toBe('true');
    expect(progress.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('0');
    // Every game control is disabled behind it.
    for (const b of container.querySelectorAll<HTMLButtonElement>('[data-tab] button')) {
      expect(b.disabled).toBe(true);
    }
    await finishCatchUp(clock, () => session!.view().catchUp === null);
    expect(screen.queryByRole('dialog', { name: STRINGS['away.progress'] })).toBeNull();
    expect(screen.getByRole('dialog', { name: STRINGS['away.title'] })).toBeTruthy();
  });

  it('the While-away modal shows before and after values for x and each generator', async () => {
    const area = storedAway(WALL_T0 - 2 * HOUR_MS);
    const { clock, session, loop } = setupApp(undefined, {
      storage: area.connect(),
      wall: createFakeWall(WALL_T0),
    });
    await finishCatchUp(clock, () => session!.view().catchUp === null);
    const dialog = screen.getByRole('dialog', { name: STRINGS['away.title'] });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.querySelector('[data-away-time]')?.textContent).toBe('+2h');
    const before = previewSum(away);
    const after = advanceGame(away, 7200).sum;
    const cells = (row: string) => {
      const tr = dialog.querySelector(`tr[data-row="${row}"]`);
      if (tr === null) throw new Error(`no row ${row}`);
      return [shown(tr.querySelector('[data-before]')), shown(tr.querySelector('[data-after]'))];
    };
    expect(cells('x')).toEqual([fmt(before.x), fmt(after.x)]);
    expect(cells('x')[0]).not.toBe(cells('x')[1]);
    // G1–G3 owned, G4 revealed before, and whatever x revealed while away; nothing else.
    const revealed = loop.view()!.revealed;
    const expected = [1, 2, 3, 4, 5, 6, 7, 8].filter(
      (k) => k <= 4 || revealed.includes(`tier.${k}` as (typeof revealed)[number]),
    );
    const rows = [...dialog.querySelectorAll('tr[data-row^="g"]')].map((r) =>
      Number(r.getAttribute('data-row')!.slice(1)),
    );
    expect(rows).toEqual(expected);
    expect(rows.length).toBeLessThan(8);
    for (const k of expected) {
      expect(cells(`g${k}`)).toEqual([fmt(before.amounts[k - 1]!), fmt(after.amounts[k - 1]!)]);
    }
    // The headers are the chrome labels.
    expect(dialog.textContent).toContain(STRINGS['away.before']);
    expect(dialog.textContent).toContain(STRINGS['away.after']);
    // Close is focused, and closes it.
    const close = screen.getByRole('button', { name: STRINGS.close });
    expect(document.activeElement).toBe(close);
    fireEvent.click(close);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Escape closes it and returns the focus', async () => {
    const { clock, container, session } = setupApp(
      makeState({ x: 10, amounts: [1], bought: [1] }),
      {
        wall: createFakeWall(WALL_T0),
      },
    );
    const buy = container.querySelector<HTMLButtonElement>('[data-settings]')!;
    buy.focus();
    expect(document.activeElement).toBe(buy);
    // A 2 h gap during the session (a suspended laptop).
    await act(async () => {
      clock.frame(2 * HOUR_MS);
    });
    await finishCatchUp(clock, () => session!.view().catchUp === null);
    const dialog = screen.getByRole('dialog', { name: STRINGS['away.title'] });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: STRINGS.close }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(dialog.isConnected).toBe(false);
    expect(document.activeElement).toBe(buy);
  });

  it('less than 60 s away shows no modal', async () => {
    const area = storedAway(WALL_T0 - 30_000);
    const { clock, session } = setupApp(undefined, {
      storage: area.connect(),
      wall: createFakeWall(WALL_T0),
    });
    await finishCatchUp(clock, () => session!.view().catchUp === null);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
