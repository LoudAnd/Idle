/**
 * The shell's one DOM structure (GDD §17.6): the header, the optional tab list and `<main>`.
 * CSS (`shell.css`) places the tabs as a left rail from 1024 px, a row in between and a fixed
 * bottom bar up to 640 px; nothing is duplicated per breakpoint.
 *
 * The header is sticky, so its height is kept in `--shell-header-h` on `<html>` (a
 * `ResizeObserver`; it changes with the width and the font scale), which `shell.css` reserves
 * as `scroll-padding-top`: a control that takes the focus, by Tab, Shift+Tab or `focus()` (the
 * recovery panel's Reload), is scrolled out from under the header (§18: focus always visible).
 */
import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';
import './shell.css';

/** The custom property that holds the sticky header's height. */
export const HEADER_HEIGHT_VAR = '--shell-header-h';

export interface LayoutProps {
  readonly header: ComponentChildren;
  /** The tab list, or `null` while only one tab is revealed. */
  readonly tabs: ComponentChildren | null;
  readonly children?: ComponentChildren;
}

export function Layout({ header, tabs, children }: LayoutProps) {
  const hasTabs = tabs !== null && tabs !== undefined && tabs !== false;
  const shell = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = shell.current?.querySelector('header');
    const root = document.documentElement;
    if (el === null || el === undefined) return;
    const update = (): void => {
      root.style.setProperty(
        HEADER_HEIGHT_VAR,
        `${Math.ceil(el.getBoundingClientRect().height)}px`,
      );
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div class="shell" ref={shell} data-has-tabs={hasTabs ? '' : undefined}>
      {header}
      {hasTabs && <div class="shell-tabs">{tabs}</div>}
      <main class="shell-main">{children}</main>
    </div>
  );
}
