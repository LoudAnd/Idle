// GDD §21.8 (jsdom): a test-only effect that throws or returns NaN, an uncaught error and an
// unhandled rejection each pause the loop and open the recovery panel; a render error in one tab
// replaces only that tab, and the engine keeps running.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { num } from '../../src/engine/num.ts';
import { installTestEffect } from '../../src/engine/effects.ts';
import type { EffectDef } from '../../src/engine/effects.ts';
import { makeState, serializeState } from '../../src/engine/state.ts';
import { createErrorHub, installGlobalHandlers } from '../../src/platform/errors.ts';
import { TabBoundary } from '../../src/ui/Recovery.tsx';
import { STRINGS } from '../../src/ui/strings.ts';
import { setupApp } from './support/app.tsx';

// The Sum tab, wrapped so a test can make its render throw.
const tabFault = vi.hoisted(() => ({ on: false }));
vi.mock('../../src/ui/sum/SumTab.tsx', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/ui/sum/SumTab.tsx')>();
  return {
    ...mod,
    SumTab: (props: Parameters<typeof mod.SumTab>[0]) => {
      if (tabFault.on) throw new Error('test render error');
      return mod.SumTab(props);
    },
  };
});

let cleanups: (() => void)[] = [];
afterEach(() => {
  for (const c of cleanups.reverse()) c();
  cleanups = [];
  tabFault.on = false;
  cleanup();
  vi.restoreAllMocks();
});

function setup() {
  const hub = createErrorHub();
  cleanups.push(installGlobalHandlers(window, hub));
  // x = 1e30 reveals every row, so the paused screen has every kind of control; A1 = 1e30
  // keeps x growing visibly (2e30/s).
  const ctx = setupApp(makeState({ x: '1e30', amounts: ['1e30', 1], bought: [5, 1] }), { hub });
  ctx.advance(500);
  return { ...ctx, hub };
}

function effect(id: string, value: EffectDef['value'], cls: EffectDef['class']): EffectDef {
  return {
    id,
    target: 'tierMult',
    tiers: 'all',
    kind: 'mul',
    class: cls,
    label: 'factor.beta',
    value,
  };
}

/** The loop is paused, the panel is open, and Reload calls the reload callback. */
function expectPausedWithPanel(ctx: ReturnType<typeof setup>): void {
  expect(ctx.loop.running).toBe(false);
  expect(ctx.hub.fault).not.toBeNull();
  // Paused: nothing changes over another second.
  const kept = serializeState(ctx.loop.state());
  ctx.advance(1000);
  expect(serializeState(ctx.loop.state())).toBe(kept);
  const panel = screen.getByRole('alert');
  expect(panel.textContent).toContain(STRINGS['recovery.title']);
  const reload = screen.getByRole('button', { name: STRINGS['recovery.reload'] });
  // The paused screen offers nothing else to act on: the focus is on Reload and every buy
  // control of the frozen tab is disabled.
  expect(document.activeElement).toBe(reload);
  // Every control of the frozen tab: 2 owned rows (Buy 1, Until 10, Max and the ×m trigger),
  // 6 silhouettes (Buy 1), the global silhouette (Buy 1) and Max all.
  const controls = [...ctx.container.querySelectorAll<HTMLButtonElement>('[data-tab] button')];
  expect(controls.length).toBe(2 * 4 + 6 + 1 + 1);
  for (const c of controls) expect(c.disabled, c.getAttribute('data-mode') ?? '').toBe(true);
  // ... and the header's Settings button.
  expect(ctx.container.querySelector<HTMLButtonElement>('[data-settings]')?.disabled).toBe(true);
  expect(ctx.container.querySelector('[data-paused]')).not.toBeNull();
  fireEvent.click(reload);
  expect(ctx.onReload).toHaveBeenCalledTimes(1);
  expect(ctx.container.textContent).not.toMatch(/NaN|Infinity|undefined/);
}

describe('recovery (GDD §21.8)', () => {
  it('a test-only effect that throws pauses the loop and opens the recovery panel', () => {
    const ctx = setup();
    expect(screen.queryByRole('alert')).toBeNull();
    cleanups.push(
      installTestEffect(
        effect(
          'test.throw',
          () => {
            throw new Error('test effect');
          },
          'state',
        ),
      ),
    );
    ctx.advance(1000);
    expect(['tick', 'view']).toContain(ctx.hub.fault?.kind);
    expectPausedWithPanel(ctx);
  });

  it('a test-only effect that returns NaN fails the invariant, pauses and opens the panel', () => {
    const ctx = setup();
    cleanups.push(installTestEffect(effect('test.nan', () => num(Number.NaN), 'event')));
    ctx.advance(1000);
    expect(ctx.hub.fault?.kind).toBe('invariant');
    expect(ctx.hub.fault?.problems?.length).toBeGreaterThan(0);
    expectPausedWithPanel(ctx);
    // The last good view is still shown: x is a number.
    expect(ctx.container.querySelector('[data-x]')?.textContent).toMatch(/\d/);
  });

  it('an open breakdown closes on a fault, so Reload is the only thing left to act on', () => {
    const ctx = setup();
    fireEvent.click(ctx.container.querySelector('tr[data-tier="1"] button[data-breakdown]')!);
    expect(ctx.container.querySelector('[data-breakdown-panel]')).not.toBeNull();
    act(() => {
      window.dispatchEvent(new ErrorEvent('error', { error: new Error('x'), message: 'x' }));
    });
    expect(ctx.container.querySelector('[data-breakdown-panel]')).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: STRINGS['recovery.reload'] }),
    );
  });

  it('an error event on window pauses and opens the panel', () => {
    const ctx = setup();
    const error = new Error('uncaught');
    act(() => {
      window.dispatchEvent(new ErrorEvent('error', { error, message: error.message }));
    });
    expect(ctx.hub.fault).toEqual({ kind: 'error', error });
    expectPausedWithPanel(ctx);
  });

  it('an unhandledrejection pauses and opens the panel', () => {
    const ctx = setup();
    const reason = new Error('rejected');
    const promise = Promise.reject(reason);
    promise.catch(() => {}); // handled here, so Node sees no real unhandled rejection
    act(() => {
      window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', { promise, reason }));
    });
    expect(ctx.hub.fault).toEqual({ kind: 'rejection', error: reason });
    expectPausedWithPanel(ctx);
  });

  it('a render error in one tab replaces only that tab and the engine keeps running', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ctx = setup();
    const x0 = ctx.container.querySelector('[data-x]')?.textContent;
    tabFault.on = true;
    ctx.advance(100);
    // The tab shows the recovery panel; the header outside the boundary is untouched.
    const tab = ctx.container.querySelector('[data-tab]');
    expect(tab?.querySelector('[role="alert"]')).not.toBeNull();
    expect(tab?.querySelector('tr[data-tier]')).toBeNull();
    expect(ctx.container.querySelectorAll('[role="alert"]')).toHaveLength(1);
    expect(logged).toHaveBeenCalled();
    // Not a fault: the loop runs on and x keeps growing in the header.
    expect(ctx.hub.fault).toBeNull();
    expect(ctx.loop.running).toBe(true);
    const t0 = ctx.loop.state().time;
    ctx.advance(2000);
    expect(ctx.loop.state().time).toBeGreaterThan(t0);
    expect(ctx.container.querySelector('[data-x]')?.textContent).not.toBe(x0);
  });

  it('a boundary replaces only its own children', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    function Boom(): never {
      throw new Error('boom');
    }
    const { container } = render(
      <div>
        <div data-a>
          <TabBoundary onReload={() => {}}>
            <Boom />
          </TabBoundary>
        </div>
        <div data-b>
          <TabBoundary onReload={() => {}}>
            <p>{STRINGS['tab.sum']}</p>
          </TabBoundary>
        </div>
      </div>,
    );
    expect(container.querySelector('[data-a] [role="alert"]')).not.toBeNull();
    expect(container.querySelector('[data-b] [role="alert"]')).toBeNull();
    expect(container.querySelector('[data-b] p')?.textContent).toBe(STRINGS['tab.sum']);
  });
});
