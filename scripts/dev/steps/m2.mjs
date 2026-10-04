// M2 playtest (ROADMAP M2): all 8 generator rows render, then the reusable playable check
// (Buy on Generator 1, x rises within 5 s). The playtest script itself fails on any console
// error. Run: npm run build && npm run playtest -- --steps scripts/dev/steps/m2.mjs
//
// Then a long run on Playwright's fake clock (Max all every 2 simulated seconds for 12 min), so
// the numbers reach their late-M2 widths (mantissa forms, multipliers of ×1e6 and more), and the
// layout checks of GDD §17.6 and §22.11 at that point, not only on the first screen:
// - no horizontal scroll at 375 and 390 px (nor at 1280 px);
// - the buy buttons stay put while the game runs without purchases (no sideways jumps).
import playable from './playable.mjs';

const LONG_RUN_S = 12 * 60;
/** Max all every this many simulated seconds; each jump is one frame (40 ticks + the rest). */
const BUY_EVERY_MS = 2000;
const STILL_S = 10;
const WIDTHS = [
  [1280, 800],
  [390, 844],
  [375, 667],
];

/** Clicks a control in the page if it exists and is enabled. */
function click(page, selector) {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    if (el && !el.disabled) el.click();
  }, selector);
}

/** The document's horizontal overflow and the widest elements past the right edge. */
function overflow(page) {
  return page.evaluate(() => {
    const d = document.documentElement;
    const wide = [...document.querySelectorAll('body *')]
      .filter((el) => el.getBoundingClientRect().right > d.clientWidth + 0.5)
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}:${Math.round(el.getBoundingClientRect().right)}`);
    return { scrollWidth: d.scrollWidth, clientWidth: d.clientWidth, wide };
  });
}

/** The left edges of every buy button, as one string. */
function buttonEdges(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-tab] button')]
      .map((b) => Math.round(b.getBoundingClientRect().left))
      .join(','),
  );
}

export default async function m2(page, shot) {
  await page.locator('[data-tier="1"]').waitFor({ timeout: 10_000 });
  const rows = await page.locator('tr[data-tier]').count();
  if (rows !== 8) throw new Error(`expected 8 generator rows, found ${rows}`);
  console.log('m2: 8 generator rows render');
  await playable(page, shot);

  await page.clock.install();
  await page.reload();
  await page.locator('[data-tier="1"]').waitFor({ timeout: 10_000 });
  await page.clock.pauseAt(Date.now() + 1000);
  for (let ms = 0; ms < LONG_RUN_S * 1000; ms += BUY_EVERY_MS) {
    await click(page, '[data-mode="maxAll"]');
    await page.clock.fastForward(BUY_EVERY_MS);
    await page.clock.runFor(50); // a regular frame, so the view is derived and rendered
  }
  const x = await page.$eval('[data-x]', (el) => {
    const shown = el.querySelector('[aria-hidden="true"]') ?? el;
    return shown.textContent;
  });
  console.log(`m2: after ${LONG_RUN_S / 60} simulated min of Max all, x = ${x}`);

  for (const [width, height] of WIDTHS) {
    await page.setViewportSize({ width, height });
    await page.clock.runFor(100);
    const o = await overflow(page);
    if (o.scrollWidth > o.clientWidth) {
      throw new Error(
        `horizontal scroll at ${width} px: scrollWidth ${o.scrollWidth} > ${o.clientWidth}; ` +
          `past the edge: ${o.wide.join(' ')}`,
      );
    }
    // No purchases for 10 s: the numbers keep changing, the buttons must not move.
    const edges = new Set([await buttonEdges(page)]);
    for (let i = 0; i < STILL_S * 4; i++) {
      await page.clock.runFor(250);
      edges.add(await buttonEdges(page));
    }
    if (edges.size !== 1) {
      throw new Error(`buy buttons moved at ${width} px: ${edges.size} layouts in ${STILL_S} s`);
    }
    console.log(`m2: ${width}×${height}: no horizontal scroll, buttons still for ${STILL_S} s`);
    await shot(`late-${width}`);
  }
}
