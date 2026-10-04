// M2 playtest (ROADMAP M2): the reusable playable check (Buy on Generator 1, x rises within
// 5 s), then all 8 generator rows render (since M3's reveal rule, once they are revealed, so
// the row count is checked after the long run). The playtest script itself fails on any console
// error. Run: npm run build && npm run playtest -- --steps scripts/dev/steps/m2.mjs
//
// Then a long run on Playwright's fake clock (Max all every 2 simulated seconds for 12 min), so
// the numbers reach their late-M2 widths (mantissa forms, multipliers of ×1e6 and more), and the
// layout checks of GDD §17.6 and §22.11 at that point, not only on the first screen:
// - no horizontal scroll at 375 and 390 px (nor at 1280 px);
// - the buy buttons stay put while the game runs without purchases (no sideways jumps).
import { buttonEdges, click, expectNoScroll, failer, reloadAsNewGame } from './lib.mjs';
import playable from './playable.mjs';

const fail = failer('m2');

const LONG_RUN_S = 12 * 60;
/** Max all every this many simulated seconds; each jump is one frame (40 ticks + the rest). */
const BUY_EVERY_MS = 2000;
const STILL_S = 10;
const WIDTHS = [
  [1280, 800],
  [390, 844],
  [375, 667],
];

export default async function m2(page, shot) {
  await page.locator('[data-tier="1"]').waitFor({ timeout: 10_000 });
  await playable(page, shot);

  await page.clock.install();
  // A fresh game (M4 keeps the save across a plain reload).
  await reloadAsNewGame(page);
  await page.locator('[data-tier="1"]').waitFor({ timeout: 10_000 });
  await page.clock.pauseAt(Date.now() + 1000);
  for (let ms = 0; ms < LONG_RUN_S * 1000; ms += BUY_EVERY_MS) {
    // Max all is revealed at x = 50 (M3, GDD §17.4); until then, G1's Max.
    await click(page, '[data-mode="maxAll"]', '[data-tier="1"] button[data-mode="max"]');
    await page.clock.fastForward(BUY_EVERY_MS);
    await page.clock.runFor(50); // a regular frame, so the view is derived and rendered
  }
  const x = await page.$eval('[data-x]', (el) => {
    const shown = el.querySelector('[aria-hidden="true"]') ?? el;
    return shown.textContent;
  });
  console.log(`m2: after ${LONG_RUN_S / 60} simulated min of Max all, x = ${x}`);
  const rows = await page.locator('tr[data-tier]').count();
  if (rows !== 8) fail(`expected 8 generator rows, found ${rows}`);
  console.log('m2: 8 generator rows render');

  for (const [width, height] of WIDTHS) {
    await page.setViewportSize({ width, height });
    await page.clock.runFor(100);
    await expectNoScroll(page, `${width} px`, fail);
    // No purchases for 10 s: the numbers keep changing, the buttons must not move.
    const edges = new Set([await buttonEdges(page)]);
    for (let i = 0; i < STILL_S * 4; i++) {
      await page.clock.runFor(250);
      edges.add(await buttonEdges(page));
    }
    if (edges.size !== 1)
      fail(`buy buttons moved at ${width} px: ${edges.size} layouts in ${STILL_S} s`);
    console.log(`m2: ${width}×${height}: no horizontal scroll, buttons still for ${STILL_S} s`);
    await shot(`late-${width}`);
  }
}
