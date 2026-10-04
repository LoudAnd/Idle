// GDD §5, §17, §22 item 5 (jsdom): the first playable screen. Clicking Buy on G1 in a new game
// buys it; a second later x has grown and nothing renders NaN.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodeNum, num } from '../../src/engine/num.ts';
import type { Action } from '../../src/engine/actions.ts';
import { LAMBDA_ANUMBER } from '../../src/engine/content/sum.ts';
import { previewSum } from '../../src/engine/integrate.ts';
import { checkInvariants } from '../../src/engine/invariants.ts';
import { makeState } from '../../src/engine/state.ts';
import type { GameState } from '../../src/engine/state.ts';
import { tierPrice, totalCost } from '../../src/engine/systems/sum.ts';
import { createGameLoop } from '../../src/platform/loop.ts';
import type { GameLoop } from '../../src/platform/loop.ts';
import { App } from '../../src/ui/App.tsx';
import { Num } from '../../src/ui/Num.tsx';
import { fmt } from '../../src/ui/fmt.ts';
import { STRINGS } from '../../src/ui/strings.ts';
import { fill } from '../../src/ui/tpl.ts';
import { buildSumView, checkSumView } from '../../src/ui/sum/view.ts';
import type { SumView } from '../../src/ui/sum/view.ts';
import { createFakeClock } from './support/fakeClock.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function setup(initial?: GameState) {
  const clock = createFakeClock();
  const loop = createGameLoop({ clock, derive: buildSumView, checkView: checkSumView, initial });
  const onReload = vi.fn();
  const r = render(<App loop={loop} onReload={onReload} />);
  act(() => loop.start());
  const advance = (ms: number) => act(() => clock.advance(ms));
  return { ...r, clock, loop, advance, onReload };
}

/** The visible text of a number cell (without the screen-reader form). */
function shown(el: Element | null): string {
  if (el === null) throw new Error('missing element');
  const visible = el.querySelector('[aria-hidden="true"]');
  return (visible ?? el).textContent ?? '';
}

function row(container: Element, tier: number): Element {
  const el = container.querySelector(`tr[data-tier="${tier}"]`);
  if (el === null) throw new Error(`no row for G${tier}`);
  return el;
}

function button(container: Element, selector: string): HTMLButtonElement {
  const el = container.querySelector<HTMLButtonElement>(selector);
  if (el === null) throw new Error(`no button ${selector}`);
  return el;
}

const FORBIDDEN = /NaN|Infinity|undefined|—/;

describe('Sum tab (jsdom)', () => {
  it('clicking Buy on G1 in a new game leaves x = 0, b1 = 1 and A1 = 1; one second later x > 0 and no value is NaN', () => {
    const logged = vi.spyOn(console, 'error');
    const { container, loop, advance } = setup();
    const header = () => shown(container.querySelector('[data-x]'));
    expect(header()).toBe('10');
    fireEvent.click(button(container, '[data-tier="1"] button[data-mode="one"]'));
    advance(50);
    const s = loop.state();
    // The committed state: the purchase spent x exactly (GDD §5.4).
    expect(encodeNum(s.sum.x)).toEqual([0, 0, 0]);
    expect(s.sum.bought[0]).toBe(1);
    expect(s.sum.amounts[0].toNumber()).toBe(1);
    // What the player sees: the purchase already produced during its own tick (§21.2), so the
    // header shows the preview at the 50 ms pending, 1 · 2 · 0.05 = 0.100, not 0 (§5.5).
    expect(s.pendingMs).toBe(50);
    expect(header()).toBe(fmt.format(previewSum(s).x));
    expect(header()).toBe('0.100');
    const g1 = row(container, 1);
    expect(shown(g1.querySelector('[data-amount]'))).toBe('1');
    expect(shown(g1.querySelector('[data-bought]'))).toBe('1');
    expect(g1.querySelector('td')?.textContent).toBe(fill(STRINGS['sum.amount'], { a: 1, b: 1 }));
    // Between flushes the header grows from the pending time while nothing is committed.
    advance(500);
    expect(loop.state().pendingMs).toBe(550);
    expect(encodeNum(loop.state().sum.x)).toEqual([0, 0, 0]);
    expect(header()).toBe('1.10');
    advance(500);
    expect(loop.state().sum.x.gt(0)).toBe(true);
    expect(Number(header())).toBeGreaterThan(0);
    expect(checkInvariants(loop.state())).toEqual([]);
    expect(loop.hub.fault).toBeNull();
    // The tab still renders (a NaN would have thrown into its boundary, not printed "NaN").
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelectorAll('tr[data-tier]')).toHaveLength(8);
    expect(shown(row(container, 1).querySelector('[data-amount]'))).toBe('1');
    expect(logged).not.toHaveBeenCalled();
    expect(container.textContent).not.toMatch(FORBIDDEN);
  });

  it('renders 8 generator rows with their labels, the global row and Max all', () => {
    const { container } = setup();
    const rows = container.querySelectorAll('tr[data-tier]');
    expect(rows).toHaveLength(8);
    rows.forEach((r, i) => {
      expect(r.getAttribute('data-tier')).toBe(String(i + 1));
      expect(r.querySelector('th')?.textContent).toBe(fill(STRINGS['sum.generator'], { k: i + 1 }));
      expect(r.textContent).toContain(STRINGS['sum.buy1']);
      expect(r.textContent).toContain(STRINGS['sum.until10']);
      expect(r.textContent).toContain(STRINGS['sum.max']);
    });
    expect(container.querySelector('tr[data-global] th')?.textContent).toBe(STRINGS['sum.global']);
    expect(button(container, 'button[data-mode="maxAll"]').textContent).toBe(STRINGS['sum.maxAll']);
    // A new game: G1's Buy 1 shows its cost (10) and is the only affordable purchase.
    const buy1 = button(container, '[data-tier="1"] button[data-mode="one"]');
    expect(buy1.disabled).toBe(false);
    expect(buy1.textContent).toContain('10');
    expect(button(container, '[data-tier="2"] button[data-mode="one"]').disabled).toBe(true);
    expect(button(container, 'tr[data-global] button[data-mode="one"]').disabled).toBe(true);
    expect(container.textContent).not.toMatch(FORBIDDEN);
  });

  it('each button enqueues the right action', () => {
    const clock = createFakeClock();
    const loop = createGameLoop({
      clock,
      derive: buildSumView,
      checkView: checkSumView,
      initial: makeState({ x: '1e40' }),
    });
    const sent: Action[] = [];
    const spy: GameLoop<SumView> = {
      hub: loop.hub,
      get running() {
        return loop.running;
      },
      state: loop.state,
      view: loop.view,
      subscribe: loop.subscribe,
      enqueue: (a) => sent.push(a),
      start: loop.start,
      stop: loop.stop,
    };
    const { container: c } = render(<App loop={spy} onReload={() => {}} />);
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
    const { container, loop, advance } = setup(makeState({ x: '1e30', bought: [7] }));
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
    const { container, loop, advance } = setup(makeState({ x: '1e35' }));
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
    const { container } = setup();
    const heads = [...container.querySelectorAll('thead th[scope="col"]')].map(
      (h) => h.textContent,
    );
    expect(heads).toHaveLength(3);
    expect(heads[0]).toBe(STRINGS['sum.col.amount']);
    expect(heads[1]).toBe(STRINGS['sum.col.mult']);
    expect(heads[2]).toContain(STRINGS['sum.col.cost']);
    const cite = container.querySelector('[data-cite]')?.textContent;
    expect(cite).toBe(fill(STRINGS['sum.cite.lambda'], { a: LAMBDA_ANUMBER }));
    expect(cite).toContain('A000124');
    expect(container.querySelector('tr[data-global]')?.textContent).toContain(
      fill(STRINGS['sum.level'], { l: 0 }),
    );
  });

  it('every buy button is named after its row', () => {
    setup(makeState({ x: '1e9' }));
    const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-labelledby'));
    expect(new Set(names).size).toBe(names.length); // no two buttons share a name source
    const g3 = fill(STRINGS['sum.generator'], { k: 3 });
    expect(screen.getByRole('button', { name: `${g3} ${STRINGS['sum.max']}` })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: `${g3} ${STRINGS['sum.buy1']} · 10,000` }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: `${STRINGS['sum.global']} ${STRINGS['sum.max']}` }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: STRINGS['sum.maxAll'] })).toBeTruthy();
    // Nine Max buttons, nine different names.
    const maxes = screen.getAllByRole('button', { name: new RegExp(` ${STRINGS['sum.max']}$`) });
    expect(maxes).toHaveLength(9);
  });

  it('numbers carry their spoken form for screen readers', () => {
    const { container } = setup(makeState({ x: '1.23e45' }));
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
