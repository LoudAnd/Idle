// GDD §20.1 (jsdom, fake timers): autosave fires every 15 s, on visibilitychange to hidden and on
// pagehide, and is silent: it changes nothing in the DOM, moves no focus and announces nothing.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTOSAVE_MS, createAutosave } from '../../src/platform/autosave.ts';
import { onShow } from '../../src/platform/visibility.ts';

let visibility: DocumentVisibilityState = 'visible';

beforeEach(() => {
  vi.useFakeTimers();
  visibility = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

function setVisibility(v: DocumentVisibilityState): void {
  visibility = v;
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('autosave (GDD §20.1)', () => {
  it('fires every 15 s', () => {
    const save = vi.fn();
    const a = createAutosave({ save, win: window });
    a.start();
    expect(a.running).toBe(true);
    expect(AUTOSAVE_MS).toBe(15_000);
    vi.advanceTimersByTime(14_999);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(45_000);
    expect(save).toHaveBeenCalledTimes(4);
    a.stop();
    vi.advanceTimersByTime(60_000);
    expect(save).toHaveBeenCalledTimes(4);
    expect(a.running).toBe(false);
  });

  it('on visibilitychange to hidden, not to visible', () => {
    const save = vi.fn();
    const a = createAutosave({ save, win: window });
    a.start();
    setVisibility('hidden');
    expect(save).toHaveBeenCalledTimes(1);
    setVisibility('visible');
    expect(save).toHaveBeenCalledTimes(1);
    a.stop();
    setVisibility('hidden');
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('on pagehide', () => {
    const save = vi.fn();
    const a = createAutosave({ save, win: window });
    a.start();
    window.dispatchEvent(new Event('pagehide'));
    expect(save).toHaveBeenCalledTimes(1);
    a.stop();
    window.dispatchEvent(new Event('pagehide'));
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('is silent: the DOM, the focus and the live text are unchanged', () => {
    document.body.innerHTML = '<button id="b">x</button><p role="status"></p>';
    const b = document.getElementById('b')!;
    b.focus();
    const before = document.body.innerHTML;
    const observer = new MutationObserver(() => {});
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
    const a = createAutosave({ save: () => {}, win: window });
    a.start();
    vi.advanceTimersByTime(30_000);
    setVisibility('hidden');
    window.dispatchEvent(new Event('pagehide'));
    expect(observer.takeRecords()).toEqual([]);
    observer.disconnect();
    expect(document.body.innerHTML).toBe(before);
    expect(document.activeElement).toBe(b);
    expect(document.querySelector('[role="status"]')?.textContent).toBe('');
    a.stop();
  });

  it('a save that throws never escapes the timer', () => {
    const a = createAutosave({
      save: () => {
        throw new Error('boom');
      },
      win: window,
    });
    a.start();
    expect(() => vi.advanceTimersByTime(15_000)).not.toThrow();
    a.stop();
  });

  it('onShow: visibilitychange to visible and pageshow from the back/forward cache', () => {
    const shown = vi.fn();
    const off = onShow(window, shown);
    setVisibility('visible');
    expect(shown).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false }));
    expect(shown).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    expect(shown).toHaveBeenCalledTimes(2);
    off();
    setVisibility('visible');
    expect(shown).toHaveBeenCalledTimes(2);
  });
});
