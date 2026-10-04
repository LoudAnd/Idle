// GDD §17.1–17.4, §19 (jsdom): the shell. A new game shows only the header (x = 10), the
// Generator 1 row and the Settings button; the G2 silhouette appears when x first reaches 50
// with "Buy 1 · 100" and becomes a normal row at its first purchase; the Next goal chip and the
// growth readout; Settings apply at once and are stored.
import { cleanup, fireEvent, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeState } from '../../src/engine/state.ts';
import { SETTINGS_KEY, createSettingsStore } from '../../src/platform/settingsStore.ts';
import { STRINGS } from '../../src/ui/strings.ts';
import { fill } from '../../src/ui/tpl.ts';
import { button, setupApp, shown, tiersShown } from './support/app.tsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.documentElement.dataset.theme = 'dark';
});

/** The visible text of every button, in document order. */
function buttonNames(container: Element): string[] {
  return [...container.querySelectorAll('button')].map(
    (b) => b.id || b.getAttribute('data-settings') || '',
  );
}

describe('the shell (GDD §17)', () => {
  it('a new game shows only the header (x = 10), the Generator 1 row and the Settings button', () => {
    const { container } = setupApp();
    expect(shown(container.querySelector('[data-x]'))).toBe('10');
    expect(tiersShown(container)).toEqual(['1']);
    expect(container.querySelector('[data-global]')).toBeNull();
    expect(container.querySelector('[data-mode="maxAll"]')).toBeNull();
    expect(container.querySelector('[role="tablist"]')).toBeNull();
    expect(container.querySelector('[data-silhouette]')).toBeNull();
    // The only buttons: G1's Buy 1, Until 10, Max and ×m, and Settings.
    const buttons = [...container.querySelectorAll('button')];
    expect(buttons).toHaveLength(5);
    const g1 = container.querySelector('tr[data-tier="1"]')!;
    expect(
      [...g1.querySelectorAll('button')].map((b) => b.getAttribute('data-mode') ?? 'mult'),
    ).toEqual(['mult', 'one', 'until10', 'max']);
    expect(button(container, '[data-settings]').textContent).toBe(STRINGS['header.settings']);
    expect(buttonNames(container)).toHaveLength(5);
    // The header: rate +0/s, growth — (fewer than 2 positive samples), goal Buy G2 · 0%.
    expect(container.querySelector('[data-rate]')?.textContent).toBe('+0/s');
    expect(container.querySelector('[data-growth]')?.textContent).toBe(STRINGS.none);
    expect(container.querySelector('[data-goal]')?.textContent).toBe('Buy G2 · 0%');
    expect(screen.getByRole('progressbar', { name: STRINGS['header.goal'] })).toBeTruthy();
  });

  it('the Generator 2 silhouette appears when x first reaches 50 (half its cost), with only "Buy 1 · 100", and becomes a normal row at its first purchase', () => {
    const { container, advance, loop } = setupApp();
    fireEvent.click(button(container, '[data-tier="1"] button[data-mode="one"]'));
    // x = 2t after the purchase: 49.8 at 24.9 s, 50 at 25 s.
    advance(24_900);
    expect(tiersShown(container)).toEqual(['1']);
    advance(100);
    expect(tiersShown(container)).toEqual(['1', '2']);
    const g2 = container.querySelector('tr[data-tier="2"]')!;
    expect(g2.hasAttribute('data-silhouette')).toBe(true);
    const g2buttons = [...g2.querySelectorAll('button')];
    expect(g2buttons.map((b) => b.getAttribute('data-mode'))).toEqual(['one']);
    expect(g2buttons[0]!.textContent).toContain(`${STRINGS['sum.buy1']} · 100`);
    expect(g2buttons[0]!.disabled).toBe(true);
    expect(g2buttons[0]!.getAttribute('data-afford')).toBe('no');
    // The row header is visually hidden but names the button for screen readers.
    expect(
      screen.getByRole('button', {
        name: new RegExp(
          `^${fill(STRINGS['sum.generator'], { k: 2 })} ${STRINGS['sum.buy1']} · 100 ≈ `,
        ),
      }),
    ).toBe(g2buttons[0]);
    // The global row and Max all come with it (the first level also costs 100).
    expect(container.querySelector('tr[data-global][data-silhouette]')).not.toBeNull();
    expect(container.querySelector('[data-mode="maxAll"]')).not.toBeNull();
    // Max on G1 spends x below 50 (two purchases, 19.95 + 39.8, at x = 100): the silhouette
    // stays (reveals are remembered).
    advance(25_000); // x = 100
    fireEvent.click(button(container, '[data-tier="1"] button[data-mode="max"]'));
    advance(50);
    expect(loop.state().sum.x.lt(50)).toBe(true);
    expect(container.querySelector('tr[data-tier="2"][data-silhouette]')).not.toBeNull();
    // Buying G2 makes it a normal row.
    advance(30_000);
    fireEvent.click(button(container, '[data-tier="2"] button[data-mode="one"]'));
    advance(50);
    expect(loop.state().sum.bought[1]).toBe(1);
    const owned = container.querySelector('tr[data-tier="2"]')!;
    expect(owned.hasAttribute('data-silhouette')).toBe(false);
    expect(
      [...owned.querySelectorAll('button')].map((b) => b.getAttribute('data-mode') ?? 'mult'),
    ).toEqual(['mult', 'one', 'until10', 'max']);
    expect(container.querySelector('[data-goal]')?.textContent).toMatch(/^Buy G3 · \d+%$/);
  });

  it('buttons show ✓ when affordable and ≈ t otherwise (never colour alone)', () => {
    const { container } = setupApp(makeState({ x: 15, amounts: [1], bought: [1] }));
    const one = button(container, '[data-tier="1"] button[data-mode="one"]');
    // b1 = 1: the next G1 costs 10^1.3 ≈ 19.95; x = 15 grows at 2/s, so ≈ 3s.
    expect(one.getAttribute('data-afford')).toBe('no');
    expect(one.querySelector('[data-status]')?.textContent).toBe('≈ 3s');
    expect(one.disabled).toBe(true);
    const { container: c2 } = setupApp(makeState({ x: 1000, bought: [1] }));
    const yes = button(c2, '[data-tier="1"] button[data-mode="one"]');
    expect(yes.getAttribute('data-afford')).toBe('yes');
    expect(yes.querySelector('[data-status]')?.textContent).toBe(
      `${STRINGS['afford.yes']}${STRINGS['afford.sr']}`,
    );
    expect(yes.disabled).toBe(false);
    // Until 10 buys part of the set, so it is enabled while its full price is not covered.
    const until = button(c2, '[data-tier="1"] button[data-mode="until10"]');
    expect(until.getAttribute('data-afford')).toBe('no');
    expect(until.disabled).toBe(false);
  });

  it('the header shows — for a new game, then ×10^Y /min once x has 2 positive samples', () => {
    const { container, advance } = setupApp(makeState({ x: 10, amounts: [1], bought: [1] }));
    expect(container.querySelector('[data-growth]')?.textContent).toBe(STRINGS.none);
    advance(1000);
    const growth = container.querySelector('[data-growth]');
    expect(shown(growth)).toMatch(/^×10\^0\.\d+ \/min$/);
    // ... with a spoken form (§18): "times ten to the 0.0792 per minute", not "×10^…".
    const y = /0\.\d+/.exec(shown(growth))![0];
    expect(growth?.querySelector('.sr-only')?.textContent).toBe(
      fill(STRINGS['header.growthSr'], { y }),
    );
    expect(container.querySelector('[data-rate]')?.textContent).toBe('+2/s');
  });

  it('Settings opens in the main area, applies at once, is stored, and Close returns the focus', () => {
    const store = createSettingsStore(window.localStorage);
    window.localStorage.removeItem(SETTINGS_KEY);
    // x = 1.23e46 with no production, so x stays put: Scientific shows 1.23e46, Engineering
    // 12.30e45 (a value whose exponent is not a multiple of 3, so the notations differ).
    const { container } = setupApp(makeState({ x: '1.23e46', bought: [1, 1, 1] }), {
      settingsStore: store,
    });
    const g3cost = () =>
      shown(container.querySelector('tr[data-tier="3"] button[data-mode="one"] .cost .num'));
    expect(shown(container.querySelector('[data-x]'))).toBe('1.23e46');
    expect(g3cost()).toBe('31,622');
    const settings = button(container, '[data-settings]');
    expect(settings.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(settings);
    expect(settings.getAttribute('aria-expanded')).toBe('true');
    const panel = container.querySelector('[data-settings-panel]')!;
    expect(panel.id).toBe(settings.getAttribute('aria-controls'));
    // The panel replaces the tab, which stays mounted but hidden.
    expect(container.querySelector<HTMLElement>('[data-tab]')?.hidden).toBe(true);
    // Numbers: Engineering notation applies to the header at once.
    const notation = panel.querySelector<HTMLSelectElement>('select[data-setting="notation"]')!;
    expect(screen.getByLabelText(STRINGS['settings.notation'])).toBe(notation);
    fireEvent.change(notation, { target: { value: 'engineering' } });
    expect(shown(container.querySelector('[data-x]'))).toBe('12.30e45');
    fireEvent.change(panel.querySelector('select[data-setting="precision"]')!, {
      target: { value: '0' },
    });
    expect(shown(container.querySelector('[data-x]'))).toBe('12e45');
    // The integer threshold reaches static numbers too (costs do not change between renders):
    // at 1e3, G3's 31,622 is a mantissa form (Engineering, precision 0).
    fireEvent.change(panel.querySelector('select[data-setting="intThreshold"]')!, {
      target: { value: '1000' },
    });
    expect(g3cost()).toBe('32e3');
    fireEvent.change(panel.querySelector('select[data-setting="intThreshold"]')!, {
      target: { value: '1000000' },
    });
    expect(g3cost()).toBe('31,622');
    // Display: the light theme sets <html data-theme>.
    fireEvent.click(screen.getByRole('tab', { name: STRINGS['settings.display'] }));
    fireEvent.change(container.querySelector('select[data-setting="theme"]')!, {
      target: { value: 'light' },
    });
    expect(document.documentElement.dataset.theme).toBe('light');
    fireEvent.change(container.querySelector('select[data-setting="uiFps"]')!, {
      target: { value: '60' },
    });
    expect(JSON.parse(window.localStorage.getItem(SETTINGS_KEY)!)).toEqual({
      settingsVersion: 1,
      values: {
        notation: 'engineering',
        precision: 0,
        intThreshold: 1e6,
        theme: 'light',
        uiFps: 60,
      },
    });
    // Close: back to the tab, focus on the Settings button.
    fireEvent.click(screen.getByRole('button', { name: STRINGS.close }));
    expect(container.querySelector('[data-settings-panel]')).toBeNull();
    expect(container.querySelector<HTMLElement>('[data-tab]')?.hidden).toBe(false);
    expect(document.activeElement).toBe(settings);
    window.localStorage.removeItem(SETTINGS_KEY);
  });

  it('stored settings load on start; Escape closes the panel', () => {
    const store = createSettingsStore(window.localStorage);
    window.localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        settingsVersion: 1,
        values: { notation: 'logarithm', theme: 'light', extra: 1 },
      }),
    );
    const { container, loop } = setupApp(makeState({ x: '1.23e45' }), { settingsStore: store });
    expect(shown(container.querySelector('[data-x]'))).toBe('e45.09');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(loop.uiFps).toBe(30);
    fireEvent.click(button(container, '[data-settings]'));
    expect(container.querySelector('[data-settings-panel]')).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(container.querySelector('[data-settings-panel]')).toBeNull();
    window.localStorage.removeItem(SETTINGS_KEY);
  });

  it('time-to-afford follows a precision change at once', () => {
    const { container } = setupApp(makeState({ x: 10, amounts: [1], bought: [1] }));
    const until = () =>
      container.querySelector('tr[data-tier="1"] button[data-mode="until10"] [data-status]')
        ?.textContent;
    // (10,027 − 10) / 2 per s ≈ 5,008 s ≈ 1.39 h.
    expect(until()).toBe('≈ 1.39h');
    fireEvent.click(button(container, '[data-settings]'));
    fireEvent.change(container.querySelector('select[data-setting="precision"]')!, {
      target: { value: '0' },
    });
    expect(until()).toBe('≈ 1h');
  });

  it('a newer build’s stored settings are kept as they are until the player changes one', () => {
    const store = createSettingsStore(window.localStorage);
    const newer = JSON.stringify({
      settingsVersion: 7,
      values: { theme: 'light', musicVolume: 1, notation: 'nope' },
    });
    window.localStorage.setItem(SETTINGS_KEY, newer);
    const { container, advance } = setupApp(makeState(), { settingsStore: store });
    expect(document.documentElement.dataset.theme).toBe('light'); // its valid known field
    advance(1000);
    fireEvent.click(button(container, '[data-settings]'));
    expect(window.localStorage.getItem(SETTINGS_KEY)).toBe(newer);
    fireEvent.change(container.querySelector('select[data-setting="precision"]')!, {
      target: { value: '3' },
    });
    expect(JSON.parse(window.localStorage.getItem(SETTINGS_KEY)!)).toEqual({
      settingsVersion: 1,
      values: {
        notation: 'scientific',
        precision: 3,
        intThreshold: 1e6,
        theme: 'light',
        uiFps: 30,
      },
    });
    window.localStorage.removeItem(SETTINGS_KEY);
  });

  it('silhouette headers: a tier’s is visually hidden, the global row’s stays visible', () => {
    const { container } = setupApp(makeState({ x: 60 }));
    const tier = container.querySelector('tr[data-tier="2"][data-silhouette] th')!;
    expect(tier.querySelector('.sr-only')?.textContent).toBe(
      fill(STRINGS['sum.generator'], { k: 2 }),
    );
    const global = container.querySelector('tr[data-global][data-silhouette] th')!;
    expect(global.textContent).toBe(STRINGS['sum.global']);
    expect(global.querySelector('.sr-only')).toBeNull();
    expect(global.classList.contains('sr-only')).toBe(false);
  });

  it('the Next goal progressbar: aria-valuenow and the bar width follow the percentage', () => {
    const { container } = setupApp(makeState({ x: 50 }));
    const chip = container.querySelector<HTMLElement>('[data-goal]')!;
    expect(chip.textContent).toBe('Buy G2 · 69%');
    expect(chip.getAttribute('aria-valuenow')).toBe('69');
    expect(chip.getAttribute('aria-valuetext')).toBe('Buy G2 · 69%');
    expect(chip.querySelector<HTMLElement>('.shell-goal-bar > span')?.style.width).toBe('69%');
  });

  it('headings: one h1 (the game title), and the Sum panel is named by its own h2', () => {
    const { container } = setupApp();
    const h1 = [...container.querySelectorAll('h1')];
    expect(h1.map((h) => h.textContent)).toEqual([STRINGS['game.title']]);
    const tab = container.querySelector('[data-tab]')!;
    const h2 = tab.querySelector('h2')!;
    expect(h2.textContent).toBe(STRINGS['tab.sum']);
    expect(tab.getAttribute('aria-labelledby')).toBe(h2.id);
    expect(screen.getByRole('region', { name: STRINGS['tab.sum'] })).toBe(tab);
  });

  it('a status that is never reached is — and read as "never"', () => {
    setupApp(); // no production: Until 10 is never covered
    const until = screen.getByRole('button', {
      name: `${fill(STRINGS['sum.generator'], { k: 1 })} ${STRINGS['sum.until10']} · 10,037 ${STRINGS['afford.never']}`,
    });
    expect(until.querySelector('[data-status="never"] [aria-hidden="true"]')?.textContent).toBe(
      STRINGS.none,
    );
  });

  it('Max all shows its status: ≈ t to the cheapest next purchase, then ✓', () => {
    // b1 = 3: G1's next costs 79.4, G2 and the global level 100; x = 60 grows at 2/s.
    const { container, advance } = setupApp(makeState({ x: 60, amounts: [1], bought: [3] }));
    const maxAll = button(container, 'button[data-mode="maxAll"]');
    expect(maxAll.getAttribute('data-afford')).toBe('no');
    expect(maxAll.disabled).toBe(true);
    expect(maxAll.querySelector('[data-status]')?.textContent).toBe('≈ 10s');
    advance(10_000);
    expect(maxAll.getAttribute('data-afford')).toBe('yes');
    expect(maxAll.disabled).toBe(false);
    expect(maxAll.querySelector('[data-status="yes"]')).not.toBeNull();
  });

  it('rows fade in once: after a row’s fade has ended, closing Settings does not fade it again', () => {
    const { container } = setupApp(makeState({ x: 60 }));
    const g1 = () => container.querySelector('tr[data-tier="1"]')!;
    expect(g1().hasAttribute('data-reveal')).toBe(true);
    expect(container.querySelector('.sum-maxall')?.hasAttribute('data-reveal')).toBe(true);
    // jsdom has no AnimationEvent: an Event with the field the handler reads.
    const animationEnd = (el: Element, animationName: string) => {
      const e = new Event('animationend', { bubbles: true });
      Object.defineProperty(e, 'animationName', { value: animationName });
      fireEvent(el, e);
    };
    // Another animation does not count.
    animationEnd(g1(), 'other');
    fireEvent.click(button(container, '[data-settings]'));
    fireEvent.click(button(container, '[data-settings]'));
    expect(g1().hasAttribute('data-reveal')).toBe(true);
    animationEnd(g1(), 'reveal-in');
    fireEvent.click(button(container, '[data-settings]'));
    fireEvent.click(button(container, '[data-settings]'));
    expect(g1().hasAttribute('data-reveal')).toBe(false);
    expect(container.querySelector('tr[data-tier="2"]')?.hasAttribute('data-reveal')).toBe(true);
  });
});
