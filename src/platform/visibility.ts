/**
 * Page visibility (GDD §20.1, §21.4): when the page is hidden or unloaded (autosave runs then)
 * and when it is shown again (the tab lock rechecks ownership; a hidden tab's catch-up runs
 * through the loop's gap path). Each function returns its unsubscribe function.
 *
 * - `onHide`: `visibilitychange` to hidden, and `pagehide` (which also fires when the page goes
 *   into the back/forward cache, where `visibilitychange` may not).
 * - `onShow`: `visibilitychange` to visible, and `pageshow` from the back/forward cache
 *   (`persisted`; a fresh load is not a "show again").
 */

/** What these helpers need of a window. */
export interface VisibilityWindow {
  readonly document: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
  addEventListener(type: 'pagehide' | 'pageshow', fn: (e: PageTransitionEvent) => void): void;
  removeEventListener(type: 'pagehide' | 'pageshow', fn: (e: PageTransitionEvent) => void): void;
}

export function onHide(win: VisibilityWindow, fn: () => void): () => void {
  const vis = (): void => {
    if (win.document.visibilityState === 'hidden') fn();
  };
  const hide = (): void => fn();
  win.document.addEventListener('visibilitychange', vis);
  win.addEventListener('pagehide', hide);
  return () => {
    win.document.removeEventListener('visibilitychange', vis);
    win.removeEventListener('pagehide', hide);
  };
}

export function onShow(win: VisibilityWindow, fn: () => void): () => void {
  const vis = (): void => {
    if (win.document.visibilityState === 'visible') fn();
  };
  const show = (e: PageTransitionEvent): void => {
    if (e.persisted) fn();
  };
  win.document.addEventListener('visibilitychange', vis);
  win.addEventListener('pageshow', show);
  return () => {
    win.document.removeEventListener('visibilitychange', vis);
    win.removeEventListener('pageshow', show);
  };
}
