/**
 * Hotkeys (GDD §18). They match on `event.code`, so they do not depend on the keyboard layout
 * or on what Shift does to `event.key` (Shift + Digit1 is "!" on a US layout and "&" on a French
 * one; both buy max).
 *
 * | `event.code`              | Action                 |
 * | ------------------------- | ---------------------- |
 * | `Digit1`–`Digit8`         | Buy one of that tier   |
 * | Shift + `Digit1`–`Digit8` | Buy max of that tier   |
 * | `KeyM`                    | Max all (Shift ignored) |
 * | `KeyG`                    | One global level (Shift ignored) |
 *
 * Nothing fires while Ctrl, Meta or Alt is held (browser shortcuts such as Ctrl/Cmd+1 keep
 * working), during IME composition, or when the event target is an input, textarea or select,
 * or inside a contenteditable element (so typing "12" into a field buys nothing). Buy keys may
 * repeat; the reset keys of later milestones will ignore `event.repeat`. Escape is handled by
 * the open panel itself (Breakdown, Settings). No `preventDefault`: the keys keep their default
 * behaviour.
 */
import type { Action } from '../engine/actions.ts';
import { isTier } from '../engine/state.ts';

/** The parts of a `KeyboardEvent` the mapping reads. */
export interface KeyLike {
  readonly code: string;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly repeat?: boolean;
  readonly isComposing?: boolean;
  readonly target: EventTarget | null;
}

const TYPING_TAGS: ReadonlySet<string> = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
const EDITABLE = '[contenteditable]:not([contenteditable="false"])';
const DIGIT = /^Digit([0-9])$/;

/**
 * True when the target takes text: an input, textarea or select, or anything inside a
 * contenteditable element. (jsdom has no `isContentEditable`, so the attribute is matched.)
 */
export function isTypingTarget(t: EventTarget | null): boolean {
  if (t === null || typeof t !== 'object') return false;
  const el = t as Partial<Element>;
  if (typeof el.tagName === 'string' && TYPING_TAGS.has(el.tagName.toUpperCase())) return true;
  return typeof el.closest === 'function' && el.closest(EDITABLE) !== null;
}

/** The action for a key event, or `null` when the key is not a hotkey or must be ignored. */
export function hotkeyAction(e: KeyLike): Action | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.isComposing === true) return null;
  if (isTypingTarget(e.target)) return null;
  const digit = DIGIT.exec(e.code);
  if (digit !== null) {
    const tier = Number(digit[1]);
    if (!isTier(tier)) return null;
    return { type: 'buy', tier, mode: e.shiftKey ? 'max' : 'one' };
  }
  if (e.code === 'KeyM') return { type: 'maxAll' };
  if (e.code === 'KeyG') return { type: 'buyGlobal', mode: 'one' };
  return null;
}

/** Listens for hotkeys on `win` and sends their actions. Returns the function that removes it. */
export function installHotkeys(win: Window, enqueue: (a: Action) => void): () => void {
  const onKey = (e: KeyboardEvent): void => {
    const a = hotkeyAction(e);
    if (a !== null) enqueue(a);
  };
  win.addEventListener('keydown', onKey);
  return () => win.removeEventListener('keydown', onKey);
}
