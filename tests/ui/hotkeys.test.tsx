// GDD §18 (jsdom): hotkeys match on event.code. Digit1–Digit8 buy one, Shift + digit buys max
// (also when event.key is "!" or "&"), KeyM is Max all and KeyG a global level. Nothing fires
// with focus in an input, textarea, select or contenteditable element, or with Ctrl, Meta or
// Alt held, or during IME composition.
import { cleanup, fireEvent } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Action } from '../../src/engine/actions.ts';
import { makeState } from '../../src/engine/state.ts';
import { hotkeyAction, installHotkeys, isTypingTarget } from '../../src/ui/hotkeys.ts';
import { setupApp, spyLoop } from './support/app.tsx';

let sent: Action[] = [];
let remove: (() => void) | null = null;

beforeEach(() => {
  sent = [];
  remove = installHotkeys(window, (a) => sent.push(a));
});

afterEach(() => {
  remove?.();
  remove = null;
  document.body.innerHTML = '';
  cleanup();
  vi.restoreAllMocks();
});

function press(init: KeyboardEventInit, target: Element = document.body): void {
  fireEvent.keyDown(target, init);
}

describe('hotkeys (GDD §18)', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])('Digit%i buys one of that tier', (tier) => {
    press({ code: `Digit${tier}`, key: String(tier) });
    expect(sent).toEqual([{ type: 'buy', tier, mode: 'one' }]);
  });

  it.each([
    ['!', 1],
    ['&', 1],
    ['@', 2],
    ['"', 3],
    ['*', 8],
  ])('Shift + digit buys max, whatever event.key is (%s)', (key, tier) => {
    press({ code: `Digit${tier}`, key, shiftKey: true });
    expect(sent).toEqual([{ type: 'buy', tier, mode: 'max' }]);
  });

  it('KeyM is Max all and KeyG one global level (Shift ignored)', () => {
    press({ code: 'KeyM', key: 'm' });
    press({ code: 'KeyM', key: 'M', shiftKey: true });
    press({ code: 'KeyG', key: 'g' });
    press({ code: 'KeyG', key: 'G', shiftKey: true });
    expect(sent).toEqual([
      { type: 'maxAll' },
      { type: 'maxAll' },
      { type: 'buyGlobal', mode: 'one' },
      { type: 'buyGlobal', mode: 'one' },
    ]);
  });

  it('match on event.code, not event.key: an AZERTY "&" on Digit1 is Digit1', () => {
    press({ code: 'Digit1', key: '&' });
    press({ code: 'KeyQ', key: 'm' }); // a layout where KeyQ types "m" is not Max all
    expect(sent).toEqual([{ type: 'buy', tier: 1, mode: 'one' }]);
  });

  it.each(['input', 'textarea', 'select'])('nothing fires with focus in a %s', (tag) => {
    const el = document.createElement(tag);
    document.body.append(el);
    press({ code: 'Digit1', key: '1' }, el);
    press({ code: 'KeyM', key: 'm' }, el);
    expect(sent).toEqual([]);
  });

  it('nothing fires inside a contenteditable element, also from a span inside it', () => {
    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');
    const span = document.createElement('span');
    div.append(span);
    document.body.append(div);
    press({ code: 'Digit1', key: '1' }, div);
    press({ code: 'Digit2', key: '2' }, span);
    expect(sent).toEqual([]);
    // contenteditable="false" is not editable.
    const off = document.createElement('div');
    off.setAttribute('contenteditable', 'false');
    document.body.append(off);
    press({ code: 'Digit3', key: '3' }, off);
    expect(sent).toEqual([{ type: 'buy', tier: 3, mode: 'one' }]);
    // A bare contenteditable attribute counts too.
    const bare = document.createElement('p');
    bare.setAttribute('contenteditable', '');
    expect(isTypingTarget(bare)).toBe(true);
  });

  it.each(['ctrlKey', 'metaKey', 'altKey'])('nothing fires with %s held', (mod) => {
    press({ code: 'Digit1', key: '1', [mod]: true });
    press({ code: 'Digit1', key: '!', shiftKey: true, [mod]: true });
    press({ code: 'KeyM', key: 'm', [mod]: true });
    press({ code: 'KeyG', key: 'g', [mod]: true });
    expect(sent).toEqual([]);
  });

  it('nothing fires during IME composition', () => {
    press({ code: 'Digit1', key: '1', isComposing: true });
    expect(sent).toEqual([]);
  });

  it('Digit0, Digit9, numpad digits and other keys do nothing; ? (Shift + Slash) is not a buy', () => {
    for (const code of ['Digit0', 'Digit9', 'Numpad1', 'KeyA', 'Space', 'Escape']) press({ code });
    press({ code: 'Slash', key: '?', shiftKey: true });
    expect(sent).toEqual([]);
  });

  it('buy keys may repeat (a held key buys every repeat)', () => {
    press({ code: 'Digit1', key: '1', repeat: true });
    expect(sent).toEqual([{ type: 'buy', tier: 1, mode: 'one' }]);
  });

  it('removing the listener stops it', () => {
    remove?.();
    remove = null;
    press({ code: 'Digit1', key: '1' });
    expect(sent).toEqual([]);
  });

  it('hotkeyAction is pure over the event fields', () => {
    const base = { shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, target: null };
    expect(hotkeyAction({ ...base, code: 'Digit4' })).toEqual({
      type: 'buy',
      tier: 4,
      mode: 'one',
    });
    expect(hotkeyAction({ ...base, code: 'Digit4', shiftKey: true })).toEqual({
      type: 'buy',
      tier: 4,
      mode: 'max',
    });
    expect(hotkeyAction({ ...base, code: 'Digit9' })).toBeNull();
  });
});

describe('hotkeys in the app', () => {
  it('Digit1 buys Generator 1 (b1 becomes 1)', () => {
    remove?.();
    remove = null;
    const { loop, advance } = setupApp(makeState({ x: 10 }));
    fireEvent.keyDown(document.body, { code: 'Digit1', key: '1' });
    advance(50);
    expect(loop.state().sum.bought[0]).toBe(1);
  });

  it('each keydown enqueues exactly one action (one listener for the app)', () => {
    remove?.();
    remove = null;
    const enqueued: unknown[] = [];
    setupApp(makeState({ x: 1e6 }), { wrap: (l) => spyLoop(l, enqueued) });
    fireEvent.keyDown(document.body, { code: 'Digit1', key: '1' });
    expect(enqueued).toEqual([{ type: 'buy', tier: 1, mode: 'one' }]);
    fireEvent.keyDown(document.body, { code: 'KeyM', key: 'm' });
    fireEvent.keyDown(document.body, { code: 'KeyG', key: 'g' });
    expect(enqueued).toEqual([
      { type: 'buy', tier: 1, mode: 'one' },
      { type: 'maxAll' },
      { type: 'buyGlobal', mode: 'one' },
    ]);
  });

  it('Shift + Digit1 buys max, KeyG buys a global level, KeyM buys everything affordable', () => {
    remove?.();
    remove = null;
    const { loop, advance } = setupApp(makeState({ x: 1000 }));
    fireEvent.keyDown(document.body, { code: 'Digit1', key: '!', shiftKey: true });
    advance(50);
    expect(loop.state().sum.bought[0]).toBeGreaterThan(1);
    const { loop: l2, advance: a2 } = setupApp(makeState({ x: 150 }));
    fireEvent.keyDown(document.body, { code: 'KeyG', key: 'G', shiftKey: true });
    a2(50);
    expect(l2.state().sum.globalLevel).toBe(1);
    expect(l2.state().sum.bought[0]).toBe(0);
    const { loop: l3, advance: a3 } = setupApp(makeState({ x: 1e5 }));
    fireEvent.keyDown(document.body, { code: 'KeyM', key: 'm' });
    a3(50);
    const s3 = l3.state().sum;
    expect(s3.bought[0]).toBeGreaterThan(0);
    expect(s3.bought[1]).toBeGreaterThan(0);
    expect(s3.globalLevel).toBeGreaterThan(0);
  });

  it('typing in a select buys nothing', () => {
    remove?.();
    remove = null;
    const { loop, advance, container } = setupApp(makeState({ x: 1000 }));
    fireEvent.click(container.querySelector('[data-settings]')!);
    const select = container.querySelector('select')!;
    fireEvent.keyDown(select, { code: 'Digit1', key: '1' });
    fireEvent.keyDown(select, { code: 'KeyM', key: 'm' });
    advance(50);
    expect(loop.state().sum.bought[0]).toBe(0);
  });
});
