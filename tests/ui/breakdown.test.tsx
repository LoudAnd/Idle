// GDD §17.4, §18 (jsdom): the ×m trigger opens the breakdown of its row: one row per factor
// with its formatted value, then = ×m and = rate, which equal the row's multiplier and
// production cells. Escape (or Close) closes it and returns the focus to the trigger; a press
// outside closes it without moving the focus. It is a dismiss layer: with Settings open over
// it, Escape and outside presses go to Settings only, and the breakdown survives Settings.
import { cleanup, fireEvent, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { makeState } from '../../src/engine/state.ts';
import { layerCount } from '../../src/ui/dismiss.ts';
import { fmt } from '../../src/ui/fmt.ts';
import { STRINGS } from '../../src/ui/strings.ts';
import { fill } from '../../src/ui/tpl.ts';
import { setupApp, shown } from './support/app.tsx';

afterEach(() => {
  cleanup();
  // Every panel removed its dismiss layer when it unmounted.
  expect(layerCount()).toBe(0);
});

const panel = (c: Element) => c.querySelector<HTMLElement>('[data-breakdown-panel]');
const settingsPanel = (c: Element) => c.querySelector('[data-settings-panel]');

function trigger(container: Element, tier: number): HTMLButtonElement {
  return container.querySelector<HTMLButtonElement>(
    `tr[data-tier="${tier}"] button[data-breakdown]`,
  )!;
}

describe('breakdown (GDD §17.4)', () => {
  it('renders one row per factor with its formatted value, = ×m and = rate', () => {
    const { container, loop } = setupApp(
      makeState({ x: 10, amounts: [23], bought: [55], globalLevel: 12 }),
    );
    const t = trigger(container, 1);
    expect(t.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(t);
    expect(t.getAttribute('aria-expanded')).toBe('true');
    const panel = container.querySelector('[data-breakdown-panel]')!;
    expect(panel.id).toBe(t.getAttribute('aria-controls'));
    expect(panel.querySelector('h3')?.textContent).toBe(
      fill(STRINGS['breakdown.title'], { name: fill(STRINGS['sum.generator'], { k: 1 }) }),
    );
    expect(panel.querySelector('[data-owned]')?.textContent).toBe('23 owned');
    const rows = [...panel.querySelectorAll('tr[data-factor]')].map((r) => [
      r.querySelector('th')?.textContent,
      shown(r.querySelector('td')),
    ]);
    // Each value with its kind's sign (×v for a multiplier).
    expect(rows).toEqual([
      ['β 2', '×2'],
      ['global 1.15^12', '×5.35'],
      ['A000079 a(5)', '×32'],
    ]);
    const view = loop.view()!.sum.tiers[0];
    expect(panel.querySelector('[data-total]')?.textContent).toBe(`= ×${fmt.format(view.mult)}`);
    expect(panel.querySelector('[data-total-rate]')?.textContent).toBe(
      `= ${fmt.format(view.production)} /s`,
    );
    // ... which are the row's own cells: what is shown is what is computed.
    expect(shown(t.querySelector('.num'))).toBe(fmt.format(view.mult));
    expect(container.querySelector('tr[data-tier="1"] [data-production]')?.textContent).toBe(
      `+${fmt.format(view.production)}/s`,
    );
  });

  it('Escape closes and restores focus to the trigger; Close does too; one breakdown at a time', () => {
    const { container } = setupApp(makeState({ x: '1e10', bought: [1, 1] }));
    const t1 = trigger(container, 1);
    fireEvent.click(t1);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: STRINGS.close }));
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(container.querySelector('[data-breakdown-panel]')).toBeNull();
    expect(document.activeElement).toBe(t1);
    expect(t1.getAttribute('aria-expanded')).toBe('false');
    // Opening G2's closes G1's.
    fireEvent.click(t1);
    const t2 = trigger(container, 2);
    fireEvent.click(t2);
    expect(container.querySelectorAll('[data-breakdown-panel]')).toHaveLength(1);
    expect(t1.getAttribute('aria-expanded')).toBe('false');
    expect(t2.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: STRINGS.close }));
    expect(container.querySelector('[data-breakdown-panel]')).toBeNull();
    expect(document.activeElement).toBe(t2);
    // Clicking the trigger again toggles it closed.
    fireEvent.click(t2);
    fireEvent.click(t2);
    expect(container.querySelector('[data-breakdown-panel]')).toBeNull();
  });

  it('stays open while the game runs, and updates its values', () => {
    const { container, advance } = setupApp(makeState({ x: 10, amounts: [1, 1], bought: [1, 1] }));
    fireEvent.click(trigger(container, 1));
    const owned = () => container.querySelector('[data-breakdown-panel] [data-owned]')?.textContent;
    const before = owned();
    advance(2000);
    expect(container.querySelector('[data-breakdown-panel]')).not.toBeNull();
    expect(owned()).not.toBe(before); // A1 grows from G2's production
  });

  it('Escape in Settings closes only Settings: the breakdown under it is still open when Settings closes (also by Close)', () => {
    const { container } = setupApp(makeState({ x: '1e10', bought: [1, 1] }));
    const t1 = trigger(container, 1);
    fireEvent.click(t1);
    const settings = container.querySelector<HTMLButtonElement>('[data-settings]')!;
    // A press on the header's Settings button is not a light dismiss.
    fireEvent.pointerDown(settings);
    fireEvent.click(settings);
    expect(settingsPanel(container)).not.toBeNull();
    const select = container.querySelector<HTMLSelectElement>('select[data-setting="notation"]')!;
    select.focus();
    fireEvent.keyDown(select, { key: 'Escape' });
    expect(settingsPanel(container)).toBeNull();
    expect(document.activeElement).toBe(settings);
    // The breakdown was hidden with its tab, and is shown again as it was.
    expect(panel(container)).not.toBeNull();
    expect(container.querySelector<HTMLElement>('[data-tab]')?.hidden).toBe(false);
    expect(t1.getAttribute('aria-expanded')).toBe('true');
    // Close works the same way.
    fireEvent.click(settings);
    fireEvent.click(settingsPanel(container)!.querySelector('[data-close]')!);
    expect(panel(container)).not.toBeNull();
    // Now the breakdown is on top again: Escape closes it and returns the focus to its trigger.
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(panel(container)).toBeNull();
    expect(document.activeElement).toBe(t1);
  });

  it('a press outside the panel and its trigger closes it (light dismiss) without moving the focus; inside, on the trigger or under Settings it does not', () => {
    const { container } = setupApp(makeState({ x: '1e10', bought: [1, 1] }));
    const t1 = trigger(container, 1);
    fireEvent.click(t1);
    fireEvent.pointerDown(panel(container)!.querySelector('[data-total]')!);
    expect(panel(container)).not.toBeNull();
    fireEvent.pointerDown(t1);
    expect(panel(container)).not.toBeNull();
    // Under Settings, a press anywhere belongs to Settings.
    fireEvent.click(container.querySelector('[data-settings]')!);
    fireEvent.pointerDown(document.body);
    fireEvent.click(settingsPanel(container)!.querySelector('[data-close]')!);
    expect(panel(container)).not.toBeNull();
    // Outside: a buy button of another row. The panel closes, and the click still buys.
    const buy = container.querySelector<HTMLButtonElement>(
      'tr[data-tier="2"] button[data-mode="one"]',
    )!;
    buy.focus();
    fireEvent.pointerDown(buy);
    expect(panel(container)).toBeNull();
    expect(document.activeElement).toBe(buy);
    expect(t1.getAttribute('aria-expanded')).toBe('false');
  });
});
