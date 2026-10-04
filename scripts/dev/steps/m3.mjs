// M3 playtest (ROADMAP M3, GDD §17, §18, §22.11). Run:
//   npm run build && npm run playtest -- --steps scripts/dev/steps/m3.mjs --port 4318
//
// 1. A new game shows only the header (x = 10), the Generator 1 row and the Settings button.
//    Screenshots at 1280×800 and 375×667.
// 2. The reusable playable check (Buy on G1, x rises within 5 s).
// 3. On Playwright's fake clock: buy G1, 25 s later the G2 silhouette shows "Buy 1 · 100",
//    dimmed, with its text still at ≥ 4.5:1 on the page (opacity blended in).
// 4. Twelve simulated minutes of Max all, then at 1280, 1024, 390 and 375 px: no horizontal
//    scroll, no content spilling out of its cell or button, every visible control at least
//    44×44 px on mobile, the buy buttons still for 10 s, and screenshots. In the card layout the
//    global row's Buy 1 and Max line up with the tier rows'.
// 5. The breakdown at 1280 px is anchored under its trigger and covers no buy button; a click
//    outside closes it. At 768 px its table is not styled as a generator card.
// 6. Focus is never hidden under the sticky header: Shift+Tab up through the controls at
//    1280×450 and 390×844.
// 7. G1's breakdown at 375 px is a bottom sheet inside the viewport; Escape closes it.
// 8. Escape in Settings over an open breakdown closes Settings only; showing the tab again
//    re-fades nothing; the panel is at most 32rem wide.
// 9. Engineering, precision 4 and integer threshold 1e9 (the widest numbers): nothing spills at
//    1280 or 1160 px.
// 10. Settings: tap targets and no scroll; the light theme and Engineering notation apply, and
//    survive a reload.
// 11. A fault on a scrolled phone (a second page, whose expected console error is not this
//    run's): the recovery panel's Reload takes the focus and is fully visible.
// 12. Throughout: every request is same-origin, fonts are woff2 only and at most the 4 shipped
//    files. (The playtest script itself fails on any console error.)
import {
  buttonEdges,
  click,
  contrastOf,
  expectNoScroll as noScroll,
  expectTapTargets as tapTargets,
  failer,
  reloadAsNewGame,
  spills,
} from './lib.mjs';
import playable, { readX } from './playable.mjs';

const fail = failer('m3');
const expectNoScroll = (page, where) => noScroll(page, where, fail);
const expectTapTargets = (page, where) => tapTargets(page, where, fail, MIN_TAP);

const LONG_RUN_S = 12 * 60;
const BUY_EVERY_MS = 2000;
const STILL_S = 10;
const MIN_TAP = 44;
const WIDTHS = [
  [1280, 800],
  [1024, 768],
  [390, 844],
  [375, 667],
];
const FONTS = new Set([
  'jetbrains-mono-latin-400-normal',
  'jetbrains-mono-latin-500-normal',
  'jetbrains-mono-greek-400-normal',
  'jetbrains-mono-greek-500-normal',
]);

function tiers(page) {
  return page.$$eval('tr[data-tier]', (rows) => rows.map((r) => r.getAttribute('data-tier')));
}

export default async function m3(page, shot) {
  const origin = new URL(page.url()).origin;
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));

  // 1. A new game (M4 keeps the save across a plain reload).
  await reloadAsNewGame(page);
  await page.locator('[data-tier="1"]').waitFor({ timeout: 10_000 });
  const first = await page.evaluate(() => ({
    title: document.title,
    tiers: [...document.querySelectorAll('tr[data-tier]')].map((r) => r.getAttribute('data-tier')),
    global: document.querySelector('[data-global]') !== null,
    maxAll: document.querySelector('[data-mode="maxAll"]') !== null,
    tablist: document.querySelector('[role="tablist"]') !== null,
    buttons: [...document.querySelectorAll('button')].map(
      (b) => b.getAttribute('data-mode') ?? (b.hasAttribute('data-settings') ? 'settings' : 'mult'),
    ),
    goal: document.querySelector('[data-goal]')?.textContent,
    growth: document.querySelector('[data-growth]')?.textContent,
  }));
  if (first.title !== 'Integer Sequence Idle') fail(`title is ${first.title}`);
  if (first.tiers.join() !== '1') fail(`a new game shows rows ${first.tiers.join()}`);
  if (first.global || first.maxAll || first.tablist)
    fail('a new game shows more than G1 and Settings');
  if (first.buttons.join() !== 'settings,mult,one,until10,max')
    fail(`buttons: ${first.buttons.join()}`);
  if ((await readX(page)) !== 10) fail('x is not 10 in a new game');
  console.log(
    `m3: new game: x = 10, rows [${first.tiers}], buttons [${first.buttons}], goal "${first.goal}", growth "${first.growth}"`,
  );
  await shot('initial-1280');
  await page.setViewportSize({ width: 375, height: 667 });
  await expectNoScroll(page, 'new game at 375 px');
  await expectTapTargets(page, 'new game at 375 px');
  await shot('initial-375');
  await page.setViewportSize({ width: 1280, height: 800 });

  // 2. Playable.
  await playable(page, shot);

  // 3. The G2 silhouette at x = 50, on the fake clock.
  await page.clock.install();
  await reloadAsNewGame(page);
  await page.locator('[data-tier="1"]').waitFor({ timeout: 10_000 });
  await page.clock.pauseAt(Date.now() + 1000);
  await click(page, '[data-tier="1"] button[data-mode="one"]');
  await page.clock.runFor(100);
  await page.clock.fastForward(24_000);
  await page.clock.runFor(100);
  if ((await tiers(page)).join() !== '1') fail('G2 shows before x reaches 50');
  // 2 s rather than 1 s: pauseAt() on a running clock can step performance.now() back by up to
  // 1 s, which the loop reads as dt 0, so x can trail the wall clock by that much here.
  await page.clock.fastForward(2_000);
  await page.clock.runFor(100);
  // The reveal fade (150 ms) runs on the real document timeline, not the fake clock.
  await page.waitForTimeout(400);
  const sil = await page.evaluate(() => {
    const row = document.querySelector('tr[data-tier="2"]');
    if (!row) return null;
    const b = row.querySelector('button');
    const own = document.querySelector('tr[data-tier="1"]');
    return {
      silhouette: row.hasAttribute('data-silhouette'),
      buttons: row.querySelectorAll('button').length,
      text: b?.textContent ?? '',
      opacity: Number(getComputedStyle(row).opacity),
      ownOpacity: Number(getComputedStyle(own).opacity),
      border: getComputedStyle(b).borderTopStyle,
      visible: b.getBoundingClientRect().width > 0,
      color: getComputedStyle(b).color,
      bg: getComputedStyle(document.body).backgroundColor,
    };
  });
  if (!sil || !sil.silhouette) fail('no G2 silhouette at x = 50');
  if (sil.buttons !== 1 || !sil.text.includes('Buy 1 · 100') || !sil.visible) {
    fail(`the G2 silhouette is not just "Buy 1 · 100": ${JSON.stringify(sil)}`);
  }
  if (!(sil.opacity < sil.ownOpacity) || sil.border !== 'dashed')
    fail(`the silhouette is not dimmed: ${JSON.stringify(sil)}`);
  // Dimmed, but its enabled text stays readable: its colour drawn at the row's opacity over the
  // page is still ≥ 4.5:1 (GDD §17.3; tests/unit/theme.test.ts checks both themes' tokens).
  const blended = (() => {
    const c = sil.color.match(/[\d.]+/g).map(Number);
    const b = sil.bg.match(/[\d.]+/g).map(Number);
    const a = sil.opacity;
    return `rgb(${[0, 1, 2].map((i) => Math.round(a * c[i] + (1 - a) * b[i])).join(', ')})`;
  })();
  const silContrast = contrastOf(blended, sil.bg);
  if (!(silContrast >= 4.5)) fail(`the silhouette's text is at ${silContrast.toFixed(2)}:1`);
  console.log(
    `m3: G2 silhouette at x = 50: "${sil.text.trim()}", opacity ${sil.opacity}, ${sil.border} border, text ${silContrast.toFixed(2)}:1`,
  );
  await shot('silhouette');

  // 4. Twelve simulated minutes of Max all, then the layout checks.
  for (let ms = 0; ms < LONG_RUN_S * 1000; ms += BUY_EVERY_MS) {
    await click(page, '[data-mode="maxAll"]');
    await page.clock.fastForward(BUY_EVERY_MS);
    await page.clock.runFor(50);
  }
  const rows = await tiers(page);
  if (rows.length !== 8) fail(`after ${LONG_RUN_S / 60} min, rows [${rows}]`);
  const x = await page.$eval(
    '[data-x]',
    (el) => (el.querySelector('[aria-hidden="true"]') ?? el).textContent,
  );
  console.log(`m3: after ${LONG_RUN_S / 60} simulated min of Max all, x = ${x}, 8 rows`);
  for (const [width, height] of WIDTHS) {
    await page.setViewportSize({ width, height });
    await page.clock.runFor(100);
    await expectNoScroll(page, `${width} px`);
    if (width <= 640) await expectTapTargets(page, `${width} px`);
    const spilled = await spills(page);
    if (spilled.length > 0) fail(`${width} px: content spills: ${spilled.join('; ')}`);
    const layout = await page.evaluate(() => {
      const left = (sel) => document.querySelector(sel)?.getBoundingClientRect().left ?? null;
      return {
        display: getComputedStyle(document.querySelector('.sum-table')).display,
        tierOne: left('tr[data-tier="1"] button[data-mode="one"]'),
        tierMax: left('tr[data-tier="1"] button[data-mode="max"]'),
        globalOne: left('tr[data-global] button[data-mode="one"]'),
        globalMax: left('tr[data-global] button[data-mode="max"]'),
      };
    });
    // In the card layout, every row's Buy 1 and Max share columns (the global row included).
    if (
      Math.abs(layout.tierOne - layout.globalOne) > 1 ||
      Math.abs(layout.tierMax - layout.globalMax) > 1
    )
      fail(`${width} px: the global row's buttons do not line up: ${JSON.stringify(layout)}`);
    const edges = new Set([await buttonEdges(page)]);
    for (let i = 0; i < STILL_S * 4; i++) {
      await page.clock.runFor(250);
      edges.add(await buttonEdges(page));
    }
    if (edges.size !== 1)
      fail(`buy buttons moved at ${width} px: ${edges.size} layouts in ${STILL_S} s`);
    console.log(
      `m3: ${width}×${height}: ${layout.display === 'table' ? 'table' : 'cards'}, no horizontal scroll or spill, tap targets ok, columns aligned, buttons still for ${STILL_S} s`,
    );
    await shot(`late-${width}`);
  }

  // 5. The breakdown at 1280 px: anchored under its trigger, over no buy button; light dismiss.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.clock.runFor(100);
  await page.locator('tr[data-tier="3"] button[data-breakdown]').click();
  await page.clock.runFor(100);
  const pop = await page.evaluate(() => {
    const p = document.querySelector('[data-breakdown-panel]').getBoundingClientRect();
    const t = document
      .querySelector('tr[data-tier="3"] button[data-breakdown]')
      .getBoundingClientRect();
    const covered = [...document.querySelectorAll('[data-tab] button.buy')]
      .filter((b) => {
        const r = b.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return hit !== null && hit.closest('[data-breakdown-panel]') !== null;
      })
      .map((b) => b.id);
    return {
      top: p.top,
      right: p.right,
      left: p.left,
      tBottom: t.bottom,
      tRight: t.right,
      covered,
    };
  });
  if (
    pop.top < pop.tBottom - 1 ||
    pop.top > pop.tBottom + 12 ||
    Math.abs(pop.right - pop.tRight) > 2
  )
    fail(`the breakdown is not anchored under its trigger: ${JSON.stringify(pop)}`);
  if (pop.covered.length > 0) fail(`the breakdown covers buy buttons: ${pop.covered.join(' ')}`);
  await shot('breakdown-1280');
  await page.mouse.click(5, 795);
  await page.clock.runFor(100);
  if (await page.$('[data-breakdown-panel]')) fail('a click outside did not close the breakdown');
  console.log(
    `m3: breakdown at 1280 px: under its trigger (top ${Math.round(pop.top)}, trigger bottom ${Math.round(pop.tBottom)}), no buy button covered, a click outside closes it`,
  );
  // At 768 px (cards): the breakdown's own table is not a generator card.
  await page.setViewportSize({ width: 768, height: 900 });
  await page.clock.runFor(100);
  await page.locator('tr[data-tier="8"] button[data-breakdown]').click();
  await page.clock.runFor(100);
  const leak = await page.evaluate(() => {
    const tr = document.querySelector('[data-breakdown-panel] tr');
    const th = tr.querySelector('th');
    const td = tr.querySelector('td');
    const panel = document.querySelector('[data-breakdown-panel]').getBoundingClientRect();
    return {
      trDisplay: getComputedStyle(tr).display,
      thWeight: getComputedStyle(th).fontWeight,
      tdRight: td.getBoundingClientRect().right,
      panelRight: panel.right,
      inside: panel.left >= 0 && panel.right <= document.documentElement.clientWidth,
    };
  });
  if (
    leak.trDisplay !== 'table-row' ||
    leak.thWeight !== '400' ||
    leak.panelRight - leak.tdRight > 16 ||
    !leak.inside
  )
    fail(`the breakdown at 768 px is styled as a card: ${JSON.stringify(leak)}`);
  await shot('breakdown-768');
  await page.keyboard.press('Escape');
  await page.clock.runFor(100);

  // 6. Focus is never hidden under the sticky header (Shift+Tab up from Max all).
  for (const [width, height] of [
    [1280, 450],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.clock.runFor(100);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.locator('tr[data-global] button[data-mode="max"]').focus();
    const hidden = [];
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Shift+Tab');
      const f = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const r = el.getBoundingClientRect();
        const header = document.querySelector('.shell-header').getBoundingClientRect();
        return {
          id: el.id || el.getAttribute('data-mode') || el.tagName,
          top: r.top,
          bottom: r.bottom,
          headerBottom: header.bottom,
          inHeader: el.closest('.shell-header') !== null,
          vh: window.innerHeight,
        };
      });
      if (f === null || f.inHeader) break;
      if (f.top < f.headerBottom - 0.5 || f.bottom > f.vh + 0.5) hidden.push(JSON.stringify(f));
    }
    if (hidden.length > 0) fail(`${width}×${height}: focus hidden: ${hidden.join(' ')}`);
    console.log(`m3: ${width}×${height}: Shift+Tab keeps every focused control below the header`);
  }
  await page.setViewportSize({ width: 375, height: 667 });
  await page.clock.runFor(100);

  // 7. The breakdown at 375 px: a bottom sheet inside the viewport; Escape closes it.
  await page.locator('tr[data-tier="1"] button[data-breakdown]').click();
  await page.clock.runFor(100);
  const sheet = await page.evaluate(() => {
    const p = document.querySelector('[data-breakdown-panel]');
    if (!p) return null;
    const r = p.getBoundingClientRect();
    return {
      left: r.left,
      right: r.right,
      bottom: r.bottom,
      top: r.top,
      vw: document.documentElement.clientWidth,
      vh: window.innerHeight,
      rows: p.querySelectorAll('tr[data-factor]').length,
      focus: document.activeElement?.hasAttribute('data-close') ?? false,
    };
  });
  if (!sheet) fail('the breakdown did not open');
  if (
    sheet.left < 0 ||
    sheet.right > sheet.vw + 0.5 ||
    sheet.bottom > sheet.vh + 0.5 ||
    sheet.top < 0
  ) {
    fail(`the breakdown sheet is outside the viewport: ${JSON.stringify(sheet)}`);
  }
  if (Math.abs(sheet.bottom - sheet.vh) > 1)
    fail(`the breakdown is not a bottom sheet: ${JSON.stringify(sheet)}`);
  await expectNoScroll(page, 'breakdown at 375 px');
  await expectTapTargets(page, 'breakdown at 375 px');
  console.log(
    `m3: breakdown at 375 px: a bottom sheet with ${sheet.rows} factor rows, focus on Close`,
  );
  await shot('breakdown-375');
  await page.keyboard.press('Escape');
  await page.clock.runFor(100);
  if (await page.$('[data-breakdown-panel]')) fail('Escape did not close the breakdown');
  const back = await page.evaluate(() => document.activeElement?.hasAttribute('data-breakdown'));
  if (!back) fail('the focus did not return to the breakdown trigger');

  // 8. Escape in Settings over an open breakdown closes Settings only; nothing re-fades; the
  // panel is at most 32rem wide.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.clock.runFor(100);
  await page.locator('tr[data-tier="2"] button[data-breakdown]').click();
  await page.locator('[data-settings]').click();
  await page.clock.runFor(100);
  const width = await page.evaluate(
    () => document.querySelector('[data-settings-panel]').getBoundingClientRect().width,
  );
  if (width > 32 * 16 + 0.5) fail(`the Settings panel is ${width} px wide`);
  await page.locator('select[data-setting="notation"]').focus();
  await page.keyboard.press('Escape');
  await page.clock.runFor(100);
  const layered = await page.evaluate(() => ({
    settings: document.querySelector('[data-settings-panel]') !== null,
    breakdown: document.querySelector('[data-breakdown-panel]') !== null,
    fading: document.getAnimations().filter((a) => a.animationName === 'reveal-in').length,
  }));
  if (layered.settings || !layered.breakdown || layered.fading > 0)
    fail(`Escape in Settings over a breakdown: ${JSON.stringify(layered)}`);
  await page.keyboard.press('Escape');
  await page.clock.runFor(100);
  if (await page.$('[data-breakdown-panel]')) fail('the second Escape did not close the breakdown');
  console.log(
    `m3: Escape in Settings closes Settings only (the breakdown stays, nothing re-fades); Settings is ${Math.round(width)} px wide`,
  );

  // 9. The widest numbers (Engineering, precision 4, integer threshold 1e9) spill nowhere.
  await page.locator('[data-settings]').click();
  await page.selectOption('select[data-setting="notation"]', 'engineering');
  await page.selectOption('select[data-setting="precision"]', '4');
  await page.selectOption('select[data-setting="intThreshold"]', '1000000000');
  await page.locator('[data-settings-panel] [data-close]').click();
  for (const w of [1280, 1160]) {
    await page.setViewportSize({ width: w, height: 800 });
    await page.clock.runFor(100);
    const spilled = await spills(page);
    if (spilled.length > 0)
      fail(`${w} px, precision 4, 1e9: content spills: ${spilled.join('; ')}`);
    await expectNoScroll(page, `${w} px, precision 4, 1e9`);
    await shot(`wide-numbers-${w}`);
  }
  console.log('m3: Engineering, precision 4, threshold 1e9: nothing spills at 1280 or 1160 px');
  await page.locator('[data-settings]').click();
  await page.selectOption('select[data-setting="precision"]', '2');
  await page.selectOption('select[data-setting="intThreshold"]', '1000000');
  await page.locator('[data-settings-panel] [data-close]').click();
  await page.setViewportSize({ width: 375, height: 667 });
  await page.clock.runFor(100);

  // 10. Settings: the light theme and Engineering notation, kept across a reload.
  await page.locator('[data-settings]').click();
  await page.clock.runFor(100);
  await expectNoScroll(page, 'settings at 375 px');
  await expectTapTargets(page, 'settings at 375 px');
  await page.selectOption('select[data-setting="notation"]', 'engineering');
  await page.getByRole('tab', { name: 'Display' }).click();
  await page.selectOption('select[data-setting="theme"]', 'light');
  await page.clock.runFor(100);
  await expectTapTargets(page, 'settings (display) at 375 px');
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  if (theme !== 'light') fail(`the theme is ${theme}`);
  await shot('settings-light-375');
  await page.locator('[data-settings-panel] [data-close]').click();
  await page.clock.runFor(100);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.clock.runFor(100);
  await shot('late-light-1280');
  await page.reload();
  await page.locator('[data-tier="1"]').waitFor({ timeout: 10_000 });
  const kept = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    stored: localStorage.getItem('isi.settings'),
  }));
  if (kept.theme !== 'light' || !kept.stored?.includes('"notation":"engineering"')) {
    fail(`settings did not survive a reload: ${JSON.stringify(kept)}`);
  }
  console.log(`m3: settings kept across a reload: ${kept.stored}`);

  // 11. A fault on a scrolled phone: Reload takes the focus and is fully visible, not under the
  // sticky header. A second page, since the fault logs "game paused" to its console.
  const phone = await page
    .context()
    .browser()
    .newPage({ viewport: { width: 390, height: 844 } });
  await phone.goto(page.url());
  for (const y of [40, 70, 120]) {
    await phone.reload();
    await phone.locator('[data-tier="1"]').waitFor({ timeout: 10_000 });
    await phone.evaluate((top) => {
      // Room to scroll (a new game is one row; there is no save to load before M4).
      document.body.style.minHeight = '3000px';
      window.scrollTo(0, top);
      window.dispatchEvent(new ErrorEvent('error', { error: new Error('planted'), message: 'x' }));
    }, y);
    await phone.locator('[data-recovery]').waitFor({ timeout: 5_000 });
    // The panel takes the focus after it renders (an effect).
    await phone
      .waitForFunction(() => document.activeElement?.closest('[data-recovery]') != null, null, {
        timeout: 2_000,
      })
      .catch(() => {});
    const rec = await phone.evaluate(() => {
      const reload = document.querySelector('[data-recovery] button[data-action="reload"]');
      const r = reload.getBoundingClientRect();
      const header = document.querySelector('.shell-header').getBoundingClientRect();
      return {
        focused: document.activeElement === reload,
        top: r.top,
        bottom: r.bottom,
        headerBottom: header.bottom,
        vh: window.innerHeight,
        scrollY: window.scrollY,
      };
    });
    if (!rec.focused || rec.top < rec.headerBottom - 0.5 || rec.bottom > rec.vh + 0.5)
      fail(`after a fault at scrollY ${y}, Reload is hidden: ${JSON.stringify(rec)}`);
  }
  await phone.close();
  console.log('m3: a fault on a scrolled phone: Reload is focused and below the header');

  // 12. Requests: same-origin only; fonts are woff2 and at most the 4 shipped files.
  const foreign = requests.filter((u) => !u.startsWith(origin) && !u.startsWith('data:'));
  if (foreign.length > 0) fail(`cross-origin requests: ${foreign.join(' ')}`);
  const fonts = requests.filter((u) => /\.(woff2?|ttf|otf)(\?|$)/.test(u));
  const names = new Set(fonts.map((u) => u.replace(/^.*\//, '').replace(/-[\w-]{8}\.woff2$/, '')));
  if (fonts.some((u) => !u.includes('.woff2')) || [...names].some((n) => !FONTS.has(n))) {
    fail(`unexpected font requests: ${fonts.join(' ')}`);
  }
  console.log(
    `m3: ${requests.length} requests, all same-origin; fonts: ${[...names].sort().join(', ')}`,
  );
}
