/**
 * Autosave (GDD §20.1): every 15 s, on `visibilitychange` to hidden and on `pagehide`. It is
 * silent: it never touches the DOM, announces nothing and moves no focus (only the Save panel's
 * Save now shows "Saved"). The `save` callback decides whether a save may happen at all (the
 * session refuses while the tab does not own the save, during a catch-up, after a fault and for
 * a newer save), so autosave only provides the moments. The interval is fixed until M16 makes
 * it a setting (§19).
 */
import { onHide } from './visibility.ts';
import type { VisibilityWindow } from './visibility.ts';

/** The autosave interval (GDD §19 default). */
export const AUTOSAVE_MS = 15_000;

export interface AutosaveWindow extends VisibilityWindow {
  setInterval(fn: () => void, ms: number): number;
  clearInterval(id: number | undefined): void;
}

export interface AutosaveOptions {
  readonly save: () => void;
  readonly win: AutosaveWindow;
  readonly intervalMs?: number;
}

export interface Autosave {
  start(): void;
  stop(): void;
  readonly running: boolean;
}

export function createAutosave({ save, win, intervalMs = AUTOSAVE_MS }: AutosaveOptions): Autosave {
  let timer: number | null = null;
  let unhide: (() => void) | null = null;
  const run = (): void => {
    try {
      save();
    } catch {
      // the session reports its own faults; a timer callback must never throw
    }
  };
  return {
    get running() {
      return timer !== null;
    },
    start() {
      if (timer !== null) return;
      timer = win.setInterval(run, intervalMs);
      unhide = onHide(win, run);
    },
    stop() {
      if (timer !== null) win.clearInterval(timer);
      timer = null;
      unhide?.();
      unhide = null;
    },
  };
}
