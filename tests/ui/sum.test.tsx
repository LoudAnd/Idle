// GDD §5, §17, §22 item 5 (jsdom): the Sum tab. Clicking Buy on G1 in a new game buys it; a
// second later x has grown and nothing renders NaN. With every row revealed, each button sends
// its action, Until 10 shows the full set's cost, and every button is named after its row.
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodeNum, num } from '../../src/engine/num.ts';
import type { Action } from '../../src/engine/actions.ts';
import { LAMBDA_ANUMBER } from '../../src/engine/content/sum.ts';
import { previewSum } from '../../src/engine/integrate.ts';
import { checkInvariants } from '../../src/engine/invariants.ts';
import { makeState } from '../../src/engine/state.ts';
import { tierPrice, totalCost } from '../../src/engine/systems/sum.ts';
import { App } from '../../src/ui/App.tsx';
import { Num } from '../../src/ui/Num.tsx';
import { fmt } from '../../src/ui/fmt.ts';
import { STRINGS } from '../../src/ui/strings.ts';
import { fill } from '../../src/ui/tpl.ts';
import { button, row, setupApp, shellLoop, shown, spyLoop, tiersShown } from './support/app.tsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const FORBIDDEN = /NaN|Infinity|undefined/;
/** x = 1e30 reveals every row (G8 at half its first cost, 5e28). */
const ALL_REVEALED = '1e30';

describe('Sum tab (jsdom)', () => {
  it('clicking Buy on G1 in a new game leaves x = 0, b1 = 1 and A1 = 1; one second later x > 0 and no value is NaN', () => {
    const logged = vi.spyOn(console, 'error');
    const { container, loop, advance } = setupApp();
    const header = () => shown(container.querySelector('[data-x]'));
    expect(header()).toBe('10');
    fireEvent.click(button(container, '[data-tier="1"] button[data-mode="one"]'));
    advance(50);
    const s = loop.state();
    // The committed state: the purchase spent x exactly (GDD §5.4).
    expect(encodeNum(s.sum.x)).toEqual([0, 0, 0]);
    expect(s.sum.bought[0]).toBe(1);
    expect(s.sum.amounts[0].toNumber()).toBe(1);
    expect(s.pendingMs).toBe(50);
    // The headline updates at most 10 times per second of game time (§4.2): 50 ms after the
    // last update at t = 0 it still shows 10.
    expect(header()).toBe('10');
    // At 100 ms it shows the preview: the purchase produced during its own tick (§21.2), so
    // x = 1 · 2 · 0.1 = 0.200, not 0 (§5.5).
    advance(50);
    expect(header()).toBe(fmt.format(previewSum(loop.state()).x));
    expect(header()).toBe('0.200');
    const g1 = row(container, 1);
    expect(shown(g1.querySelector('[data-amount]'))).toBe('1');
    expect(shown(g1.querySelector('[data-bought]'))).toBe('1');
    expect(g1.querySelector('td.amount')?.textContent).toBe(
      fill(STRINGS['sum.amount'], { a: 1, b: 1 }),
    );
    // Between flushes the header grows from the pending time while nothing is committed.
    advance(450);
    expect(loop.state().pendingMs).toBe(550);
    expect(encodeNum(loop.state().sum.x)).toEqual([0, 0, 0]);
    // The update at 0.5 s (x = 1 · 2 · 0.5 = 1); the next one is due at 0.6 s.
    expect(header()).toBe(fmt.format(num(1)));
    advance(500);
    expect(loop.state().sum.x.gt(0)).toBe(true);
    expect(Number(header())).toBeGreaterThan(0);
    expect(checkInvariants(loop.state())).toEqual([]);
    expect(loop.hub.fault).toBeNull();
    // The tab still renders (a NaN would have thrown into its boundary, not printed "NaN").
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(shown(row(container, 1).querySelector('[data-amount]'))).toBe('1');
    expect(logged).not.toHaveBeenCalled();
    expect(container.textContent).not.toMatch(FORBIDDEN);
  });

  it('with every row revealed: 8 generator rows with their labels, the global row and Max all', () => {
    const { container } = setupApp(
      makeState({ x: ALL_REVEALED, bought: [1, 1, 1, 1, 1, 1, 1, 1] }),
    );
    expect(tiersShown(container)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    container.querySelectorAll('tr[data-tier]').forEach((r, i) => {
      expect(r.querySelector('th')?.textContent).toBe(fill(STRINGS['sum.generator'], { k: i + 1 }));
      expect(r.textContent).toContain(STRINGS['sum.buy1']);
      expect(r.textContent).toContain(STRINGS['sum.until10']);
      expect(r.textContent).toContain(STRINGS['sum.max']);
      expect(r.hasAttribute('data-silhouette')).toBe(false);
    });
    expect(container.querySelector('tr[data-global]')).not.toBeNull();
    expect(container.querySelector('button[data-mode="maxAll"] .label')?.textContent).toBe(
      STRINGS['sum.maxAll'],
    );
    expect(container.textContent).not.toMatch(FORBIDDEN);
  });

  it('each button enqueues the right action', () => {
    const sent: Action[] = [];
    const { container: c } = setupApp(
      makeState({ x: '1e40', bought: [1, 1, 1, 1, 1, 1, 1, 1], globalLevel: 1 }),
      { wrap: (l) => spyLoop(l, sent), start: false },
    );
    fireEvent.click(button(c, '[data-tier="3"] button[data-mode="one"]'));
    fireEvent.click(button(c, '[data-tier="5"] button[data-mode="until10"]'));
    fireEvent.click(button(c, '[data-tier="8"] button[data-mode="max"]'));
    fireEvent.click(button(c, 'tr[data-global] button[data-mode="one"]'));
    fireEvent.click(button(c, 'tr[data-global] button[data-mode="max"]'));
    fireEvent.click(button(c, 'button[data-mode="maxAll"]'));
    expect(sent).toEqual([
      { type: 'buy', tier: 3, mode: 'one' },
      { type: 'buy', tier: 5, mode: 'until10' },
      { type: 'buy', tier: 8, mode: 'max' },
      { type: 'buyGlobal', mode: 'one' },
      { type: 'buyGlobal', mode: 'max' },
      { type: 'maxAll' },
    ]);
  });

  it('Until 10 shows the cost of the full set and buys up to the next multiple of 10', () => {
    const { container, loop, advance } = setupApp(makeState({ x: ALL_REVEALED, bought: [7] }));
    const until = button(container, '[data-tier="1"] button[data-mode="until10"]');
    expect(until.textContent).toContain(STRINGS['sum.until10']);
    // The full set from b = 7: purchases 7, 8 and 9 (GDD §5.4).
    const full = fmt.format(totalCost(tierPrice(1), 7, 3));
    expect(shown(until.querySelector('.cost'))).toContain(full);
    expect(full).not.toBe(fmt.format(totalCost(tierPrice(1), 7, 1)));
    fireEvent.click(until);
    advance(50);
    expect(loop.state().sum.bought[0]).toBe(10);
    expect(loop.state().sum.amounts[0].toNumber()).toBe(3); // A1 grows with the purchases
  });

  it('Max all buys across tiers and global levels, and each tier gains as many as it bought', () => {
    const { container, loop, advance } = setupApp(makeState({ x: '1e35' }));
    fireEvent.click(button(container, 'button[data-mode="maxAll"]'));
    advance(50);
    const s = loop.state();
    expect(s.sum.bought[7]).toBeGreaterThan(0);
    expect(s.sum.globalLevel).toBeGreaterThan(0);
    // Nothing is committed in the 50 ms since, so A_k is exactly the bulk purchase.
    expect(s.sum.bought.some((b) => b > 1)).toBe(true);
    s.sum.amounts.forEach((a, i) => expect(a.toNumber(), `G${i + 1}`).toBe(s.sum.bought[i]));
    expect(container.textContent).not.toMatch(FORBIDDEN);
  });

  it('labels the columns and cites λ’s A-number', () => {
    const { container } = setupApp(makeState({ x: '1e3', bought: [1], globalLevel: 1 }));
    const heads = [...container.querySelectorAll('thead th[scope="col"]')].map(
      (h) => h.textContent,
    );
    expect(heads).toEqual([
      STRINGS['sum.col.amount'],
      STRINGS['sum.col.step'],
      STRINGS['sum.col.mult'],
      STRINGS['sum.col.rate'],
      expect.stringContaining(STRINGS['sum.col.cost']),
    ]);
    const cite = container.querySelector('[data-cite]')?.textContent;
    expect(cite).toBe(fill(STRINGS['sum.cite.lambda'], { a: LAMBDA_ANUMBER }));
    expect(cite).toContain('A000124');
    expect(container.querySelector('tr[data-global]')?.textContent).toContain(
      fill(STRINGS['sum.level'], { l: 1 }),
    );
  });

  it('the step cell shows the step, the purchases into it and the data horizon (§5.2, §17.3)', () => {
    const { container } = setupApp(makeState({ x: '1e30', bought: [143, 1, 1, 1, 1, 1, 1, 345] }));
    const g1 = row(container, 1);
    expect(g1.querySelector('.step-text')?.textContent).toBe(
      fill(STRINGS['sum.step'], { i: 14, j: 3 }),
    );
    expect(g1.querySelector('[data-term]')?.textContent).toBe('term 14 of 34');
    expect(g1.querySelectorAll('.step-bar [data-on]')).toHaveLength(3);
    // At the horizon the curve stops: step 34 reads "term 34 of 34".
    expect(row(container, 8).querySelector('[data-term]')?.textContent).toBe('term 34 of 34');
  });

  it('every buy button is named after its row, with its cost and status', () => {
    setupApp(makeState({ x: '1e9', bought: [1, 1, 1], globalLevel: 1 }));
    const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-labelledby'));
    const labelled = names.filter((n) => n !== null);
    expect(new Set(labelled).size).toBe(labelled.length); // no two buttons share a name source
    const g3 = fill(STRINGS['sum.generator'], { k: 3 });
    expect(
      screen.getByRole('button', { name: `${g3} ${STRINGS['sum.max']} ${STRINGS['afford.sr']}` }),
    ).toBeTruthy();
    // G3's next purchase (b = 1) costs 10^4.5 = 31,622.78…, shown as 31,622.
    expect(
      screen.getByRole('button', {
        name: `${g3} ${STRINGS['sum.buy1']} · 31,622 ${STRINGS['afford.sr']}`,
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: new RegExp(`^${STRINGS['sum.global']} ${STRINGS['sum.max']} `),
      }),
    ).toBeTruthy();
    // Max all shows its status too (§17.3): ✓, read as "affordable".
    expect(
      screen.getByRole('button', { name: `${STRINGS['sum.maxAll']} ${STRINGS['afford.sr']}` }),
    ).toBeTruthy();
    // One Max per owned tier (G1–G3) plus the global row's, each with its own name.
    const maxes = screen.getAllByRole('button', { name: new RegExp(` ${STRINGS['sum.max']} `) });
    expect(maxes).toHaveLength(4);
    expect(new Set(maxes.map((m) => m.id)).size).toBe(4);
  });

  it('numbers carry their spoken form for screen readers', () => {
    const { container } = setupApp(makeState({ x: '1.23e45' }));
    const x = container.querySelector('[data-x]');
    expect(shown(x)).toBe('1.23e45');
    expect(x?.textContent).toContain('1.23 times ten to the 45');
  });
});

describe('Num (GDD §21.4)', () => {
  it('formats again only when the value changes, not on every render', () => {
    const format = vi.spyOn(fmt, 'format');
    const { rerender, container } = render(<Num value={num(12_345)} />);
    expect(container.textContent).toBe('12,345');
    rerender(<Num value={num(12_345)} />); // a new Num object with the same value
    rerender(<Num value={num(12_345)} />);
    expect(format).toHaveBeenCalledTimes(1);
    rerender(<Num value={num(12_346)} />);
    expect(format).toHaveBeenCalledTimes(2);
    expect(container.textContent).toBe('12,346');
    rerender(<Num value={7} />);
    rerender(<Num value={7} />);
    expect(format).toHaveBeenCalledTimes(3);
  });
});
