// The "playable" check of every milestone (ROADMAP "How this roadmap is executed", GDD §22):
// click Buy on Generator 1, then x must rise within the next 5 s. Use it on its own
// (`npm run playtest -- --steps scripts/dev/steps/playable.mjs`) or from a milestone's steps.
//
// It relies only on the stable hooks `[data-tier]`, `[data-mode]` and `[data-x]`, never on the
// number of rows (M3's reveal rule changes that), so every later milestone can reuse it.

/** The x shown in the header (the visible text, without the screen-reader form). */
export async function readX(page) {
  const text = await page.$eval('[data-x]', (el) => {
    const shown = el.querySelector('[aria-hidden="true"]') ?? el;
    return shown.textContent ?? '';
  });
  const value = Number(text.replace(/,/g, '').trim());
  if (!Number.isFinite(value)) throw new Error(`x is not a number: ${JSON.stringify(text)}`);
  return value;
}

export default async function playable(page, shot) {
  const buy = page.locator('[data-tier="1"] button[data-mode="one"]');
  await buy.waitFor({ state: 'visible', timeout: 10_000 });
  await shot('before-buy');
  await buy.click();
  // The purchase applies at the next 50 ms tick; take the lowest x of the next 0.5 s as the start.
  let start = await readX(page);
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(100);
    start = Math.min(start, await readX(page));
  }
  const deadline = Date.now() + 5000;
  let now = start;
  while (Date.now() < deadline) {
    await page.waitForTimeout(250);
    now = await readX(page);
    if (now > start) break;
  }
  await shot('after-buy');
  if (!(now > start)) throw new Error(`x did not rise within 5 s after Buy (stayed at ${start})`);
  console.log(`playable: x rose from ${start} to ${now} after Buy on Generator 1`);
}
