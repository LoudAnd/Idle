// M4 playtest (ROADMAP M4, GDD §19, §20, §21.9). Run against the production build:
//   npm run build && npm run playtest -- --steps scripts/dev/steps/m4.mjs --port 4318
// and against the dev hooks (the playtest build, and the dev server):
//   npm run build:playtest && npm run playtest -- --dist dist-playtest \
//     --path '/?fixture=late-sum&speed=100' --steps scripts/dev/steps/m4.mjs --port 4319
//   npm run playtest -- --serve dev --path '/?fixture=late-sum&speed=100' \
//     --steps scripts/dev/steps/m4.mjs --port 4320
//
// Opened without `?fixture=` (dist/):
// 1. The playable check (Buy on G1, x rises within 5 s).
// 2. Persistence: Save now ("Saved"), reload: G1 is still bought and x is kept.
// 3. Export, then Hard reset (type RESET): a new game; paste the export, Import, Confirm: the
//    game is back. Screenshots of the Save panel at 1280×800 and 375×667 (tap targets ≥ 44 px,
//    no horizontal scroll).
// 4. A second page in the same context: the first shows "Open in another tab" and stops; Use
//    here moves the game back. Screenshots of the banner.
// 5. Offline: on Playwright's clock, leave the page, move the wall clock 2 h on and come back:
//    the progress modal, then While away with before and after values; Escape closes it.
//    Screenshots at both sizes.
// 6. A new context whose localStorage getter throws: the storage banner shows and x still rises.
// 7. The same URL with `?fixture=late-sum&speed=100` on dist/ is a plain new game, and none of
//    the shipped JavaScript contains the dev-hook marker.
//
// Opened with `?fixture=` (dist-playtest/ or the dev server): the fixture's x and its eight
// tiers show, game time runs about 100× fast, and `<html data-dev-hooks>` is set.
//
// The playtest script itself fails on any console error of the main page; the extra pages and
// contexts here collect their own.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expectNoScroll as noScroll, expectTapTargets as tapTargets, failer } from './lib.mjs';
import playable, { readX } from './playable.mjs';

const fail = failer('m4');
const expectNoScroll = (page, where) => noScroll(page, where, fail);
const expectTapTargets = (page, where) => tapTargets(page, where, fail, 44);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const MARKER = 'isi-dev-hooks';
const HOUR_MS = 3_600_000;
const SIZES = [
  [1280, 800],
  [375, 667],
];

/** Console errors of an extra page or context, which the playtest runner does not watch. */
function watch(page, errors) {
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${page.url()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`${page.url()}: ${e.message}`));
}

async function bought(page, tier) {
  const text = await page.$eval(`[data-tier="${tier}"] [data-bought]`, (el) => el.textContent);
  return Number(text.replace(/\D+/g, ''));
}

async function openSave(page) {
  await page.locator('[data-settings]').click();
  await page.getByRole('tab', { name: 'Save' }).click();
  await page.locator('[data-save-panel]').waitFor();
}

async function closeSettings(page) {
  await page.locator('[data-settings-panel] [data-close]').click();
}

async function shots(page, shot, name, check = true) {
  for (const [width, height] of SIZES) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(150);
    if (check) {
      await expectNoScroll(page, `${name} at ${width} px`);
      if (width === 375) await expectTapTargets(page, `${name} at ${width} px`);
    }
    await shot(`${name}-${width}`, page);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}

/** The fixture's x (log10) and bought counts, from its committed envelope. */
function fixtureOf(name) {
  const env = JSON.parse(
    readFileSync(join(ROOT, 'tests', 'fixtures', 'dev', `${name}.json`), 'utf8'),
  );
  const [sign, layer, mag] = env.state.sum.x;
  if (sign !== 1) throw new Error('fixture x is not positive');
  const log10 = layer === 0 ? Math.log10(mag) : layer === 1 ? mag : Number.POSITIVE_INFINITY;
  return { log10, bought: env.state.sum.bought };
}

/** The headline x as log10 (it may be in mantissa form, e.g. 1.15e100). */
async function readLog10X(page) {
  const text = await page.$eval('[data-x]', (el) => {
    const shown = el.querySelector('[aria-hidden="true"]') ?? el;
    return shown.textContent ?? '';
  });
  const m = /^([\d.]+)e([\d,]+)$/.exec(text.trim());
  if (m) return Math.log10(Number(m[1])) + Number(m[2].replace(/,/g, ''));
  const v = Number(text.replace(/,/g, ''));
  if (!(v > 0)) throw new Error(`x is not readable: ${text}`);
  return Math.log10(v);
}

async function devHooks(page, shot) {
  const url = new URL(page.url());
  const name = url.searchParams.get('fixture');
  const speed = Number(url.searchParams.get('speed') ?? '1');
  await page.locator('[data-tier="1"]').waitFor({ timeout: 10_000 });
  const marker = await page.evaluate(() => document.documentElement.dataset.devHooks ?? null);
  if (marker !== MARKER) fail(`<html data-dev-hooks> is ${marker}`);
  const rows = await page.locator('tr[data-tier]').count();
  if (name === 'late-sum' && rows !== 8) fail(`late-sum shows ${rows} tiers`);
  const fixture = fixtureOf(name);
  // The bought counts are the fixture's exactly (only purchases change them), and x has grown
  // from the fixture's during the runner's wait, at `speed`.
  const counts = [];
  for (let k = 1; k <= rows; k++) counts.push(await bought(page, k));
  if (counts.join() !== fixture.bought.slice(0, rows).join()) {
    fail(`bought ${counts.join()}, the fixture's ${fixture.bought.join()}`);
  }
  const got = await readLog10X(page);
  if (!(got >= fixture.log10 - 0.01)) fail(`x is 1e${got}, below the fixture's 1e${fixture.log10}`);
  console.log(
    `m4: dev hook: ${name} loaded: bought ${counts.join()}; log10 x ${got.toFixed(2)} (fixture ${fixture.log10.toFixed(2)})`,
  );
  await shot(`dev-hook-${name}`);
  // Game time runs `speed` times faster. Measured on the new-game fixture, where it is linear:
  // after one G1 purchase x grows by exactly 2 per second of game time.
  const fresh = await page.context().newPage();
  const errors = [];
  watch(fresh, errors);
  await fresh.goto(`${url.origin}/?fixture=new-game&speed=${speed}`);
  await fresh.locator('[data-tier="1"] button[data-mode="one"]').click();
  await fresh.waitForTimeout(300);
  const x0 = await readX(fresh);
  const t0 = Date.now();
  await fresh.waitForTimeout(1000);
  const x1 = await readX(fresh);
  const factor = (x1 - x0) / 2 / ((Date.now() - t0) / 1000);
  if (!(factor > speed * 0.5 && factor < speed * 1.5)) {
    fail(`game time ran ${factor.toFixed(1)}× real time, expected about ${speed}×`);
  }
  console.log(`m4: dev hook: speed ${speed}: game time ran ${factor.toFixed(0)}× real time`);
  await fresh.close();
  if (errors.length > 0) fail(`console errors: ${errors.join(' | ')}`);
}

export default async function m4(page, shot) {
  if (new URL(page.url()).searchParams.has('fixture')) return devHooks(page, shot);
  const origin = new URL(page.url()).origin;
  const extraErrors = [];

  // 1. Playable.
  await page.locator('[data-tier="1"]').waitFor({ timeout: 10_000 });
  await playable(page, shot);

  // 2. Persistence across a reload.
  await openSave(page);
  await page.locator('[data-action="save"]').click();
  const status = await page.locator('[data-save-status]').textContent();
  if (status !== 'Saved') fail(`Save now says "${status}"`);
  await closeSettings(page);
  const xSaved = await readX(page);
  if ((await bought(page, 1)) !== 1) fail('G1 is not bought before the reload');
  await page.reload();
  await page.locator('[data-tier="1"]').waitFor({ timeout: 10_000 });
  await page.waitForTimeout(300);
  const xLoaded = await readX(page);
  if ((await bought(page, 1)) !== 1) fail('G1 was not kept across the reload');
  if (!(xLoaded >= xSaved * 0.999)) fail(`x was not kept: ${xSaved} saved, ${xLoaded} loaded`);
  console.log(`m4: persistence: G1 bought and x ${xSaved} → ${xLoaded} across a reload`);

  // 3. Export, hard reset, import.
  await openSave(page);
  await page.locator('[data-action="export"]').click();
  const exportBox = page.locator('[data-save-panel] [data-export-text]');
  await exportBox.waitFor();
  const text = await exportBox.inputValue();
  if (!/^ISI1u?:/.test(text)) fail(`the export is not a save frame: ${text.slice(0, 20)}`);
  await shots(page, shot, 'save-panel');
  await page.locator('[data-reset-text]').fill('RESET');
  await page.locator('[data-action="reset"]').click();
  await page.waitForTimeout(200);
  await closeSettings(page);
  if ((await bought(page, 1)) !== 0 || (await readX(page)) !== 10) fail('hard reset did not reset');
  const stored = await page.evaluate(() => Object.keys(localStorage).sort());
  console.log(`m4: hard reset: a new game; keys now ${stored.join(', ')}`);
  await openSave(page);
  await page.locator('[data-import-text]').fill(text);
  await page.locator('[data-action="import"]').click();
  await page.locator('[data-action="confirm"]').click();
  await page.waitForTimeout(200);
  const imported = await page.locator('[data-import-status]').textContent();
  if (imported !== 'Imported') fail(`import says "${imported}"`);
  await closeSettings(page);
  if ((await bought(page, 1)) !== 1) fail('the import did not bring G1 back');
  console.log(`m4: export (${text.slice(0, 5)}…, ${text.length} chars) re-imported after a reset`);

  // 4. A second page in the same context takes over; Use here moves the game back.
  const second = await page.context().newPage();
  watch(second, extraErrors);
  await second.goto(page.url());
  await second.locator('[data-tier="1"]').waitFor({ timeout: 10_000 });
  await page.locator('[data-banner="tab"]').waitFor({ timeout: 5_000 });
  const disabled = await page.$eval('[data-tier="1"] button[data-mode="one"]', (b) => b.disabled);
  if (!disabled) fail('the older page still has enabled controls');
  await shots(page, shot, 'banner-tab', false);
  await page.locator('[data-banner="tab"] [data-action="use-here"]').click();
  await second.locator('[data-banner="tab"]').waitFor({ timeout: 5_000 });
  await page.locator('[data-banner="tab"]').waitFor({ state: 'detached', timeout: 5_000 });
  console.log('m4: a second page took over; Use here moved the game back');
  await second.close();

  // 5. Offline: leave, move the wall clock 2 h on, come back.
  await page.clock.install();
  await page.goto(`${origin}/`);
  await page.locator('[data-tier="1"]').waitFor({ timeout: 10_000 });
  await page.clock.runFor(1000);
  await page.goto('about:blank'); // pagehide saves with the current time
  await page.clock.fastForward(2 * HOUR_MS + 60_000);
  await page.goto(`${origin}/`);
  await page.locator('[data-offline-progress]').waitFor({ timeout: 10_000 });
  console.log('m4: offline: the progress modal shows');
  for (let i = 0; i < 40; i++) {
    await page.clock.runFor(200);
    if ((await page.locator('[data-while-away]').count()) > 0) break;
  }
  await page.locator('[data-while-away]').waitFor({ timeout: 5_000 });
  const away = await page.evaluate(() => {
    const d = document.querySelector('[data-while-away]');
    const cell = (tr, s) => {
      const el = tr.querySelector(s);
      return (el.querySelector('[aria-hidden="true"]') ?? el).textContent;
    };
    return {
      time: d.querySelector('[data-away-time]').textContent,
      rows: [...d.querySelectorAll('tr[data-row]')].map((tr) => [
        tr.getAttribute('data-row'),
        cell(tr, '[data-before]'),
        cell(tr, '[data-after]'),
      ]),
      focused: d.contains(document.activeElement),
    };
  });
  if (!away.time.startsWith('+2')) fail(`While away says ${away.time}`);
  const xRow = away.rows.find((r) => r[0] === 'x');
  if (!xRow || xRow[1] === xRow[2])
    fail(`While away has no x change: ${JSON.stringify(away.rows)}`);
  if (!away.rows.some((r) => r[0] === 'g1')) fail('While away has no Generator 1 row');
  if (!away.focused) fail('While away does not have the focus');
  console.log(`m4: While away ${away.time}: ${away.rows.map((r) => r.join(' ')).join('; ')}`);
  await shots(page, shot, 'while-away');
  await page.keyboard.press('Escape');
  await page.locator('[data-while-away]').waitFor({ state: 'detached', timeout: 2_000 });
  console.log('m4: Escape closed While away');

  // 6. A blocked localStorage: the game runs in memory with the storage banner.
  const blocked = await page
    .context()
    .browser()
    .newContext({ viewport: { width: 1280, height: 800 } });
  await blocked.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
  });
  const mem = await blocked.newPage();
  watch(mem, extraErrors);
  await mem.goto(`${origin}/`);
  await mem.locator('[data-banner="memory"]').waitFor({ timeout: 10_000 });
  await playable(mem, async () => {});
  await shots(mem, shot, 'banner-storage', false);
  console.log('m4: a throwing localStorage: the storage banner shows and x rises');
  await blocked.close();

  // 7. The dev-hook URL on dist/ is a plain new game, and no shipped JS has the marker.
  const plain = await page.context().browser().newContext();
  const hooked = await plain.newPage();
  watch(hooked, extraErrors);
  const scripts = [];
  hooked.on('response', (r) => {
    if (r.url().endsWith('.js')) scripts.push(r);
  });
  await hooked.goto(`${origin}/?fixture=late-sum&speed=100`);
  await hooked.locator('[data-tier="1"]').waitFor({ timeout: 10_000 });
  const plainState = await hooked.evaluate(() => ({
    marker: document.documentElement.dataset.devHooks ?? null,
    rows: document.querySelectorAll('tr[data-tier]').length,
  }));
  if (plainState.marker !== null || plainState.rows !== 1) {
    fail(`dist/ honoured the dev hook: ${JSON.stringify(plainState)}`);
  }
  if (scripts.length === 0) fail('no scripts seen');
  for (const r of scripts) {
    if ((await r.text()).includes(MARKER)) fail(`${r.url()} contains the dev-hook marker`);
  }
  console.log(`m4: dist/ ignores ?fixture= and its ${scripts.length} script(s) have no marker`);
  await plain.close();

  if (extraErrors.length > 0) fail(`console errors on extra pages: ${extraErrors.join(' | ')}`);
}
