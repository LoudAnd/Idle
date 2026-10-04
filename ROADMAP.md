# Roadmap — Integer Sequence Idle

This is an abstract-numbers idle game built only from openly licensed assets. The design is in
[`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md), referred to below as GDD; section numbers point
into it. The sources and licence obligations are in [`docs/SOURCES.md`](docs/SOURCES.md). The
prototype scripts behind the GDD's reference numbers are in
[`docs/prototypes/`](docs/prototypes/README.md).

## How this roadmap is executed

1. **One milestone at a time, in order.** Each milestone runs as one workflow:
   1. **Plan.** Read the GDD sections the milestone cites.
   2. **Implement.**
   3. **Verify.** Run `npm run check` and `npm run build`, plus the milestone's own commands
      (`npm run sim`, `npm run assets`, `npm run playtest`, `npm run bench`).
   4. **Adversarial review** for correctness, balance, asset-rule compliance, and UX and
      accessibility.
   5. **Fix** what the review found.
   6. **Commit and push.**
2. **Save after every milestone.** A milestone is finished only when all of these hold:
   - `npm run check` and `npm run build` pass.
   - The game is **playable**: the scripted playtest of the built game clicks Buy on
     Generator 1, sees x rise over the next 5 s, and logs 0 console errors (GDD §22).
   - Saves from earlier milestones still load (a migration and a frozen fixture for each save
     version, and for each settings version).
   - The work is committed and pushed to `claude/idle-game-dev-oq3ded`.

   The next milestone starts only after that push.
3. **Bookkeeping.**
   - In the milestone's own commit: set `Status: done`, tick every acceptance box except
     "Committed and pushed", and add a `Notes:` line with any deviation.
   - A commit cannot contain its own sha. So the **next** milestone's commit ticks the previous
     milestone's "Committed and pushed" box and records its short sha in that milestone's
     `Notes:`.
   - If a formula or rule changed, update the GDD and its changelog (GDD §25) in the same
     commit. If content was added, add its Appendix C templates in the same commit.
4. **Balance rule.** Each milestone lists the bands that block it ("Blocking bands") and the
   ones it only reports. To meet a blocking band, change only the knobs in GDD §14.3, within
   their ranges, and re-run every earlier blocking band. Frozen constants never change after
   their milestone. If a band still fails, follow the escalation in GDD §14.3: record the miss
   in `docs/balance/M<n>.md`, mark the band `escalated`, and insert a balance milestone
   `M<n>-bal` right after the current one. A band can therefore never block indefinitely.
5. **Blocked?** Use the documented fallback, record it in the milestone notes, and continue. For
   example, if the token lacks `workflow` scope, put workflows in `docs/ci/workflows/` and use
   `npm run ci`.
6. **When every milestone is done, create more.** Promote the top items of the Backlog into new
   milestones (M24, M25, …) in the same format: Goal, Scope, Acceptance criteria, Out of scope.
   Execute them the same way, and keep the Backlog at 12 or more ideas.

## Rules

- **No generated assets.** All game content (names, descriptions, flavour text, icons, images,
  sounds, music) comes from openly licensed sources and is credited.
  - **Allowed**, because it is the program and not a content asset:
    - code, formulas and numbers
    - UI chrome labels ("Buy", "Max all", "Prestige")
    - ordinal and mathematical names ("Generator 3", Sum, Product, Power, Tower, ε, ↑↑)
    - templated strings that combine data ("Reach 1e100 in under 1 hour"), including the
      symbolic effect templates of GDD Appendix C
    - layout, CSS colours and gradients
    - CSS/canvas/SVG rendering of the numbers themselves (charts, sparklines of real terms,
      digit animations)
    - legal and attribution notices
  - **Forbidden:**
    - invented lore, invented proper nouns, story text and flavour quotes
    - prose tutorials, and prose descriptions of effects (effects show their Appendix C template)
    - procedural or synthesized audio (no oscillators, no sfxr/zzfx, no writing sample buffers,
      no sequencing samples into music)
    - AI images and hand-drawn SVG art
    - editing source assets beyond the transforms listed in GDD §2
  - Any descriptive text must be quoted verbatim from an open source with attribution. In
    practice that means OEIS `%N` names and curated `%C` comments, always with the A-number.
- **Theme: abstract numbers.** No fantasy. Do not use the SRD, RPG or zombie sound packs, or
  voice-over packs.
- **Licences:**
  - **OEIS data (CC BY-SA 4.0):** ships as a separate, readable `oeis.json` with
    `LICENSE-OEIS.txt`. It is never inlined into the MIT JavaScript, including the Credits data:
    the Credits tab reads OEIS authors and revisions from `oeis.json` at runtime. Credit the
    OEIS Foundation, show the A-number with every string, and include the non-affiliation line.
    OEIS excerpts quoted in docs or test fixtures are declared CC BY-SA 4.0 in the README.
  - **game-icons.net:** CC BY 3.0, credited per artist as "Icons made by {author} ·
    game-icons.net · CC BY 3.0 · recoloured", with the licence text. The viscious-speed icons
    are CC0. `badges/` and `various-artists/` are never used.
  - **CC0 sounds and music:** credited anyway. The open-game-sfx-index metadata is MIT; its
    notice ships.
  - **Fonts and libraries:** ship their OFL and MIT texts.
- **Enforced by tests** (GDD §2), each added by the milestone that introduces the system it
  guards and kept from then on:
  - string lint (entries, JSX text, JSX string attributes, content labels, `format.ts` tables)
  - Appendix C template match
  - glyph coverage of the shipped font subsets
  - audio API ban
  - engine purity and the raw-log ban (only `num.ts` calls `log10`/`log2`)
  - per-file asset manifest with source hashes and `verified: true`
  - OEIS filters (check) and exact substrings (pipeline and nightly)
  - icon artist allowlist (pipeline and nightly)

---

## M0 — Roadmap & scaffold

Status: done

Notes: scaffold commit `2f3b4f2`. The design documents (`docs/GAME_DESIGN.md`, this roadmap and
`docs/prototypes/`) are commit `f0396fc`, committed and pushed to finish M0.

**Goal:** Set up a buildable, testable project skeleton and an authoritative design and
roadmap, so every later milestone can be executed independently.

**Scope:**

- `package.json`, `vite.config.ts`, `tsconfig.json`, `.prettierrc.json`, `.prettierignore`,
  `index.html`
- `src/main.tsx`, `src/ui/App.tsx`, `tests/smoke.test.ts`
- `scripts/dev/playtest.mjs`
- `docs/SOURCES.md`, `docs/GAME_DESIGN.md`, `docs/prototypes/`, `ROADMAP.md`

**Acceptance criteria:**

- [x] Vite 8 + TypeScript 7 (strict, `noUncheckedIndexedAccess`) + Preact 11 + Vitest 5 (jsdom)
      + Prettier.
- [x] `npm run check` and `npm run build` pass.
- [x] `docs/SOURCES.md` lists the 4 pinned sources and their licence obligations.
- [x] `docs/GAME_DESIGN.md`, `docs/prototypes/` and this roadmap are written.
- [x] Committed and pushed. (Ticked, with the docs commit's sha, by the M1 commit.)

**Out of scope:** any game code.

---

## M1 — Number core, notation, architecture guards and minimal CI

Status: done

Notes: deviations are recorded in GDD v1.2 (§25). `9.995e5 → 1.00e6` holds at integer threshold
1e3 (the default 1e6 shows `999,500`). The Engineering width fixture is `999.99e999,996`,
because `999.99e999,999` has true exponent 1,000,001 and stacks. Height 18 is stored on layer 1
(resolution about 5.5e-7), not layer 2. The CI `bench` job comes with M9 (GDD §23);
`npm run bench -- --guard 3` already applies the ×3 guard. Commit `bd0bf9e`, committed and pushed
to finish M1.

**Goal:** Pin the big-number library behind one wrapper with safe helpers, and implement every
notation. Add the architecture tests that keep the engine pure and enforce the asset rule from
the first line of game code, and start CI.

**Scope** (GDD §2, §4, §21.6, §22, §23):

- `package.json`: `break_eternity.js@2.1.3` (exact pin); `fast-check` (dev); `playwright@1.56.1`
  (dev, exact pin; local runs keep `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` and
  `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`); scripts `bench` and `ci`.
- `tsconfig.json`: `allowImportingTsExtensions`, `erasableSyntaxOnly`.
- `src/engine/num.ts`: `Num`, constructors, `ZERO`, `ONE`, `CAP`, `TOWER1`, log helpers,
  `log10Pos`, `log10Floor1`, `floorGain`, `subClamp`, `isValidNum`, the bench-only op counter,
  codec.
- `src/engine/format.ts`: Scientific, Engineering, Logarithm, Standard (suffix rule up to `Ce`),
  stacked `e` forms, `10↑↑h`, the spoken form, fixed en-style grouping without `Intl`. It takes
  its word and suffix tables as a parameter.
- `src/ui/strings.ts` (first version): the notation word and suffix tables only.
- Tests: `tests/unit/num.test.ts`, `tests/unit/format.test.ts`.
- Architecture tests: `tests/arch/engine-purity.test.ts`, `tests/arch/num.test.ts` (including
  the raw `.log10()`/`.log2()` ban outside `num.ts`), `tests/arch/audio.test.ts`,
  `tests/arch/node-import.test.ts`, `tests/arch/fixtures/`.
- Benchmarks: `scripts/bench/` (`npm run bench`), starting with the `Num` operation benchmark.
- CI: `.github/workflows/ci.yml` (`npm ci`, `npm run check`, `npm run build`, plus a
  `LANG=de_DE.UTF-8` run of the format tests), or `docs/ci/workflows/` if the push is
  rejected. `npm run ci` runs the same steps locally either way.
- `docs/adr/001-big-numbers.md`.

**Acceptance criteria:**

- [x] The format table test has at least 60 cases, including:

  | Input                       | Output        |
  | --------------------------- | ------------- |
  | 0                           | `0`           |
  | 999999                      | `999,999`     |
  | 1234567                     | `1.23e6`      |
  | 2^1024                      | `1.80e308`    |
  | 9.995e5                     | `1.00e6`      |
  | 2^65536                     | `2.00e19,728` |
  | 10^(1.23e45)                | `e1.23e45`    |
  | 1.2345e47 (Engineering)     | `123.45e45`   |
  | 1.2345e47 (Logarithm)       | `e47.09`      |
  | 1.2345e47 (Standard)        | `123.45QaDc`  |
  | 1e303 (Standard)            | `1.00Ce`      |
  | 9.99999e305 (Standard)      | `1.00e306`    |
  | 1e-5                        | `1.00e-5`     |

- [x] The spoken form of 1.23e45 is "1.23 times ten to the 45", with the words taken from the
      `strings.ts` table.
- [x] Property test over 10,000 random values (layers 0–3) plus the fixed inputs 0, 1e-400 and
      values in (0, 1):
  - output never contains `NaN`, `Infinity`, `undefined` or `-0`
  - widths meet the GDD §4.2 table for every notation, and the table's own boundary fixtures
    pass: `2.00e19,728` (11), `9.99e999,999` (12), `1.00e-999,999` (13), `999.99e999,999`
    (14, Engineering), `999.99NoNog` (11, Standard), `999,999,999` (11, threshold 1e9)
  - weak monotonicity: for v1 ≤ v2, parse(format(v1)) ≤ parse(format(v2)), per notation
- [x] The format tests pass under `LANG=de_DE.UTF-8` (grouping does not use the locale).
- [x] Safe logs: `log10Pos(0)` is `null`, `log10Floor1(0)` and `log10Floor1(1e-400)` are 0,
      and neither ever returns NaN (property test).
- [x] `floorGain` threshold tests: at 2^128·n^40 (n = 1, 2), 2^1024·n^256 (n = 1, 2) and
      2^(2^(h+15)) (h = 1, 2), the threshold pays n, threshold·(1 + ε) pays n, and
      threshold·(1 − ε) pays n − 1, with ε = 1e-12 for the first two and 1e-9 for the last.
- [x] `subClamp` never returns a negative value; `isValidNum` rejects NaN, ±Infinity and
      negatives.
- [x] The codec round-trips exactly for 0, 1, −5, 1e-10, 1.5e-300, 10, 2^128, 1e308, 2^1024,
      2^65536, 10^10^20 and 10↑↑5.
- [x] `npm run bench` reports 100,000 mixed `Num` operations (budget 250 ms; the CI bench job
      uses a ×3 guard). `npm run check` contains no timing assertion.
- [x] Each architecture test fails on its planted fixture and passes on `src/`:
  - `Math.random`, `Date`, `document` or `window` in `src/engine`
  - a `break_eternity.js` import outside `num.ts`
  - a raw `.log10()` or `.log2()` call outside `num.ts`
  - `createOscillator`, `createBuffer`, `new AudioBuffer` or `copyToChannel` anywhere in `src`
  - a relative import without `.ts` in `src/engine`
- [x] `tests/arch/node-import.test.ts` spawns `node`, imports `src/engine/format.ts` through
      type stripping, and prints a formatted value.
- [x] ADR 001 records the choice of break_eternity.js 2.1.3, the alternatives rejected
      (break_infinity, log-space doubles), the codec, and the measured pitfalls (log10(0) is
      NaN; log2(2^1280) is 1279.9999999999993; layer-2 resolution at height 18).
- [x] `ci.yml` is pushed, or the fallback is in place and recorded; `npm run ci` runs `npm ci`,
      check and build locally.
- [x] `playwright@1.56.1` is a devDependency; `npm install` downloads no browsers locally, and
      `npm run playtest` still runs with the preinstalled chromium-1194.
- [x] `npm run check` and `npm run build` pass. The scaffold page still builds. M0's last box is
      ticked with the docs commit's sha. Committed and pushed.

**Out of scope:** game state, UI beyond the scaffold.

---

## M2 — Generator engine and first playable screen

Status: done

Notes: deviations are recorded in GDD v1.3 (§25). A purchase produces during its own tick, so
the jsdom "x = 0 after Buy" is checked on the committed state while the header preview already
shows 0.100. The bot uses the `sim2.py` greedy rule; seeds vary only a 0–2 s reaction delay.
Seeds 1–3: G5 at 5.22–5.23 min, G8 at 10.70–10.78 min, x ≥ 2^128 at 11.87–11.92 min (active)
and 90.37–90.50 min (idle); `docs/balance/M2.md`. Commit `99f494e`, committed and pushed to
finish M2.

**Goal:** Make the Sum layer work end to end: eight generators, costs, buy-max, the global
multiplier, the exact integrator with lazy online integration, the action queue, error
recovery and a minimal screen. This is the first playable loop. Add a greedy bot that checks
early pacing.

**Scope** (GDD §5, §21.2–21.4, §21.8, §22.6):

- Engine: `src/engine/state.ts`, `actions.ts`, `tick.ts`, `integrate.ts` (`integrate(state, Δ)`,
  lazy flushing, sub-resolution deferral), `effects.ts` (event-constant and state-dependent
  classes), `invariants.ts`.
- Content: `src/engine/content/sum.ts` (λ = A000124, ρ, β, g), `content/knobs.ts` (shell).
- `src/engine/systems/sum.ts`: cost, Buy 1, Until 10, Max (closed form plus exact last-purchase
  check, `subClamp`), Max all, global multiplier.
- `src/platform/loop.ts`: rAF accumulator, at most 40 fine ticks per frame, the remainder passed
  to `integrate()`.
- `src/platform/errors.ts` and `src/ui/Recovery.tsx`: per-tab error boundary, `safeTick`,
  `window.onerror` and `unhandledrejection`. The panel offers Reload; M4 adds the export
  buttons.
- UI: `src/ui/App.tsx`, `src/ui/sum/SumTab.tsx` (plain rows: amount, bought, multiplier, Buy 1,
  Until 10, Max; Max all; global level; x).
- Sim: `src/sim/rng.ts`, `src/sim/bot.ts` (active and idle profiles), `scripts/sim/run.mjs`
  (`npm run sim`); `sim-output/` added to `.gitignore`.
- Tests: `tests/unit/sum.test.ts`, `tests/unit/integrate.test.ts`, `tests/ui/sum.test.tsx`,
  `tests/ui/errors.test.tsx`, `tests/sim/early.test.ts`.

**Blocking bands** (GDD §15): G5 / G8 and x ≥ 2^128 (active); x ≥ 2^128 (idle).

**Acceptance criteria:**

- [x] Costs: cost(G1, 0) = 10; cost(G3, 10) = 1e9 exactly; cost(G8, 0) = 1e29. Global level L
      costs 10^(2+L) and gives ×1.15^L.
- [x] jsdom: in a new game, clicking Buy on G1 leaves x = 0, b1 = 1 and A1 = 1; one second
      later x > 0 and no value is NaN.
- [x] Buy-max equals repeated single buys for 200 random states (fast-check), except that n may
      differ by 1 when the total cost is within 1e-12 relative of x. x is never negative.
- [x] Until 10 buys up to the next multiple of 10, or as many of those as are affordable.
- [x] With event-constant multipliers (8 tiers, random), one 3600 s integrate step matches
      3,600 steps of 1 s within 1e-9 relative and 72,000 steps of 50 ms within 1e-6 relative,
      on x and every A_k (explicit test timeout).
- [x] Lazy integration: 20 ticks without actions equal one 1 s integrate exactly; an action
      flushes the pending time before it applies.
- [x] The default step multiplier is 2^min(⌊b/10⌋, 34), computed in code.
- [x] Replaying the same action log twice gives identical serialized state.
- [x] A test-only effect that throws pauses the loop and opens the recovery panel; so does a
      thrown error in `window.onerror` and an unhandled rejection; a render error in one tab
      replaces only that tab.
- [x] Bot, seeds 1–3, in vitest with an explicit timeout and no timing assertion: active G5 at
      4–7 min, G8 at 9–14 min, x ≥ 2^128 at 10–16 min; idle (10 s every 15 min) x ≥ 2^128
      within 120 min.
- [x] `npm run sim -- --profile active --minutes 30` prints an event timeline into
      `sim-output/` (gitignored).
- [x] Playtest of `dist/`: 8 rows render, x grows over 5 s, 0 console errors.
- [x] `npm run check` and `npm run build` pass; the game is playable. Committed and pushed.

**Out of scope:** styling, saves, Product, discovery.

---

## M3 — Sum layer shell and onboarding framework

Status: done

Notes: deviations are recorded in GDD v1.4 (§25). Settings v1 also holds the integer threshold
and UI fps; Settings is a header button (no tab list while only Sum exists); rates are exact
(A_k · m_k); the one-at-a-time highlight moves to M16. Build: four woff2 files (51.5 KB), JS
36.3 KB gzip. The playtest's fake-clock silhouette step failed 1 of 5 full runs at the gate:
Playwright's `pauseAt` can step `performance.now()` back 1 s, so x is still below 50 (the jsdom
test covers the rule).

**Goal:** Turn the raw screen into the real shell. That means header, tabs, full generator rows,
hotkeys and themes. Add the text-free onboarding framework (reveal at half cost, Next goal,
breakdown tooltips, time-to-afford) that every later feature plugs into.

**Scope** (GDD §2, §4.2, §16.5, §17.1–17.4, §18, §19):

- Shell: `src/ui/shell/Header.tsx`, `Tabs.tsx`, `Layout.tsx`.
- Theme tokens: `src/ui/theme.css` (dark, light).
- `src/ui/sum/GeneratorRow.tsx`: amount, bought, step progress, ×multiplier, production, cost,
  time-to-afford, Buy 1 / Until 10 / Max, and the silhouette state. Plus Max all.
- Strings: the full `src/ui/strings.ts`, `src/ui/legal.ts`, `tests/arch/strings.test.ts`
  (32-character limit, sentence regex, JSX text literals, string-literal JSX attributes,
  `label:` fields in `src/engine/content`, `format.ts` literals),
  `tests/arch/templates.test.ts` (Appendix C), `tests/arch/glyphs.test.ts`.
- Onboarding: `src/ui/reveal.ts` (the one half-threshold rule), `src/ui/goals.ts` (percentage
  clamped to 0–100%), `src/ui/Breakdown.tsx` (reads the effects table).
- Input: `src/ui/hotkeys.ts` (`event.code`; ignores form fields, contenteditable, Ctrl, Meta,
  Alt).
- Growth readout ×10^Y /min (skips x ≤ 0 samples).
- Settings v0: notation, precision, theme, stored as `{settingsVersion: 1, values}` with
  per-field validation; `tests/fixtures/settings/v1.json` (added to `.prettierignore`).
- Fonts: `@fontsource/jetbrains-mono@5.3.0` (exact pin); `src/ui/fonts.css` with four
  `@font-face` rules (Latin 400/500, Greek 400/500, woff2 only) whose `unicode-range` is
  copied from the package's `unicode.json`.
- `index.html` title: "Integer Sequence Idle".

**Acceptance criteria:**

- [x] A new game's DOM shows only the header (x = 10), the Generator 1 row and the Settings
      button.
- [x] The Generator 2 silhouette appears when x first reaches 50 (half its cost), dimmed, with
      "Buy 1 · 100"; it becomes a normal row at its first purchase. Every reveal rule has a unit
      test, including the layer thresholds 2^127, 2^1023 and 2^65535.
- [x] Next goal chip: a table test over 10 states (nearest unlock, log-scale percentage),
      including x = 0, which shows 0%.
- [x] Breakdown factors multiply to the displayed m_k within 1e-9 in log space, for 50 random
      states.
- [x] Hotkeys (jsdom): `Digit1`–`Digit8`, Shift + digit (also when `event.key` is "!" or "&"),
      `KeyM` and `KeyG` work. Nothing fires when focus is in an input, textarea, select or
      contenteditable element, or when Ctrl, Meta or Alt is held.
- [x] The string lint passes on `src/` and fails on planted fixtures: a 33-character entry, a
      sentence, a JSX text literal, a string-literal `aria-label`, a literal `label:` in
      `src/engine/content`, and a letter literal in `format.ts`. A template with a decimal
      (`ρ_k ×(1 − 0.03c)`) passes.
- [x] The templates test passes for every content id with a `templateId` that exists so far, and fails on a planted
      mismatch.
- [x] The glyph test passes on `strings.ts` and fails on a planted character outside the
      shipped subsets and the fallback allowlist.
- [x] The ×10^Y/min readout equals Δlog10 x over the trailing 60 s (synthetic samples), skips
      samples with x = 0, and shows `—` with fewer than 2 positive samples.
- [x] Fonts: the build emits exactly the four JetBrains Mono woff2 files (about 52 KB), and the
      `unicode-range` values in `fonts.css` equal the package's `unicode.json`.
- [x] Settings: an invalid field gets its default, an unknown key is dropped, and the v1
      fixture loads.
- [x] Playtest: no horizontal scroll at 375 px, mobile tap targets at least 44 px, screenshots
      at 375×667 and 1280×800.
- [x] JS bundle is at most 120 KB gzip.
- [ ] `npm run check` and `npm run build` pass; the game is playable. Committed and pushed.

**Out of scope:** persistence, other tabs, sound, icons.

---

## M4 — Saves, export/import, offline progress and dev hooks

Status: planned

**Goal:** Progress survives reloads, corruption, time away, clock changes and a second tab.
This needs A/B save slots, quarantine without silent repair, migrations, a production invariant
before every save, a full save panel, the one-active-tab lock, and offline catch-up with the
exact integrator and an exact macro-step schedule.

**Scope** (GDD §19, §20, §21.8, §21.9):

- Save code: `src/engine/save/codec.ts`, `envelope.ts` (with `maxSeenAt`), `migrations.ts`,
  `validate.ts` (reports, never repairs).
- `src/engine/invariants.ts` used before every save.
- `src/platform/storage.ts`: A/B slots, `meta` with `owner`, hourly backup, quarantine,
  `isi.stats.samples` reserved, separate settings key, `QuotaExceededError` handling, memory
  fallback.
- `src/platform/tablock.ts`: BroadcastChannel lock with the storage-event fallback.
- `src/engine/offline.ts`: `advance(state, seconds, schedule?)` with the exact schedule
  (GDD §20.2), `maxSeenAt` crediting and caps.
- UI:
  - `src/ui/settings/SavePanel.tsx`: Save now; Export as text with Copy (select-all fallback)
    or `.txt`; Import by paste or from file; Restore backup (with timestamp); Download
    quarantine; hard reset with typed "RESET".
  - `src/ui/WhileAway.tsx`.
  - The storage-fallback, load-fallback and "Open in another tab" banners.
  - The recovery panel gains Export current and Export last good.
- Dev hooks: `src/platform/devhooks.ts` (`?fixture=<name>&speed=<n>`), `npm run build:playtest`
  (`dist-playtest/`), `tests/fixtures/dev/`.
- `tests/fixtures/saves/v1.json` (generated fixtures added to `.prettierignore`).
- Bench: offline 24 h without autobuyers.

**Acceptance criteria:**

- [ ] Save then load gives byte-identical serialized state for 100 random reachable states.
- [ ] 10,000 corrupted blobs (byte flips and truncations) never throw:
  - the loader falls back active → other slot → backup → new game
  - the failed blob is kept in quarantine, and a banner shows whenever a load fell back
- [ ] `validate()` rejects, and never repairs, a blob with a NaN, negative, wrong-typed or
      missing field (one fixture each): the blob goes to quarantine and the next source loads.
- [ ] A state containing a NaN `Num` (injected) is refused before saving: the stored save is
      unchanged, autosave stops, and the recovery panel offers Export current, Export last good
      (byte-identical to the stored save) and Reload.
- [ ] A save with a newer `saveVersion` is refused, autosave turns off and an export prompt
      appears.
- [ ] Importing garbage leaves the current state untouched. A valid export re-imports exactly,
      by paste and from a file.
- [ ] Copy falls back to selecting the text when the Clipboard API rejects (mocked).
- [ ] Restore backup shows the backup's timestamp and restores it after confirmation; Download
      quarantine downloads the exact quarantined blob.
- [ ] Hard reset removes exactly `isi.save.a`, `isi.save.b`, `isi.save.bak`,
      `isi.save.quarantine`, `isi.save.meta` and `isi.stats.samples`, and keeps `isi.settings`.
- [ ] With a `localStorage` that throws on every call, the game runs and shows the banner. With
      a fake storage that throws `QuotaExceededError` above a byte limit, the previous slot
      stays active, the banner shows, and the next autosave retries.
- [ ] Two jsdom instances sharing a fake storage and a fake BroadcastChannel: only the newer one
      ticks and saves, the older one shows "Open in another tab", "Use here" moves ownership, and
      a write from a non-owner is refused.
- [ ] Autosave fires every 15 s, on `visibilitychange` (hidden) and on `pagehide` (fake timers),
      and is silent.
- [ ] `advance()`:
  - the schedule has at most 2,000 steps summing exactly to the credited time, with maximum
    steps of 2.1 s at 1 h, 62 s at 24 h and 516 s at 7 days (±1%)
  - credited time is max(0, now − `maxSeenAt`); 30 h gives exactly 24 h; a scripted clock of
    +24 h, back, +24 h again credits 24 h in total; `savedAt` never decreases
  - with 48 scripted Max-all purchases (one every 10 min) over 8 h, `advance()` matches the 1 s
    exact-step reference with the same purchases within 1e-6 relative in log10 x (explicit
    timeout); the 50 ms reference runs nightly
- [ ] `npm run bench`: 24 h of offline time without autobuyers takes at most 300 ms in Node, and
      the report lists `Num` operations per macro-step.
- [ ] The save of a late-game-shaped fixture is at most 64 KB (budget test kept from now on).
- [ ] The While-away modal shows before and after values for x and each generator.
- [ ] A test checks `migrations.length === CURRENT − 1`. The v1 fixture is committed.
- [ ] Dev hook: `?fixture=<name>&speed=<n>` works in `npm run dev` and in `dist-playtest/`, and
      a test finds no hook marker in `dist/`.
- [ ] `npm run check` and `npm run build` pass; the game is playable. Committed and pushed.

**Out of scope:** offline autobuyers (M5 adds max mode, M11 the rest) and the prestige-loop
credit (M11).

---

## M5 — Product layer and basic autobuyers

Status: planned

**Goal:** Add the first prestige. Product resets at 2^128 pay P, which buys 16 upgrades and the
tier autobuyers, so runs become repeatable and faster.

**Scope** (GDD §7, §12, §14.3, §15, §20.2):

- `src/engine/systems/product.ts`; `content/product.ts` (16 upgrades and repeatables, with costs
  F(2)…F(17) citing A000045, and their Appendix C templates). P gain through `floorGain`.
- Upgrades implemented now: 1, 2, 3, 8, 13, 21, 89, 233, 610 and 1597 P, plus the G7–G8
  autobuyers of 55 P. Pending (buyable, shown with the `product.pending` template): 5, 34 and
  144 P until M7; the global-multiplier part of 55 P, 377 P and 987 P until M11.
- `src/engine/systems/autobuyers.ts`: tier autobuyers with a 2 s interval, max mode, on/off,
  millisecond timers, firing order G8 → G1. Their toggles live in the Product tab until the
  Automation tab ships (M11).
- Offline: max-mode autobuyers fire at every macro-step boundary.
- `src/ui/product/ProductTab.tsx`: reset button with live gain and gain per minute; upgrade grid.
- Knobs: Unspent-P exponent, its 89-P step, Product gain repeatable base.
- A reset-confirmation setting (settings v2).
- Reveal and Next goal registrations.
- Save v2 and its fixture.
- A bot prestige policy, and `docs/balance/M5.md` with the sim evidence and its comparison with
  `docs/prototypes/idle_sim.py` and `product_sim.py`.

**Blocking bands** (GDD §15, M5 rows): first Product reset (active and idle); second run to
2^128; 60 min played.

**Acceptance criteria:**

- [ ] P_gain (μ_P = 1) is 1 at 2^128, 2 at 2^168, 34 at 1e100 and 5,534,417 at 2^1024. For
      n = 1, 2 and 34, threshold(n) pays n, ·(1 + 1e-12) pays n and ·(1 − 1e-12) pays n − 1.
- [ ] A Product reset clears exactly x (to its start value), A, b, L and the run timer. It keeps
      P, upgrades, autobuyer settings and statistics (fixture diff).
- [ ] The unspent-P bonus (1+P)^exponent, with the exponent from `knobs.ts`, appears in the
      breakdown.
- [ ] Costs are 1, 2, 3, 5, …, 1597. Each of the 10 implemented upgrades has an effect test, and
      so do the G7–G8 autobuyers of 55 P. The 6 pending upgrades can be bought and show
      "Pending".
- [ ] The 610-P factor is finite and ≥ 1 for x = 0, 1e-400, 0.5, 1 and 1e100.
- [ ] An autobuyer with a 2 s interval switched on at tick t0 fires its k-th time at tick
      t0 + ⌈k·2000/50⌉ (derived, not recorded); within a tick tiers fire G8 → G1.
- [ ] Offline: 1 h of `advance()` with G1–G4 max autobuyers on matches the 1 s exact-step
      reference within 0.5% of log10 x (scripted fixture, explicit timeout).
- [ ] The Product tab reveals at x ≥ 2^127.
- [ ] Bot, seeds 1–3 (explicit timeouts, no timing assertion):
  - active: first Product reset at 10–16 min
  - idle: first Product reset within 120 min
  - active: the second run reaches 2^128 in at most 90% of the time the first run took
    (prototype: 84–88%)
  - active, at 60 min: at least 4 Product resets, the 3-P upgrade owned, best x ≥ 1e45
- [ ] `docs/balance/M5.md` is committed with the measured values. The Product constants frozen
      after M5 (GDD §14.3) may be tuned only within this milestone.
- [ ] The v1 → v2 save migration and the settings v1 → v2 migration pass on their frozen
      fixtures.
- [ ] `npm run check` and `npm run build` pass; the game is playable. Committed and pushed.

**Out of scope:** interval upgrades, single and target modes, the global and Product
autobuyers (M11); discovery (M7).

---

## M6a — OEIS pipeline and extraction

Status: planned

**Goal:** Extract the curated OEIS data reproducibly at the pinned commit, filter it for
licence safety, verify it against the source at pipeline time, and ship it as a separate CC
BY-SA file with full attribution.

**Scope** (GDD §2, §11, §16.1, §21.6, §23, Appendix A):

- Pipeline infrastructure:
  - `scripts/assets/sources.json`: 4 sources with repo URL, pinned SHA and an `ASSET_SRC_<NAME>`
    override.
  - `scripts/assets/lib/git.mjs`: verify the SHA, batched sparse checkout, `git show`.
  - `scripts/assets/build-assets.mjs` (the `npm run assets` entry point).
  - `scripts/assets/manifest.json` with source sha256 and `verified: true` per record (added to
    `.prettierignore`).
- OEIS extraction: `scripts/assets/oeis.mjs`; `oeis-selection.json` (150–170 entries, seeded from
  GDD Appendix A); `oeis-comments.json` (allow/deny list); Record advance costs as integers,
  max(1, bitLength(t)) on BigInt.
- Outputs:
  - `public/assets/data/oeis.json` (entries and header) and `LICENSE-OEIS.txt`
  - `public/LICENSES/CC-BY-SA-4.0.txt` (copied from `oeisdata/LICENSE`)
  - root `LICENSE` (MIT)
- Tests: `tests/assets/oeis.test.ts` (check: filters, term counts, Record costs, header,
  manifest hashes) and `tests/assets/oeis-source.test.ts` (nightly: exact substrings and `%N`
  bytes, `it.skipIf(!process.env.ASSET_SRC_OEIS)`).
- A licensing section in the README, including the declaration that OEIS excerpts in tests and
  docs (such as the GDD) are CC BY-SA 4.0.

**Acceptance criteria:**

- [ ] At least 150 entries. Every A-number exists at the pinned SHA, and a missing A-number fails
      the pipeline.
- [ ] Parsed term counts: A000045 41, A000079 35, A000142 23, A000005 104, A000040 58.
- [ ] `%N` is byte-identical to the source for 10 sampled entries, and every exported string is
      an exact substring of its source `.seq` at the pinned SHA: checked by the pipeline before
      it writes, and by the nightly source test.
- [ ] The pipeline refuses to write a record it could not verify (planted fixture), and every
      committed output's sha256 matches its manifest record (check).
- [ ] Text filters (check):
  - no exported string contains `(AT)`, `@`, `http`, `www.` or ` writes:`
  - no comment is longer than 280 characters
  - at most 6 comments per entry
  - A000045's Knuth and Goonatilake quotations are excluded (an explicit test)
- [ ] Exactly the 12 Records in GDD §11 get the `record` role. Their costs are integers in the
      data: A060843 is [1, 3, 5, 7, 26], A000215 is [2, 3, 5, 9, 17, 33, 65, 129, 257] (520),
      and all 12 total 5,247 TP over 128 advances.
- [ ] Reproducibility:
  - a second `npm run assets` produces no git diff
  - an uncommitted edit to a `.seq` file in the clone does not change the output (`git show`
    at the SHA)
- [ ] `oeis.json` is at most 400 KB. Its header carries the licence, attribution, source commit
      and the list of changes.
- [ ] Shipping:
  - the built JS contains neither "Fibonacci numbers: F(n)" nor any of 20 sampled `%A` author
    names, so no OEIS data is inlined
  - `dist/` contains `assets/data/oeis.json` and `LICENSES/CC-BY-SA-4.0.txt`
- [ ] `npm run check` passes without any `ASSET_SRC_*` variable; the source-backed tests show as
      skipped there.
- [ ] `npm run check` and `npm run build` pass; the game is playable. Committed and pushed.

**Out of scope:** the window index and loader (M6b), discovery mechanics (M7), icons (M8), the
transform table (M18a) and cross-reference graph (M18b).

---

## M6b — Window index, data loader and Credits v0

Status: planned

**Goal:** Build the window index the discovery twist needs, load the data safely at boot with a
cache-proof URL, keep the game fully playable without it, and show the OEIS attribution from
the data at runtime.

**Scope** (GDD §5.2, §6.2, §16.1, §21.5):

- `src/engine/data/windows.ts`: window rules (term bound 2·10^4, Records excluded), index,
  signature windows, projection maps. The pipeline imports it and writes the index into
  `oeis.json`, plus the shared-window report.
- `src/engine/data/log2dec.ts`.
- `dataHash` in the `oeis.json` header; `src/data/generated/data-manifest.json`; build-time
  injection of `DATA_HASH`.
- Loading: `src/platform/data.ts` (fetch `oeis.json?h=<dataHash>`, hash check, one
  `cache: 'reload'` retry, Retry state) and `src/engine/data/oeis.ts`.
- The data-version framework of GDD §21.5: on a `dataHash` mismatch, each system's registered
  adapter runs; later milestones register theirs. `tests/fixtures/data/altered-oeis.json`.
- Reachability report: `docs/balance/window-heights.json` (pre-cap part; added to
  `.prettierignore`) and the lift reachability test.
- Settings → Credits v0: the OEIS attribution, the non-affiliation line, and each entry's author
  and revision, read from `oeis.json` at runtime.

**Acceptance criteria:**

- [ ] Every window satisfies the rules. Window counts: A000045 16, A000027 70, A001477 71,
      A000079 8, A000142 1, A000108 4, A000110 2, A000005 97.
- [ ] No Record appears in the index (A000112's 2 valid windows are dropped).
- [ ] The shared-window report is committed (it includes A000027/A001477), and signature
      windows have unit tests.
- [ ] Lift reachability: at least 24 sequences can be discovered and at least 3 completed with
      every cost ≤ 2^1024.
- [ ] The loader requests `assets/data/oeis.json?h=<dataHash>` with the build-injected hash
      (request-URL test). A payload with another hash is retried once with `cache: 'reload'`,
      then the Retry state shows.
- [ ] When the data fetch fails, Sum and Product still play with full production (the
      code-computed default curve) and the Collection shows Retry (jsdom).
- [ ] `log2Dec` matches the BigInt bit length on a 400-digit term within 1e-12 relative.
- [ ] Credits v0 reads OEIS authors and revisions from `oeis.json`; `credits.json` and the built
      JS contain no OEIS field (test).
- [ ] `oeis.json` is still at most 400 KB; a second `npm run assets` gives no diff.
- [ ] `npm run check` and `npm run build` pass; the game is playable. Committed and pushed.

**Out of scope:** discovery mechanics (M7).

---

## M7 — Discovery and the Collection

Status: planned

**Goal:** Add the game's original twist. The bought counts, read from G8 down to G1, discover
real OEIS sequences. Discoveries give a permanent collection multiplier and a card of quoted
data. Hold caps, hints and the nearness meter make the puzzle playable.

**Scope** (GDD §6, §17.5, §21.5):

- `src/engine/systems/discovery.ts`: read vector, exact lookup, sweeps through projection maps,
  multi-match credit, depth, δ, completion.
- `src/engine/systems/collection.ts`: the Coll multiplier (knobs c0, c0 step, depth weight).
- Hold caps: in state, and as a field in each row.
- Hints (base·2^r P, base from the knob), stored as (A-number, s, r). Nearness meter in the UI,
  at most 4 Hz.
- The pending Product upgrades 5, 34 and 144 P become active.
- UI: `src/ui/collection/CollectionTab.tsx`, `SequenceCard.tsx`, `TermStrip.tsx`; the credit
  line in `legal.ts`.
- A minimal toast through `notify(event)` (one at a time, 4 s) for discoveries and completions;
  M12b replaces it with the full system.
- Data-version adapters for discoveries, depth and hints.
- Save v3 and its fixture.
- A bot discovery policy for the active profile.

**Blocking bands** (GDD §15): 60 min played, discovery row (and the M5 row still holds).

**Acceptance criteria:**

- [ ] (b1…b8) = (13, 8, 5, 3, 2, 1, 1, 0) discovers A000045 at depth 0.
- [ ] (b8…b1) = (5, 8, 13, 21, 34, 55, 89, 144) gives A000045 depth 5 and δ = 5/15.
- [ ] Holding (b8…b2) = (0, 1, 1, 2, 3, 5, 8) and pressing Max on G1 from 0 to 20 discovers
      A000045 through the sweep.
- [ ] Property test: sweep results equal single-buy checks for 500 random sweeps.
- [ ] (b8…b1) = (1, …, 8) credits A000027 at depth 0 and A001477 at depth 1.
      (3, 1, 4, 1, 5, 9, 2, 6) discovers A000796.
- [ ] Coll formula tests, with c0 and the depth weight read from `knobs.ts`, including δ = 1 for
      sequences with fewer than 2 windows.
- [ ] Max and Max all never exceed hold caps.
- [ ] A hint costs base·2^r P, reveals the next term of the signature window, and is stored as
      (A-number, s, r).
- [ ] The nearness meter is correct for 20 test vectors; with the 34-P upgrade it lists the 3
      nearest A-numbers.
- [ ] Effect tests for the 5-P (×1.02 per discovery) and 144-P (c0 step) upgrades.
- [ ] Sequence cards:
  - show `%N` exactly as in the data (only `_x_` rendered as x), the A-number, terms, keywords,
    author, revision and the credit line
  - show comment 1 on discovery and all comments at δ = 1
- [ ] The Collection reveals on the first discovery or the first Product reset.
- [ ] The minimal toast shows a discovery for 4 s, one at a time.
- [ ] Data version: loading a save against the altered data fixture clamps depth, keeps a
      removed A-number inert (no Coll factor), and moves a hint whose window was removed to the
      new signature window with the same r.
- [ ] Bot (active, seeds 1–3): at least 5 discoveries by 60 min, while the M5 60-minute row
      still holds.
- [ ] The v2 → v3 migration passes on its fixture.
- [ ] `npm run check` and `npm run build` pass; the game is playable. Committed and pushed.

**Out of scope:** reverse read (M15b), slots (M14), the Lab (M18a), sound (M10).

---

## M8 — Icons, sprite and credits

Status: planned

**Goal:** Add the visual identity from game-icons.net: CC0 abstract icons for generators and
layers, and CC BY UI icons credited per artist. A full provenance manifest drives a generated
Credits screen and `CREDITS.md`.

**Scope** (GDD §2, §16.2, §16.5):

- Pipeline:
  - `scripts/assets/icons.mjs` with the complexity metric and the ladder rule of GDD §16.2
  - `icons.config.json`: roles and the exclusion list
  - `scripts/assets/artists.json`: the explicit folder → name map
  - svgo (dev dependency, MIT) and sprite generation
- `src/data/generated/icons.json` and `src/ui/Icon.tsx`. Icons go on generator rows, tabs and
  header controls.
- Credits:
  - `scripts/assets/credits.mjs` → `CREDITS.md` (with an OEIS section marked CC BY-SA 4.0) and
    `src/data/generated/credits.json` (icons, sounds, music, fonts and libraries only)
  - the full Settings → Credits tab, with the OEIS part read from `oeis.json` at runtime
- Licence files in `public/LICENSES/`: `CC-BY-3.0.txt` (`OFL-1.1.txt` ships since M3, the MIT
  notices for Preact and break_eternity.js since M1).
- Tests: `tests/assets/icons.test.ts` (check), `tests/assets/icons-source.test.ts` (nightly),
  `tests/assets/manifest.test.ts`.

**Acceptance criteria:**

- [ ] Re-running the pipeline produces no diff.
- [ ] Every symbol has a full manifest record: repo, commit, source path, source sha256, output
      sha256, SPDX licence, author, transforms, `verified: true`.
- [ ] The pipeline fails when a role points at `badges/` or `various-artists/`, or at a folder
      missing from `artists.json` (fixture configs).
- [ ] Every `artists.json` name is a verbatim substring of `license.txt` (pipeline and nightly).
      Credit lines read "Icons made by {author} · game-icons.net · CC BY 3.0 · recoloured" and
      link to `LICENSES/CC-BY-3.0.txt`.
- [ ] No symbol contains `M0 0h512v512H0z`, and every fill is `currentColor`.
- [ ] The role table equals GDD §16.2: G1–G8 are 097, 006, 030, 013, 028, 031, 062, 058, with
      strictly increasing counts 17, 18, 22, 24, 25, 26, 27, 29 (command letters in the source
      `d` attributes, background excluded, before svgo); none is from the exclusion list.
- [ ] The sprite is at most 150 KB.
- [ ] Every file in `public/assets/**` and `src/data/generated/**` has a manifest record.
- [ ] The Credits tab lists:
  - icons by artist, with the licence link
  - the OEIS attribution and entries (from `oeis.json` at runtime)
  - fonts, with the full OFL text
  - libraries (MIT)
- [ ] `CREDITS.md` is generated, and its OEIS section is marked CC BY-SA 4.0. The "built JS
      contains no OEIS text" test still passes with the author-name sample.
- [ ] `npm run check` and `npm run build` pass; the game is playable. Committed and pushed.

**Out of scope:** sounds, music.

---

## M9 — Deploy, budgets and the playtest gate

Status: planned

**Goal:** Make the game publicly playable and protect it from regressions: full CI, a bench
job, the nightly job, GitHub Pages from the working branch, size budgets, manifest tracing, a
playtest gate on requests and errors, and the claude.ai Artifact files map.

**Scope** (GDD §22.11, §23):

- Workflows: extend `ci.yml` (`check-size`, `verify-manifest`, quick sim, the bench job with ×3
  guards); add `e2e.yml` (`npx playwright install --with-deps chromium`, CI only), `pages.yml`
  (push to `claude/idle-game-dev-oq3ded` and `workflow_dispatch`) and `nightly.yml` (long sims,
  50 ms reference sims, 100k save fuzz, asset re-extraction with every `ASSET_SRC_<NAME>` set).
  If the push is rejected, the fallback is `docs/ci/workflows/` plus `npm run ci`.
- Checks: `budget.json`, `scripts/ci/check-size.mjs` (counts every emitted `.woff` and
  `.woff2`), `scripts/ci/verify-manifest.mjs`.
- Deploy: `scripts/deploy/artifact-files.mjs`.
- Playtest: `scripts/dev/playtest.mjs` gains a request log, a console-error gate, viewport checks
  and screenshots.
- Docs: `docs/DEPLOY.md` (including the owner's one-time Pages steps: Source "GitHub Actions" and
  the working branch allowed in the `github-pages` environment's deployment branches), a "Play"
  section in the README.
- npm scripts: `check-size`, `verify-manifest`.

**Acceptance criteria:**

- [ ] `check-size` passes on `dist/` and fails on an oversized fixture, including an extra font
      file.
- [ ] `verify-manifest` fails on an untracked fixture file in `dist/`.
- [ ] Playtest of `dist/`: 0 console errors, only same-origin requests, no horizontal scroll at
      375 px, screenshots saved.
- [ ] `artifact-files` builds the `files` map from `dist/` and asserts each limit: page ≤ 16 MB,
      each file ≤ 15 MB, total ≤ 64 MB, at most 255 files. A unit test with synthetic sizes
      shows each limit failing.
- [ ] The workflows are pushed, or the fallback is in place and the rejection is recorded in
      `docs/DEPLOY.md`. The nightly job runs the source-backed asset tests.
- [ ] The bench job runs `npm run bench` with ×3 guards, separately from `npm run check`.
- [ ] The deployed Pages URL returns 200, or the blocker (for example the environment's branch
      policy) is recorded in `docs/DEPLOY.md` with the owner's steps.
- [ ] `npm run ci` runs the CI steps locally.
- [ ] `npm run check` and `npm run build` pass; the game is playable. Committed and pushed.

**Out of scope:** long-horizon balance (M17 on), the 1.0 release (M23).

---

## M10 — Sound effects

Status: planned

**Goal:** Give every implemented event its CC0 sample, chosen by id, hash-verified and only
trimmed or converted. Playback is rate-limited, gesture-gated and silent for automation.

**Scope** (GDD §16.3, §17.7):

- Pipeline: `scripts/assets/sfx.mjs` and its selection config (pack allowlist, event → id).
- Outputs: `src/data/generated/sfx.json` (ids, pack names and durations only),
  `public/assets/sfx/*.wav`, and the open-game-sfx-index MIT notice in `public/LICENSES/`.
- `src/platform/audio.ts`.
- `src/ui/juice.ts`: event → sound and visual effect, for the events implemented so far.
- Settings → Audio: effects volume, mute, mute in background, error sounds (settings v3).
- `tests/assets/sfx-source.test.ts` (nightly).

**Acceptance criteria:**

- [ ] Every mapped id exists in `index.json` and has licence `CC0-1.0`. Each source file's
      sha256 equals the index field for its format (`sha256_ogg` or `sha256_wav`), checked by
      the pipeline and the nightly test.
- [ ] Packs outside the allowlist are rejected (fixture).
- [ ] Every output is at most 1.5 s, and the total is at most 700 KB; the pipeline projects the
      total from `duration_sec` and fails above the budget.
- [ ] 50 buys in 1 s play at most 8 sounds, and no 1 s window ever holds more than 8.
- [ ] No `AudioContext` exists before the first user gesture (mocked).
- [ ] Autobuyer actions and autosave play nothing.
- [ ] Volume and mute persist. Audio is muted while the tab is hidden.
- [ ] Manifest records list the ffmpeg transforms. Credits show the index's MIT notice.
- [ ] The settings v2 → v3 migration passes.
- [ ] `npm run check` and `npm run build` pass; the game is playable. Committed and pushed.

**Out of scope:** music (M20); sounds of events that do not exist yet (each later milestone
maps its own, GDD §16.3).

---

## M11 — Automation I

Status: planned

**Goal:** Automate the Product era: interval upgrades, buy modes, the target-vector mode (which
automates the discovery puzzle), the global and Product autobuyers. Offline uses the same code,
with bulk single-mode purchases and the prestige-loop credit.

**Scope** (GDD §12, §20.2):

- Interval levels: 10·3^n P, ×0.8 per level, minimum 0.05 s, millisecond timers.
- Modes: single, max, target. Target-vector mode at 377 P.
- Global multiplier autobuyer (55 P).
- Product autobuyer (987 P) with its four triggers.
- `src/ui/automation/AutomationTab.tsx` (the M5 toggles move here).
- Offline: single-mode bulk purchases with carry; target mode; the prestige-loop credit.
- Save v4.
- Bench: offline 24 h with every autobuyer on.

**Report bands** (GDD §15): idle Product resets per 3 h over 12 h, in `docs/balance/M11.md`.

**Acceptance criteria:**

- [ ] For interval levels n = 0…20, I_ms = max(50, round(2000·0.8^n)) and the k-th firing of
      an autobuyer switched on at tick t0 is at tick t0 + ⌈k·I_ms/50⌉, in a scripted 10-minute
      run; expected ticks are computed from this formula.
- [ ] Interval level n gives 2·0.8^n s, never below 0.05 s.
- [ ] Target mode reaches the exact counts of a given vector. The bot uses it to discover
      A000045.
- [ ] Effect tests for the pending upgrades: the global part of 55 P, 377 P and 987 P.
- [ ] Each Product autobuyer trigger has a unit test: x ≥ X; gain ≥ Y; every T s; gain ≥ k ×
      last gain.
- [ ] Offline single mode: a 0.05 s G1 autobuyer over a 62 s macro-step makes
      min(⌊(carry + 62)/0.05⌋, affordable, hold-cap room) purchases and keeps the remainder as
      carry; over 24 h with unlimited funds the total equals the online count ⌊t/0.05⌋.
- [ ] Prestige-loop credit: k = ⌊Δ / meanCycle⌋ and credit = min(k·meanGain, peakRate·Δ)
      have unit tests, including fewer than 10 recorded cycles and none.
- [ ] Offline accuracy against the 1 s exact-step reference (explicit timeouts; the 50 ms
      references run nightly):
  - 1 h with a 5 s Product autobuyer gives P within ±10%
  - 1 h without resets is within 0.5% of log10 x
- [ ] `npm run bench`: 24 h with every autobuyer firing at every boundary takes at most 1 s, and
      the report lists `Num` operations per macro-step.
- [ ] `docs/balance/M11.md` reports the idle profile's Product resets per 3 h over 12 h
      (report-only).
- [ ] The v3 → v4 migration passes on its fixture.
- [ ] `npm run check` and `npm run build` pass; the game is playable. Committed and pushed.

**Out of scope:** Power autobuyer and climb mode (M13).

---

## M12a — Statistics and charts

Status: planned

**Goal:** Add the readouts experienced idle players expect: run statistics and log-scale charts
with table views, stored outside the save.

**Scope** (GDD §13, §20.1):

- `src/engine/systems/stats.ts`: totals, timers, per-layer reset history.
- A sampler: ring buffer of at most 2,000 points per series, with tiered downsampling, stored in
  `isi.stats.samples` and written every 60 s and on hide.
- `src/ui/stats/StatisticsTab.tsx`: SVG charts (Okabe–Ito, table toggle, accessible summary);
  samples with x ≤ 0 are skipped.
- Save v5.

**Acceptance criteria:**

- [ ] The sampler holds at most 2,000 points per series. Charts render with 0, 1 and 10,000
      samples, and the table toggle works.
- [ ] Samples live in `isi.stats.samples`, written every 60 s and on hide (fake timers), never
      in the save; the save of a fixture with full samples is still at most 64 KB.
- [ ] A sample with x = 0 is skipped and never produces NaN in a chart.
- [ ] Statistics persist across save and load.
- [ ] The M5 and M7 bot bands still hold.
- [ ] The v4 → v5 migration passes on its fixture.
- [ ] `npm run check` and `npm run build` pass; the game is playable. Committed and pushed.

**Out of scope:** achievements and toasts (M12b).

---

## M12b — Achievements and notifications

Status: planned

**Goal:** Add templated achievements that give small multipliers, and accessible toasts and
announcements.

**Scope** (GDD §13, §16.3, §17.5):

- `src/engine/systems/achievements.ts`: rows 1–5 (40 achievements) with Appendix C templates,
  plus an Achievements tab.
- The full toast system (merging beyond 3, pause on hover or focus), replacing M7's minimal toast
  through the same `notify(event)` API.
- An `aria-live` region (at most 1 announcement every 2 s) and the tab-title setting (settings
  v4).
- The achievement jingle (`music-jingles_jingles_STEEL04`).
- Save v6.

**Acceptance criteria:**

- [ ] Every achievement in rows 1–5 has a condition test, and every name is its Appendix C
      template (templates test).
- [ ] The breakdown shows the achievement multiplier 1.02^n × 1.1^(full rows).
- [ ] Toasts merge beyond 3 and pause on hover or focus. Announcements are at most 1 per 2 s.
- [ ] The achievement jingle is mapped and hash-verified, and respects the 8-per-second limit.
- [ ] The M5 and M7 bot bands still hold.
- [ ] The v5 → v6 save migration and the settings v3 → v4 migration pass.
- [ ] `npm run check` and `npm run build` pass; the game is playable. Committed and pushed.

**Out of scope:** achievement rows 6–8 (added by M15b, M13 and M22).

---

## M13 — Power layer and the cap

Status: planned

**Goal:** Add the second prestige. x is capped at 2^1024, and Power resets pay E for upgrades
and milestones that keep progress. The Power autobuyer and climb mode prevent a grind.

**Scope** (GDD §8.1–8.4, §12, §14.3):

- `src/engine/systems/power.ts`, `content/power.ts`.
- The cap clamp, the Power reset, and pre-lift E.
- Power upgrades: E×2 (base^n, base from the knob), hints ÷10, offline cap 72 h.
- Power milestones 1–15 (positions 1–7 of the knob list). Their tab unlocks take effect when the
  tabs ship. Milestone 25 is M18a's.
- Power autobuyer (8 resets), climb mode (10), passive P (15) as a state-dependent effect.
- Knobs: Power milestone reset counts, E×2 base.
- `src/ui/power/PowerTab.tsx`.
- Achievement row 7. Reveal and Next goal registrations.
- Save v7. `docs/balance/M13.md`.

**Blocking bands** (GDD §15, M13 rows): first Power reset (active and regular); longest gap
before the first Power reset (active); dead zone (active). **Report:** longest gap (idle).

**Acceptance criteria:**

- [ ] x never exceeds 2^1024 (property test over 10,000 random tick sequences).
- [ ] A Power reset clears the Product layer and keeps discoveries, depth, hold caps,
      achievements and E (fixture diff).
- [ ] E_gain = μ_E. E×2 costs base^n E (1, 3 and 9 E with the initial base).
- [ ] Each milestone at positions 1–7 is unit-tested at its reset count from `knobs.ts`.
- [ ] The Power autobuyer fires at the cap. Climb mode moves A000027 from depth d to d+1 in a
      scripted run.
- [ ] Passive P adds 0.01·pending·Δ at each step boundary, and Pb is re-evaluated at each step
      start. 8 h of `advance()` with passive P on is within 0.5% of log10 x of the 1 s
      reference (bounded-error test).
- [ ] Bot pacing, reported in `docs/balance/M13.md` (seeds 1–3):
  - active: first Power reset at 3–8 h played, with 15–25 discoveries
  - regular: first Power reset on day 1–3
  - active: no gap between meaningful events longer than 15 min before the first Power reset
  - active: no stretch longer than 10 min in which the next goal's ETA is over 1 h or none
  - idle: the longest gap (report only)
  Tuning may use the pre-Power knobs within their ranges, re-running the M5 and M7 bands. A
  band that still fails is escalated (GDD §14.3).
- [ ] The v6 → v7 migration passes on its fixture.
- [ ] `npm run check` and `npm run build` pass; the game is playable. Committed and pushed.

**Out of scope:** slots (M14), challenges (M15a), Lab (M18a), lifting the cap (M17).

---

## M14 — Sequence slots

Status: planned

**Goal:** Turn the collection into a loadout. Each tier's step multiplier comes from an equipped
sequence. Its strength comes from its real terms (normalized w_S) and its data horizon, so the
choice depends on how far each tier will be bought.

**Scope** (GDD §5.2, §8.5, §21.5):

- `src/engine/systems/slots.ts`:
  - eligibility
  - w_S and the slot multiplier with the δ bonus (knob)
  - the horizon
  - the one-slot rule (the default curve is exempt; an explicitly equipped A000079 is not)
  - staged loadouts that apply at the next reset
- Power upgrades for the four slot pairs (1, 2, 4 and 8 E).
- `src/ui/slots/SlotsTab.tsx`: a picker per tier, "term i of N", the projected multiplier at the
  current step, and the breakdown.
- The data-driven A000079 curve is tested against the code curve, which stays the fallback.
- A data-version adapter for slots. The Collection depth weight becomes frozen.
- Save v8.

**Acceptance criteria:**

- [ ] w(A000079) = 1 exactly. w is 3.208 for A000027, 6.316 for A000005, 1.709 for A000045,
      0.405 for A000142 and 0.684 for A000108 (±0.001). w(A000012) = 0.
- [ ] The A000079 data equals the code curve 2^min(i, 34) for i ≤ 100.
- [ ] Among the 15 reference sequences listed in GDD §8.5, the best single sequence at each step
      1–40 is exactly: A000005 at steps 1, 2, 3, 5, 7, 9, 11; A000010 at 4, 6, 8, 10, 12;
      A000045 at 13; A000142 at 14–22; A000110 at 23–29; A000108 at 30–31; A000045 at 32–40.
- [ ] The one-slot rule is enforced for equipped sequences, all 8 tiers can use the default curve
      at once, and staged changes apply only at the next reset.
- [ ] The slot exponent includes (1 + bonus·δ). Sequences with fewer than 21 terms are not
      offered.
- [ ] From a fixture saved after the first Power reset, a bot with a slot heuristic reaches
      2^1024 in at most 80% of the time the same bot takes with no slots equipped.
- [ ] The M6b "fetch fails" test runs again with slots equipped: every tier falls back to the
      default curve and production stays finite.
- [ ] Data version: a slot holding a sequence removed in the altered data fixture becomes empty
      (staged).
- [ ] The v7 → v8 migration passes on its fixture.
- [ ] `npm run check` and `npm run build` pass; the game is playable. Committed and pushed.

**Out of scope:** links and chains (M18b), extrapolation (M15b/M21).

---

## M15a — Challenge framework and Challenges 1–4

Status: planned

**Goal:** Add the challenge framework and the four challenges the cap lift requires. Each
rewards per completion and grants one Record sequence the first time it is completed.

**Scope** (GDD §9, §11, §16.3):

- `src/engine/systems/challenges.ts`:
  - entering and leaving resets (no E paid)
  - goal 2^(1024(c+1)²)
  - completion cap 5
  - rewards
  - the C1–C4 rule modifiers
- `content/records.ts` declares all 12 Records and their grants (used by the reachability
  test); C1–C4 grant A046859, A060843, A028444 and A000215 (collectible, shown as "usable at
  Tower").
- `src/ui/challenges/ChallengesTab.tsx`: rule and reward templates (Appendix C), cited `%N`
  quote where a rule has one, Record, best time.
- Challenge start and complete sounds.
- Save v9.

**Blocking bands** (GDD §15): Challenges 1–4 completed once (regular).

**Acceptance criteria:**

- [ ] Each rule is enforced in engine tests:

  | Challenge | Test                                                                  |
  | --------- | --------------------------------------------------------------------- |
  | C1        | Every slot gives ×1                                                   |
  | C2        | G5–G8 cannot be bought                                                |
  | C3        | ρ is doubled                                                          |
  | C4        | Pb = 1 and Product upgrades are inert, while autobuyers still run     |

- [ ] The goal for completion c+1 is 2^(1024(c+1)²). Completion 1 is reachable before the lift;
      completions 2 and later are blocked until it.
- [ ] Entering or leaving pays no E.
- [ ] Rewards apply only after completion and scale with c (table tests).
- [ ] Each first completion of C1–C4 grants its Record. Records never appear in the window index.
- [ ] Bot (regular, seeds 1–3): C1–C4 each completed once by day 2–5. Tuning may use the knobs
      introduced so far; a band that still fails is escalated (GDD §14.3).
- [ ] The v8 → v9 migration passes on its fixture.
- [ ] `npm run check` and `npm run build` pass; the game is playable. Committed and pushed.

**Out of scope:** C5–C8 (M15b), completions above 5 (M21), the challenge auto-runner (M22),
nested challenges (Backlog).

---

## M15b — Challenges 5–8, extrapolation and reverse read

Status: planned

**Goal:** Add the remaining four challenges, two of them built on real sequences (palindromes
and π(n)) computed in code, plus their rewards: reverse read and extrapolated terms.

**Scope** (GDD §6.3, §9, §10.3, §11):

- C5–C8 rule modifiers; π(n) by a growing sieve and the palindrome test in code.
- Shared mechanics:
  - the extrapolation function (log2 max(1, t), `log2Dec`, at least 6 listed terms, a limit
    parameter for the C8 reward)
  - reverse read
  - Record grants for C5–C8 (A000058, A000372, A003095, A000396)
- Achievement row 6.
- Save v10.

**Acceptance criteria:**

- [ ] Each rule is enforced in engine tests:

  | Challenge | Test                                                                                  |
  | --------- | ------------------------------------------------------------------------------------- |
  | C5        | Coll = 1; 3 distinct window matches are required; already-credited windows count; the same window twice counts once |
  | C6        | Only palindromic counts; from 99, buy-max stops at the largest affordable palindrome  |
  | C7        | i = π(⌊b/10⌋), with π(10) = 4, π(100) = 25 and π(1000) = 168                         |
  | C8        | The horizon is 12 terms                                                               |

- [ ] The π code equals A000720's 78 listed terms, and the palindrome code agrees with A002113
      for every value up to 515.
- [ ] After C5, reverse read with (b1…b8) = (5, 8, 13, 21, 34, 55, 89, 144) credits A000045 at
      depth 10.
- [ ] Extrapolation with the C8 reward (limit 2): A000142 at step 23 gives log2 = 69.929 + 4.318
      (±1e-3). A sequence containing 0 terms (A010060) extrapolates to finite values; a sequence
      with fewer than 6 listed terms is not extrapolated.
- [ ] The C6 and C7 cards show their cited `%N` verbatim, read from `oeis.json`.
- [ ] Each first completion of C5–C8 grants its Record; achievement row 6 has condition tests.
- [ ] The v9 → v10 migration passes on its fixture.
- [ ] `npm run check` and `npm run build` pass; the game is playable. Committed and pushed.

**Out of scope:** completions above 5 (M21), the challenge auto-runner (M22).

---

## M16 — Accessibility and settings pass

Status: planned

**Goal:** Make every screen work with the keyboard, a screen reader, reduced motion,
high-contrast and large fonts. Wire every setting in GDD §19 except music.

**Scope** (GDD §17.6, §18, §19, §21.9):

- axe-core in the playtest, across all tabs, reaching late tabs through dev-hook fixtures.
- Keyboard: WAI-ARIA tabs, modal focus trapping and restore.
- Motion: Full, Reduced and Off.
- Visual: a high-contrast theme, a contrast test computed from the theme tokens, and font scale
  87.5–150%.
- Screen readers: a spoken `aria-label` on every number.
- Hotkeys: the `?` overlay and the N readout.
- Every non-music setting persisted (settings v5).
- Onboarding highlight (GDD §17.4) and its setting.

**Acceptance criteria:**

- [ ] axe-core finds 0 serious or critical issues on every tab, in the light, dark and
      high-contrast themes (late tabs loaded from fixtures in `dist-playtest/`).
- [ ] A keyboard-only playtest from the committed `pre-product` fixture reaches the first
      Product reset.
- [ ] With reduced motion emulated, computed animations are `none`, apart from fades of 150 ms or
      less.
- [ ] Contrast is at least 4.5:1 for text and at least 3:1 for UI elements, in every theme.
- [ ] At 150% font scale there is no horizontal scroll at 375 px.
- [ ] Every number node has a spoken `aria-label` (scan test).
- [ ] The pulsing onboarding outline marks the cheapest useful action, one at a time, and stops
      after that action has been done 3 times; the setting turns it off (jsdom test).
- [ ] Every GDD §19 setting except the music settings persists and applies (table test); the
      settings v4 → v5 migration passes.
- [ ] `npm run check` and `npm run build` pass; the game is playable. Committed and pushed.

**Out of scope:** music settings (M20), localization (Backlog).

---

## M17 — Cap lift, post-cap scaling and the fixpoint calculator

Status: planned

**Goal:** Let the player lift the 2^1024 cap. Prices above 1e308 go through the governor, and
the fixpoint calculator turns late-game balance into a measurable design tool rather than a
guess.

**Scope** (GDD §6.2, §8.7, §8.8, §14, §15):

- The lift upgrade and its four requirements (price and counts are knobs).
- Prices:
  - the governor (L′, L″) for every price
  - buy-max across both thresholds
- Post-lift effects:
  - the post-lift E formula through `floorGain`
  - challenge completions 2–5
  - a flag for the late Lab operators
- `src/sim/fixpoint.ts` (numeric slope, verdicts "capped", "runaway", "converged"), a filled-in
  `content/knobs.ts`, and extended `balance/targets.json`.
- The v1 reachability test and `docs/balance/window-heights.json` with heights.
- Long simulations added to the nightly job. `docs/balance/M17.md`.
- Save v11.

**Blocking bands** (GDD §15): cap lifted (regular); longest gap between the first Power reset
and the lift (active).

**Acceptance criteria:**

- [ ] The lift requires all four conditions, read from `knobs.ts`. Missing any one blocks it.
- [ ] Prices are continuous and strictly increasing across 10^308.25 and 10^(10^4) (property
      test).
- [ ] Across both thresholds, buy-max never overspends and is within 1 purchase of single buys
      (property test).
- [ ] E_gain = 1 at 2^1024 and 2 at 2^1280 with d_E = 256 read from the knobs; the threshold
      tests at ·(1 ± 1e-12) pass.
- [ ] For 5 fixture states, the fixpoint X* is within 25% of the bot's stall level (the log10 x
      at which log10 x rose by less than 0.01 over the previous 10 simulated minutes, bot without
      resets), and the slope (M(X*+1) − M(X*−1))/2 is reported.
- [ ] ε·s < 0.97 is asserted for every post-lift state above L0; pre-lift states report their
      slope and the verdict "capped".
- [ ] v1 reachability: every threshold of achievement rows 3 and 4 can be met with every cost at
      or below height 18 under the current knobs (or the thresholds are lowered in this
      milestone, with a GDD changelog entry); `docs/balance/window-heights.json` is committed.
- [ ] Bot (regular, seeds 1–3): the cap is lifted on day 3–8; active: no gap longer than 45 min
      between the first Power reset and the lift. A band that still fails is escalated.
- [ ] The v10 → v11 migration passes on its fixture.
- [ ] `npm run check` and `npm run build` pass; the game is playable. Committed and pushed.

**Out of scope:** the exponent chain (M19), Lab operators themselves (M18a).

---

## M18a — Transform lab

Status: planned

**Goal:** Add the second discovery route. The Lab applies real mathematical transforms to owned
sequences. Charges keep it from being brute-forced.

**Scope** (GDD §8.3, §8.6, §16.3):

- `src/engine/transforms.ts`: Σ, Δ, Π, B, B⁻¹, E, EXP, M, IM, complement, positions, nonzero
  positions, counting function, record positions.
- The pipeline precomputes the transform table into `oeis.json`.
- `src/engine/systems/lab.ts`: charges (per Power reset from the knob, +1 per challenge
  completion, +1 more per Power reset from Power milestone 25, cap 10), unlock order, compute,
  a cache of tried pairs stored as `operator:A-number` ids.
- The Power upgrade "Lab" (5 E); late operators gated by the M17 lift flag.
- Power milestone 25 (position 8 of the knob list).
- Lab match and no-match sounds.
- `src/ui/lab/LabTab.tsx`.
- Save v12.

**Acceptance criteria:**

- [ ] The table contains every verified example in GDD §8.6. Trivial matches are excluded:
      constant results, identities, and nonzero positions that only give A000027 or A001477.
- [ ] Runtime transforms equal the pipeline table for every (operator, sequence) pair.
- [ ] A new pair costs 1 charge whether or not it matches. Tried pairs are free.
- [ ] Charges: the knob amount per Power reset, +1 per challenge completion, +1 more per Power
      reset after milestone 25, cap 10.
- [ ] The Lab history is stored as ids; the save of a fixture with every pair tried is at most
      64 KB.
- [ ] The Lab sounds are mapped and hash-verified.
- [ ] `oeis.json` is still at most 400 KB, and the pipeline's exact-substring check still passes.
- [ ] The v11 → v12 migration passes on its fixture.
- [ ] `npm run check` and `npm run build` pass; the game is playable. Committed and pushed.

**Out of scope:** Cf. discovery, links and chains (M18b), the graph view (Backlog).

---

## M18b — Cross-references, links, chains and reachability

Status: planned

**Goal:** Add the third discovery route, Cf. discovery along real OEIS cross-references, and the
loadout synergies the real graph gives (links and partial-sum chains). Prove every curated
sequence is reachable.

**Scope** (GDD §6.8, §8.5, §8.6, §21.5):

- The pipeline precomputes the cross-reference graph (A-numbers only) into `oeis.json`.
- Cf. discovery (A000217(n) E).
- Links (Λ = min(1.25, 1 + 0.05n)) and chains in slots.
- The Cf. list on cards.
- The reachability test (windows, Lab, Cf. and the grants declared in `content/records.ts`).
- A data-version adapter for Lab pairs and derivation edges.
- Save v13.

**Acceptance criteria:**

- [ ] Cf. discoveries cost 1, 3, 6 and 10 E, and only curated A-numbers the entry mentions are
      offered.
- [ ] A000012 is reachable through Cf. and not through the Lab.
- [ ] Links: Λ_k = min(1.25, 1 + 0.05·n_k) (additive; 5 links give 1.25, 6 still 1.25). The
      chain A000012 → A000027 → A000217 → A000292 gives ×8 in total.
- [ ] Reachability test: every curated sequence can be reached through windows, the Lab, Cf. or
      grants.
- [ ] Data version: Lab pairs survive the altered data fixture, and derivation edges are
      recomputed.
- [ ] `oeis.json` is still at most 400 KB.
- [ ] The v12 → v13 migration passes on its fixture.
- [ ] `npm run check` and `npm run build` pass; the game is playable. Committed and pushed.

**Out of scope:** the graph view (Backlog), keyword sets (Backlog).

---

## M19 — Exponent chain

Status: planned

**Goal:** Build the post-lift engine. Eight exponent generators produce y, which raises every
generator multiplier to ε. With the governor and the fixpoint calculator, this makes the climb
from 2^1024 to 2↑↑5 reachable and free of runaway.

**Scope** (GDD §5.5, §8.9, §14):

- `src/engine/systems/exponent.ts`: X1–X8, y and ε (state-dependent).
- The Power upgrade (1,000 E).
- m_k^ε in the effects table, with a "^ε" line in the breakdown.
- An exponent-chain section in the Power tab.
- Fixpoint integration and `docs/balance/M19.md`.
- Save v14.

**Acceptance criteria:**

- [ ] Xk cost formula tests, using the knobs: X1 at n = 0 costs 10^(λ_1 + offset) E, which is
      10^4 E with the initial offset 3.
- [ ] The exponent chain advances through the same `integrate.ts` function (spy test).
- [ ] ε = 1 + log10(1+y)/D, re-evaluated at the start of each integration step. The breakdown
      shows ^ε, and its product still equals the rate.
- [ ] 8 h of `advance()` from a fixture with ε > 1 is within 0.5% of log10 x of the 1 s
      reference (bounded-error test).
- [ ] Bot (regular, seeds 1–3): from the committed "just lifted" fixture, reaches 2^65536
      within 2–12 simulated days.
- [ ] A 30-day simulation shows no runaway: ε·s < 0.97 at every post-lift sample above L0, and
      log10 log10 x rises by at most 1.0 per simulated day.
- [ ] Only §14.3 knobs changed, and the report lists every change.
- [ ] The v13 → v14 migration passes on its fixture.
- [ ] `npm run check` and `npm run build` pass; the game is playable. Committed and pushed.

**Out of scope:** the Tower layer (M21).

---

## M20 — Music

Status: planned

**Goal:** Add four FreePD tracks by Kevin MacLeod (CC0) as optional background music. Each track
passes the tag rule read from its own metadata, is normalized only, loops without a gap, and
loads only when enabled.

**Scope** (GDD §16.4, §19):

- `scripts/assets/music.mjs`:
  - single-file checkout of each candidate
  - the ffprobe selection scan and tag rule (artist "Kevin MacLeod"; album "Public Domain",
    "Free PD" or "FreePD Music"; no "CC BY" or "Attribution" in any tag; ≤ 240 s)
  - the title from the tag, or the file name with `titleSource: "filename"` in the manifest
  - trim of digital silence only, no fade, loudnorm, MP3 mono at 80 kbps
- Tracks: "Bit Bit Loop" (Sum and Product), "Beat One" (Power), "Alternative Clock Dimension"
  (Challenges), "Infinite Wonder" (Tower).
- Outputs: `public/assets/music/*.mp3` and their manifest records, including every scanned
  candidate's result.
- `src/platform/music.ts`: lazy loading, the 1.5 s loop crossfade, the 2 s layer crossfade,
  pause on hide and resume on show, the per-layer track map.
- Settings → Audio: music on/off and volume (settings v6), a "Now playing" line, and credits.

**Acceptance criteria:**

- [ ] The pipeline fails on fixtures with an altered artist tag, a missing artist tag, and an
      album tag containing "CC BY". A fixture without a title tag passes with
      `titleSource: "filename"`.
- [ ] The four tracks pass the scan; each is at most 3 MB and 240 s, and the total is at most
      10 MB (ffprobe).
- [ ] Integrated loudness is within ±1 LU of −20 LUFS. No track's transforms include a fade.
- [ ] Music is off by default, and nothing is requested before it is enabled (playtest request
      log).
- [ ] Looping: with a mocked audio context, each track's restart is scheduled as a 1.5 s
      crossfade starting 1.5 s before its end, with no gap.
- [ ] Hiding and showing the tab: music pauses while hidden and resumes within 1 s of being
      shown, at the set volume, with exactly one track instance playing.
- [ ] Music on/off and volume persist and apply; the settings v5 → v6 migration passes.
- [ ] Credits and the "Now playing" line show the title and the artist.
- [ ] `npm run check` and `npm run build` pass; the game is playable. Committed and pushed.

**Out of scope:** extra tracks (Backlog).

---

## M21 — Tower layer

Status: planned

**Goal:** Add the third prestige at 2↑↑5. Height h pays TP = 2^(h−1). Tower upgrades include
extrapolation, which reshuffles which sequences are best, and the repeatables give TP a lasting
sink.

**Scope** (GDD §10):

- `src/engine/systems/tower.ts`: h through `floorGain`, TP, the reset.
- Tower milestones as data (Record slot counts and grants).
- One-time upgrades:
  - keep Power upgrades
  - offline 7 d
  - Extrapolation unlimited
  - challenge cap 10
  - passive E
  - Lab charge cap 30 and +1 per Tower reset
- Repeatables: D ×0.9, E ×4, TP ×2 (cost c·b^n, bases from the knobs).
- `src/ui/tower/TowerTab.tsx` (reveals at 2^65535).
- Number formatting at large heights.
- Save v15.

**Blocking bands** (GDD §15): first Tower reset (regular).

**Acceptance criteria:**

- [ ] h = 1 at 2^65536 and 2 at 2^131072; at each threshold ·(1 + 1e-9) gives the same h and
      ·(1 − 1e-9) gives h − 1. TP is 1, 16 and 128 at h = 1, 5 and 8.
- [ ] A Tower reset clears exactly the Power layer and keeps the listed fields (fixture diff).
- [ ] The Tower tab reveals at x ≥ 2^65535.
- [ ] Extrapolated A000142 at step 30 gives log2 = 104.4756 (±1e-4). It is labelled
      "extrapolated" and never shown as OEIS data.
- [ ] The challenge completion cap rises to 10. The goal for completion 8 is 2^65536.
- [ ] Repeatable costs are 4·b_D^n, 2·b_E^n and 10·b_TP^n TP, with the bases from `knobs.ts`
      (4·4^n, 2·3^n and 10·5^n initially).
- [ ] x at h = 18 (log10 x ≈ 2.59e9) formats as `e2.59e9`.
- [ ] At a height-18 fixture, 1 h of online ticks and 1 h of `advance()` agree within 0.5% of
      log10 x (no sub-resolution growth is lost).
- [ ] `npm run bench`: tick p99 is at most 1 ms in Node for a height-8 fixture.
- [ ] Bot (regular, seeds 1–3): first Tower reset on day 6–14 (report committed). A band that
      still fails is escalated.
- [ ] The v14 → v15 migration passes on its fixture.
- [ ] `npm run check` and `npm run build` pass; the game is playable. Committed and pushed.

**Out of scope:** Records usage, loadout presets, auto-pay and Tower automation (M22).

---

## M22 — Records, Tower automation and the v1 goal

Status: planned

**Goal:** Make the 12 short-data Records the TP sink and the finite v1 goal. Each advance costs
TP equal to the bit length of the next real term, and every Record ends in "Exhausted: N known
terms". Tower-era automation completes the layer.

**Scope** (GDD §10.2, §11, §12, §16.3):

- `src/engine/systems/records.ts`:
  - slots 1–4
  - load and unload
  - advance cost max(1, ⌈log2(1+t)⌉), read as integers from `oeis.json`; at most one advance
    per Record per reset; TP checked after the reset's gain
  - ρ_R and the rewards (ε + Σ 0.02ρ_R; TP × Π(1 + 0.25ρ_R); coefficients from the knobs)
  - the Exhausted state
- The Records tab.
- Tower upgrades: loadout presets (8 TP), Records auto-pay (21 TP).
- Automation: the challenge auto-runner (h2) and the Tower autobuyer (h5).
- Record advance and exhausted sounds.
- Achievement row 8. The completion panel.
- A data-version adapter for Record indices.
- Save v16.

**Report bands** (GDD §15): day 30 (regular).

**Acceptance criteria:**

- [ ] A060843 costs [1, 3, 5, 7, 26] TP and is exhausted after 5 advances. Its card shows
      "Exhausted: 5 known terms" and its `%K` chips.
- [ ] The test reads every cost from `oeis.json`: A000215 costs [2, 3, 5, 9, 17, 33, 65, 129,
      257], and exhausting all 12 Records takes 5,247 TP across 128 advances.
- [ ] A reset's TP gain is added before the advance check; at most one advance per Record per
      Tower reset. Auto-pay honours its toggle.
- [ ] Rewards: ε + Σ 0.02ρ_R and TP × Π(1 + 0.25ρ_R), tested against the knobs.
- [ ] The Record sounds are mapped and hash-verified.
- [ ] The completion panel appears when all 12 are exhausted (fixture), and play continues.
- [ ] In a scripted run, the challenge auto-runner completes an unfinished challenge using its
      preset loadout.
- [ ] Each Tower autobuyer trigger has a test.
- [ ] Data version: a Record index beyond the altered fixture's N_R is clamped.
- [ ] `docs/balance/M22.md` reports the day-30 band (report-only).
- [ ] The v15 → v16 migration passes on its fixture.
- [ ] `npm run check` and `npm run build` pass; the game is playable. Committed and pushed.

**Out of scope:** the Pentation layer (Backlog).

---

## M23 — Balance pass, hardening and 1.0 release

Status: planned

**Goal:** Meet every blocking pacing band across seeds and harden saves and performance. Then
release v1.0.0 on GitHub Pages and as a claude.ai Artifact bundle.

**Scope** (GDD §14.3, §15, §22, §23):

- Balance:
  - multi-seed bot runs for every blocking band, including any escalated ones
  - knob tuning within the §14.3 ranges
  - `docs/balance/M23.md`, with the timeline from a new game to the first Tower reset and the
    report-only bands up to day 30
- Hardening:
  - a soak of 200 simulated hours × 5 seeds
  - a save fuzz of 100k inputs
  - a performance audit (`npm run bench`)
  - a manifest trace of every file in `dist/`
- Release: `CHANGELOG.md`, version `1.0.0`, a tag, the Pages deploy and the Artifact files map.

**Acceptance criteria:**

- [ ] Every blocking band in GDD §15 holds for seeds 1–5 (`balance/targets.json`, with the
      report committed). Every escalated band is resolved or carried by a committed
      `M<n>-bal` decision.
- [ ] Knobs are within their §14.3 ranges, and frozen constants are unchanged (snapshot test).
- [ ] The 200 h soak × 5 seeds has no NaN or Infinity and no invariant failure.
- [ ] The 100k save fuzz never throws.
- [ ] The GDD §21.7 performance budgets are met (`npm run bench`).
- [ ] `verify-manifest` traces every file in `dist/` to code or the manifest.
- [ ] `v1.0.0` is tagged, and Pages is deployed (or the blocker is documented). The Artifact
      files map passes its limits.
- [ ] `npm run check` and `npm run build` pass; the game is playable. Committed and pushed.

**Out of scope:** new systems. After this milestone, promote backlog items.

---

## Backlog (future milestones)

Promote these in order once M23 is done. Each becomes a milestone in the format above.

1. **Pentation layer (↑↑↑).** The next operation after Tower. Height of the height, with the
   threshold where h itself reaches 2^16 (x = 2↑↑6). This brings the 2↑↑6 goal back as a real
   target.
2. **Second-order discovery.** Exponent-chain counts form a second read vector. "Order 2"
   matches multiply that sequence's w by 1.25.
3. **Nested challenges.** Run two challenges at once; one completion counts for both.
4. **Triangle reads.** Read `tabl` sequences (A007318 Pascal, A008277 Stirling) as rows across
   the 8 generators.
5. **Keyword sets.** Small bonuses counted from real `%K` data (`core`, `nice`, `easy`, `hard`,
   `mult`).
6. **Formula mastery.** Curated `%F` lines, filtered like comments, revealed at completion
   milestones.
7. **Number-base notations.** Binary and hexadecimal display, unlocked by discovering `base`
   sequences.
8. **Sequence plots.** Canvas plots, log scale, of a discovered sequence's listed terms, with
   extrapolation shown separately.
9. **Cross-reference graph view.** An SVG view of discovered nodes and of cross-reference and
   derivation edges.
10. **Curated set to 300 sequences**, plus Challenges 9–12 built on real sequences: A006577
    (Collatz steps), A005132 (Recamán), A001462 (Golomb), A000002 (Kolakoski). Existing saves
    adapt through the data-version rule (GDD §21.5).
11. **Generator 9.** λ_9 = A000124(8) = 37, as a Tower-era upgrade.
12. **More music.** Further FreePD tracks for new layers ("Blippy Trance", "Limit 70", "Study
    and Relax"), each passing the GDD §16.4 tag scan ("Blippy Trance" has no title tag and would
    use the file-name fallback).
13. **PWA install.** A service worker for offline play, with an app icon from the CC0 abstract
    set.
14. **Run history.** Per-reset timelines and comparison charts.
15. **Web Worker engine,** if profiling ever shows main-thread pressure.
16. **Local challenge records board.** Best times and completion dates.
17. **Localization of chrome strings** (`strings.ts` only; OEIS text stays verbatim).
18. **Gamepad and remapping support** for hotkeys.
