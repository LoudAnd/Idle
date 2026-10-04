// Shared helpers for the milestone playtest steps (scripts/dev/steps/m*.mjs). Each takes the
// Playwright page; the checks run in the page, so they read the built game as a player's
// browser lays it out.

/** A failure with the milestone's prefix (`fail('m3', …)`). */
export function failer(prefix) {
  return (msg) => {
    throw new Error(`${prefix}: ${msg}`);
  };
}

/** Clicks the first of the controls that exists, if it is enabled. */
export function click(page, ...selectors) {
  return page.evaluate((ss) => {
    const el = ss.map((s) => document.querySelector(s)).find((e) => e !== null);
    if (el && !el.disabled) el.click();
  }, selectors);
}

/** The document's horizontal overflow and the widest elements past the right edge. */
export function overflow(page) {
  return page.evaluate(() => {
    const d = document.documentElement;
    const wide = [...document.querySelectorAll('body *')]
      .filter((el) => el.getBoundingClientRect().right > d.clientWidth + 0.5)
      .slice(0, 5)
      .map(
        (el) =>
          `${el.tagName.toLowerCase()}.${el.className}:${Math.round(el.getBoundingClientRect().right)}`,
      );
    return { scrollWidth: d.scrollWidth, clientWidth: d.clientWidth, wide };
  });
}

/** Fails when the page scrolls sideways. */
export async function expectNoScroll(page, where, fail) {
  const o = await overflow(page);
  if (o.scrollWidth > o.clientWidth) {
    fail(
      `${where}: horizontal scroll, scrollWidth ${o.scrollWidth} > ${o.clientWidth}; ${o.wide.join(' ')}`,
    );
  }
}

/** Visible controls smaller than `min`×`min` px. */
export function smallTargets(page, min = 44) {
  return page.evaluate((m) => {
    const out = [];
    for (const el of document.querySelectorAll('button, select, input, [role="tab"]')) {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || s.visibility === 'hidden' || s.display === 'none')
        continue;
      if (r.width < m - 0.5 || r.height < m - 0.5) {
        out.push(
          `${el.tagName.toLowerCase()}[${el.getAttribute('data-mode') ?? el.id}] ${r.width.toFixed(1)}×${r.height.toFixed(1)}`,
        );
      }
    }
    return out;
  }, min);
}

/** Fails when a visible control is smaller than 44×44 px. */
export async function expectTapTargets(page, where, fail, min = 44) {
  const small = await smallTargets(page, min);
  if (small.length > 0) fail(`${where}: tap targets below ${min} px: ${small.join(', ')}`);
}

/** The left edges of every button of the tab panel, as one string. */
export function buttonEdges(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-tab] button')]
      .map((b) => Math.round(b.getBoundingClientRect().left))
      .join(','),
  );
}

/**
 * Elements of the tab panel whose content spills out of their own box (scrollWidth beyond
 * clientWidth), such as a number wider than its cell or button. Hidden elements are skipped.
 */
export function spills(page) {
  return page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('[data-tab] th, [data-tab] td, [data-tab] button')) {
      if (el.getClientRects().length === 0) continue;
      if (el.scrollWidth > el.clientWidth + 1) {
        out.push(
          `${el.tagName.toLowerCase()}.${el.className} +${el.scrollWidth - el.clientWidth}px "${el.textContent.slice(0, 24)}"`,
        );
      }
    }
    return out;
  });
}

/** WCAG relative-luminance contrast of two `rgb()`/`rgba()` colours (alpha ignored). */
export function contrastOf(a, b) {
  const lum = (c) => {
    const [r, g, bl] = c
      .match(/[\d.]+/g)
      .slice(0, 3)
      .map((v) => {
        const x = Number(v) / 255;
        return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
