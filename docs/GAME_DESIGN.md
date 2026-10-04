# Integer Sequence Idle — Game Design Document

This is the authoritative design. Code, tests and `ROADMAP.md` follow it. If a milestone has
to change a formula, it updates this file in the same commit and adds a line to the changelog
(§25).

- **Theme:** abstract numbers. There is no fantasy, no lore and no story.
- **Base design:** the "progression" proposal, which won the judge panel. It is extended with
  the best ideas from the "sequences", "experience" and "engineering" proposals and with fixes
  for the weaknesses the judges raised (§25).
- **Every reference number about the data** (term counts, weights, window counts, costs) was
  checked against the pinned local sources (Appendix B) or produced by the prototype scripts in
  [`docs/prototypes/`](prototypes/README.md), which are committed with this file so later
  sessions can re-run them.
- **Quoted OEIS text** in this document (sequence names such as "Palindromes in base 10.") is
  © OEIS Foundation Inc. and licensed CC BY-SA 4.0. It is quoted for reference only.

Constants come in two kinds:

- **Frozen** constants define early layers and data formats. Once their milestone ships they
  never change, and tests assert their exact values. §14.3 lists them by name.
- **Knobs** are balance values. They may change only within the ranges in §14.3, and only if
  every earlier blocking band still holds.

---

## 1. Title, pitch and pillars

**Title:** _Integer Sequence Idle_. The title is a plain description. It has no invented proper
noun, and it leaves out "OEIS" so it does not suggest the OEIS endorses the game.

**Pitch:**
- Eight generators feed each other, and Generator 1 produces the number **x**.
- Read the eight purchase counts from Generator 8 down to Generator 1. They form an 8-term
  integer tuple.
- When that tuple equals 8 consecutive terms of a real sequence from the On-Line Encyclopedia of
  Integer Sequences, you **discover** that sequence.
- Discovered sequences become multiplier curves. Their strength comes from their real listed
  terms, and they stop where the OEIS entry's data stops.
- Each prestige layer is the next arithmetic operation:
  - **Sum** (+)
  - **Product** (×) at 2^128
  - **Power** (^) at 2^1024
  - **Tower** (↑↑) at 2^65536 = 2↑↑5
- The v1 goal is to exhaust every **Record**. Records are sequences whose entire known data is a
  handful of terms, for example the 5 known busy beaver values.

**Pillars**

1. **The numbers are the content.** The only prose in the game is OEIS text, quoted verbatim
   with its A-number and attribution. All the depth is in the mechanics.
2. **Each layer is the next operation up.** Thresholds are towers of 2, so every goal reads
   cleanly.
3. **The original twist: your counts are an integer sequence.** "Buy as many as possible" pulls
   against "hold an exact set of counts", and that tension runs through every layer.
4. **Readable math.** Every displayed rate breaks down into factors whose product equals it.
   The next goal is always visible.
5. **One deterministic engine.** `tick(state, actions)` (fixed dt = 50 ms) and
   `advance(state, seconds)` are pure and share one integrator, `integrate(state, Δ)`. Online
   play, offline catch-up, the bot player and the replay tests all run the same code.

---

## 2. The asset rule and how it is honored

**Rule (from the user):** "Do not generate any assets such as text, sound, or images. Pull them
from open sources."

**Interpretation (binding for every milestone):**

| Allowed (program, not content)                                                                                   | Forbidden (would be generated content)                                                          |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Code, formulas, numbers, layout, CSS colours and gradients                                                       | Invented names, lore, story, flavour quotes, prose tutorials                                    |
| UI chrome labels ("Buy", "Max all", "Reset", "Settings")                                                          | Invented proper nouns (no "Quantum Forge"; generators are "Generator 1–8")                      |
| Ordinal and mathematical names (Generator 3, Sum, Product, Power, Tower, x, P, E, ε, ↑↑)                          | AI images, hand-drawn SVG art, edited artwork beyond the listed transforms                      |
| Templated strings that combine data ("Reach 2^1024 in under 1 hour")                                             | Procedural or synthesized audio (oscillators, sfxr/zzfx, writing sample buffers)                |
| Canvas/SVG/CSS rendering of numbers: charts, sparklines of real terms, digit animations                          | Sequencing samples into melodies or rhythms                                                     |
| OEIS text (%N, %C), quoted verbatim with A-number and attribution                                                | Paraphrasing or editing OEIS text, beyond rendering `_Name_` markup as plain Name               |
| Legal and attribution notices (licence names, the icon credit line of §16.2, non-affiliation line)              | The OEIS logo or any OEIS branding                                                              |
| Track titles and artist names read from the source files' metadata                                               | Voice-over packs and fantasy-themed packs (`rpg-audio`, `oga-rpg-pack`, `oga-zombies`, `oga-battle`, `voiceover-*`) |

**Where player-visible text may come from:**

- `src/ui/strings.ts`: chrome labels and templates. Each entry is at most 32 characters, with
  `{placeholders}`, and no sentences. This includes:
  - the canonical effect, milestone, challenge and reward templates of Appendix C, keyed by
    content id
  - the notation word and suffix tables (`K`, `M`, …, `Ce`, and the spoken words "times ten to
    the"). `src/engine/format.ts` takes these tables as a parameter and holds no player-visible
    text of its own.
- `src/ui/legal.ts`: attribution, licence, change and non-affiliation notices. Each entry is at
  most 200 characters and has one of 4 declared kinds.
- `public/assets/data/oeis.json`: quoted OEIS fields.
- Generated manifests: icon artists, sound pack names, track titles.
- Content tables in `src/engine/content/*.ts` hold ids only. A `label:` field there may only
  reference a `strings.ts` key.

**Allowed asset transforms**, each recorded per file in the manifest:

- **Icons:** remove the black background path, set `fill="currentColor"`, minify with svgo,
  pack into a sprite.
- **Sounds:** trim silence, fade out, normalize peaks, convert format.
- **Music:** trim, fade, normalize loudness, transcode.

**Enforcement.** Each test below is first proven against a planted fixture. The "Runs" column
says where: `check` is `npm run check` (local and CI, no source clones), `pipeline` is
`npm run assets`, and `nightly` is the nightly job, which has the source clones.

| Test                               | Runs     | Guards                                                                                                        |
| ---------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------- |
| `tests/arch/strings.test.ts`       | check    | `strings.ts` entries ≤ 32 chars and no sentence (`/[a-z]{3,}\s[a-z]{3,}.*[.!?](\s\|$)/i`; the trailing `(\s\|$)` lets decimals such as `0.03c` through, and a planted fixture proves it). In `src/ui/**/*.tsx` outside `strings.ts`/`legal.ts`: no JSX text literal with ≥ 2 letters, and no string-literal JSX attribute with ≥ 2 letters (`aria-label`, `title`, `placeholder`, `alt`, `label`). In `src/engine/content/**`: every `label:` is a `strings.ts` key. `format.ts` contains no letter-only string literals of 2+ letters except via its table parameter |
| `tests/arch/templates.test.ts`     | check    | Every content id that has a `templateId` (upgrades, milestones, challenge rules, rewards, achievements; §21.3) has exactly the Appendix C template in `strings.ts`, and every Appendix C row has a content id. Effects without one (the Sum base factors) are checked by the string lint's `label:` rule |
| `tests/arch/glyphs.test.ts`        | check    | Every code point in `strings.ts` is in the shipped font subsets (§16.5) or in the fallback allowlist           |
| `tests/arch/audio.test.ts`         | check    | No `createOscillator`, `createBuffer`, `new AudioBuffer`, `getChannelData` (banned outright, not only its writes) or `copyToChannel` in `src/`, nor the other synthesis APIs (`createPeriodicWave`, `createConstantSource`, `createScriptProcessor`, `audioWorklet`, `AudioWorkletNode`, `OscillatorNode`, `OfflineAudioContext`); strings are scanned too, so `ctx['createOscillator']` is caught. Also no WAV built in JavaScript and played through allowed playback (the jsfxr/riffwave route): no `data:audio` URI, no `'RIFF'`/`'WAVE'`/`'fmt '` header literal or constant, no audio MIME literal outside `canPlayType`, and no typed arrays, ArrayBuffers, DataViews or object URLs in a file that plays audio. `public/` holds no scripts and `index.html` no inline script, so every shipped script is under `src/` |
| `tests/arch/engine-purity.test.ts` | check    | `src/engine` and `src/sim` use no `window`, `document`, `Date`, `performance`, `Math.random` or UI/platform imports, nor the other environment globals (`globalThis`, `self`, `navigator`, `location`, storage including `indexedDB`, timers including `queueMicrotask`/`setImmediate`, `requestAnimationFrame`, `fetch`, workers and channels, `process`, `Buffer`, `crypto`, `Intl`, `eval`, `toLocale*String`), no `Math` other than as `Math.<name>` (so `Math['random']` and destructuring are caught), no `import.meta` and no `Function` constructor; relative imports stay in `src/engine` (`src/sim` may also import `src/engine`) and end in `.ts`; the only bare import is `break_eternity.js`, from `num.ts`. `npm run typecheck` also checks `src/engine` and `src/sim` with `tsconfig.engine.json` (lib ES2023, no DOM or Node types), so a missed global is a compile error |
| `tests/arch/num.test.ts`           | check    | Only `src/engine/num.ts` imports `break_eternity.js` (static, type-only, dynamic or `require`, including subpaths); no raw log method on a `Num` outside `num.ts` (`.log10()`, `.log2()`, `.ln()`, `.log(b)`, `.absLog10()`, `.pLog10()`, `.logarithm(b)`, also via `?.` or a bracketed name; `Math` logs of doubles are allowed); nothing in `src/` calls the bench-only `installOpCounter` |
| `tests/arch/test-hooks.test.ts`    | check    | Nothing in `src/` except `src/engine/effects.ts` references the test-only effect hook `installTestEffect` (§21.8), so production code cannot inject an effect and the bundle tree-shakes it |
| `tests/arch/licenses.test.ts`      | check    | Every runtime dependency is MIT and its `LICENSE` ships verbatim as `public/LICENSES/MIT-<name>.txt` (Preact and break_eternity.js from M1) |
| `tests/arch/node-import.test.ts`   | check    | A plain `node` imports `src/engine/format.ts` through type stripping and prints a formatted value (§21.6) |
| `tests/assets/manifest.test.ts`    | check    | Every file in `public/assets/**` and `src/data/generated/**` has a manifest record (source repo, commit, path, source sha256, output sha256, SPDX licence, author, transforms, `verified: true`), and every output's sha256 matches its record |
| `tests/assets/oeis.test.ts`        | check    | Committed `oeis.json`: filters (none contains `(AT)`, `@`, `http`, `www.` or ` writes:`), term counts, window rules, record costs, header |
| `tests/assets/oeis-source.test.ts` | nightly  | Every exported OEIS string is an exact substring of its source `.seq` at the pinned commit (`it.skipIf(!process.env.ASSET_SRC_OEIS)`) |
| `tests/assets/icons.test.ts`       | check    | No background square remains; every fill is `currentColor`; the role table matches §16.2                      |
| `tests/assets/icons-source.test.ts`| nightly  | Only artist folders listed in game-icons `license.txt` are used (`badges/` and `various-artists/` are not listed); each `artists.json` name is a verbatim substring of `license.txt` (`it.skipIf(!process.env.ASSET_SRC_ICONS)`) |
| `tests/assets/sfx-source.test.ts`  | nightly  | Each source file's sha256 equals the `index.json` field for its format (`it.skipIf(!process.env.ASSET_SRC_SFX)`) |

**Scanner.** The arch tests share one tokenizer (`tests/arch/lib/scan.ts`) that understands
comments, strings, template literals and regex literals, and fails closed: a file that ends
inside a block comment, template or `${…}` is a violation of every rule, so no construct can
silently blank out the code after it.

**Where the checks run.** CI never has the source clones (§23). So the pipeline does every
check against the sources when it runs: exact substrings, licence files, artist names and
source hashes. It records each source file's sha256 and `verified: true` in
`scripts/assets/manifest.json`, and it fails instead of writing an unverified record.
Check-time tests then verify the committed outputs against the manifest only. Tests that need
the sources are skipped unless their `ASSET_SRC_<NAME>` variable is set, and the nightly job,
which has fresh clones, sets them all.

---

## 3. Core loop

| Scale            | What the player does                                                                                                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Seconds          | Buy generators and global multiplier levels; watch x and its growth (×10^Y per minute).                                                                                                       |
| Minutes (a run)  | Grow x to the next reset threshold. Meanwhile, shape the bought counts with hold caps to hit a sequence window. Each match is a discovery: a permanent multiplier and a quoted card.           |
| Hours (a layer)  | Reset for the layer currency (P, then E, then TP). Buy upgrades and automation. Equip discovered sequences in slots. Run challenges. Use the Lab.                                             |
| Days and weeks   | Lift the 2^1024 cap. Build the exponent chain. Reach 2↑↑5. Advance Records with TP until every one is exhausted.                                                                              |

Each new layer changes what the previous one is for:

- **Product** makes runs repeatable and automatable.
- **Power** turns the collection into equipped slots, adds challenges and the Lab, and finally
  lets the player lift the cap.
- **Tower** adds extrapolation, which changes which sequences are best, and Records, which turn
  the most famous short sequences into the endgame.

---

## 4. Numbers, notation and the big-number strategy

### 4.1 Library decision

**Use `break_eternity.js` 2.1.3** (MIT), pinned exactly, behind `src/engine/num.ts`. No other
module may import it.

Why this library:

- The Tower layer reaches log10 x ≈ 2.6e9 (height 18), and the backlog's Pentation layer goes
  well past break_infinity's ceiling of about 1e9e15.
- Its speed is enough. Measured at 0.4–0.5 µs per operation (100k mixed operations in
  40–50 ms), the per-tick budget of ≤ 400 `Num` operations costs ≤ 0.2 ms. M1's
  `npm run bench` measures about 0.2 µs per operation (ADR 001).
- Switching libraries later would need a save migration, which is the worst kind of late risk.

`num.ts` exports:

- the `Num` type
- `num()`, `ZERO`, `ONE`, `CAP` (2^1024) and `TOWER1` (2^65536)
- log helpers: `log10`, `log2`, `pow10`, `pow2`, plus `slog10` and `tetrate10` for the
  `10↑↑h` notation. `pow10` and `pow2` are exact: results beyond layer 0 are built from
  components (`mag = e`, or `e·log10 2` rounded once from a double-double product, so it is the
  correctly rounded value for every exponent; a plain `e * Math.log10(2)` rounds twice and is
  one ulp off for about 6% of integers, 2^1023 and 2^65535 among them), and small results with
  integer exponents are exact doubles. The library's own `Decimal.pow` is not (ADR 001).
- **safe logs** for every log of a value that can be 0. In break_eternity.js 2.1.3,
  `new Decimal(0).log10()` returns NaN, and x is exactly 0 right after the first G1 purchase.
  - `log10Pos(x)`: `null` if x ≤ 0 (or x is not a finite `Num`), otherwise log10 x as a
    double. Callers must handle `null`. `log2Pos(x)` is the same in base 2.
  - `log10Floor1(x)`: log10(max(x, 1)), which is always finite and ≥ 0 (0 for invalid input).
  - Results beyond the double range (inputs on layer ≥ 2 with mag ≥ 308.25) saturate to
    ±`Number.MAX_VALUE`.
  - Engine code never calls `log10`/`log2` on a value that can be 0. A lint test bans raw log
    methods on a `Num` outside `num.ts`: `.log10()`, `.log2()`, `.ln()`, `.log(b)`,
    `.absLog10()`, `.pLog10()` and `.logarithm(b)` (all NaN at 0 in 2.1.3), also through `?.`
    or a bracketed name. Logs of doubles through `Math` are allowed, because the recipes below
    need them (`pow2(base + d·Math.log2(n/μ))`, `log2Dec` in §10.3).
- `floorGain(v, x, threshold)`, the one helper for every floor-at-threshold gain (§7, §8.2,
  §10.1). It takes the candidate n = ⌊v⌋ from the log formula, then corrects it by at most 1
  with exact `Num` comparisons: n+1 if x ≥ threshold(n+1), n−1 if x < threshold(n). In 2.1.3,
  log2(2^1280) = 1279.9999999999993, so the raw floor would give E_gain = 1 at 2^1280.
  - It returns a `Num` (an integer value ≥ 0), because post-lift gains outgrow doubles: P_gain
    passes 2^53 at x ≈ 2^2248 and the double range at 2^41088 (below `TOWER1`), E_gain passes
    2^53 at 2^14592 and the double range at 2^263168 (Tower height ≈ 3).
  - The ±1 correction applies only below `EXACT_GAIN_LIMIT` = 2^52. From there on consecutive
    thresholds round to the same `Num`, so the candidate itself (floored) is the gain.
  - `v` may be a `number` or a `Num`. A candidate that can leave the double range is passed as
    a `Num` built in log space, `pow2((log2Pos(x) − base)/d)`; a `number` +Infinity saturates
    to `Number.MAX_VALUE` and never falls back to 0 or 1. The result is non-decreasing in v and
    in x.
  **Thresholds are computed in log2 space**, as `pow2(base + d·log2(n/μ))`, never as products
  such as 2^1024 · (n/μ)^256: products round differently (in 2.1.3, `Decimal.pow(2, 1280)` is
  one ulp below `Decimal.pow(2, 1024)·Decimal.pow(2, 256)`), so a product threshold need not be
  the value the log formula inverts.
- `x.sub(cost)` is wrapped as `subClamp(x, cost)` = max(0, x − cost), so a purchase never leaves
  a negative x. Invalid input (x NaN, infinite or negative, or cost NaN or infinite) gives a NaN
  `Num`, so the invariant below reports the corruption instead of a purchase hiding it as 0.
- the save codec, which writes a `[sign, layer, mag]` triple with `mag` as a JSON double so the
  round-trip is exact. `decodeNum` accepts only canonical (normalized) codes with a safe-integer
  layer and builds them without normalizing, so it runs in constant time: in 2.1.3, normalizing
  `[1, L, 0]` steps down one layer per loop iteration, and `[1, 2^53 − 1, 0]` would hang the
  loader for years.
- `isValidNum(x)`: finite and ≥ 0. The engine invariant (§20.1) uses it in production before
  every save. With a `Num` argument it (and `isFiniteNum`) is a plain boolean check, so the
  value keeps its type in the failing branch that reports it; with `unknown` it is a type guard.
- an operation counter, compiled in only for `npm run bench` (§22.12), which reports `Num`
  operations per tick and per macro-step. It is an opt-in `installOpCounter()` in `num.ts`
  that nothing in `src/` calls (an arch test enforces this), so the app bundle tree-shakes it.
  It counts every `Decimal` method except conversions and constructors. A bench declares the
  unit its count is reported in (`units`, `unit`: per tick, per macro-step) and, separately, an
  optional exact self-check (`expectedCount`) and count budget (`maxCountPerUnit`, 400 per
  tick, §21.7).

Shared constants are frozen (`Object.freeze`), and their components are snapshot-tested from
M1: `CAP` = `[1, 1, 308.25471555991675]`, `TOWER1` = `[1, 1, 19728.30179583467]`.

**Resolution at high layers.** At height 18 (log10 x ≈ 2.586e9) the value is stored at layer 1
(mag 2.586e9), and the smallest relative change of x that registers is about 5.5e-7 (half an
ulp of the mag, times ln 10). `x.add(x·1e-7)` returns x unchanged (tested in 2.1.3). §5.5 says
how the integrator avoids losing slow growth.

**What is not a `Num`:**

| Quantity                                | Type                                                                 |
| --------------------------------------- | -------------------------------------------------------------------- |
| Bought counts                           | JS integers, asserted ≤ 2^53                                         |
| Cost and gain exponents (log10 values)  | Doubles. They stay below 2^53 even at height 18.                     |
| Sequence terms                          | Exact decimal strings in data, BigInt in tests, Float64 log2 tables at runtime |

Gains are `Num`s, not counts: `floorGain` returns a `Num` because post-lift P and E gains pass
2^53 and the double range (above).

### 4.2 Notation (`src/engine/format.ts`)

**Modes** (setting, default **Scientific**):

| Mode        | 1.2345e47    | 2^65536          |
| ----------- | ------------ | ---------------- |
| Scientific  | `1.23e47`    | `2.00e19,728`    |
| Engineering | `123.45e45`  | `2.00e19,728`    |
| Logarithm   | `e47.09`     | `e19,728.30`     |
| Standard    | `123.45QaDc` | `2.00e19,728`    |

**Standard suffixes.** The suffix tables live in `strings.ts` (§2) and are passed to
`format.ts`. The value 10^(3n+3) has suffix S(n):

- n = 0: `K`. n = 1…9: `M B T Qa Qi Sx Sp Oc No`.
- n = 10…99: U[n mod 10] + T[⌊n/10⌋], with units U = (none, `U`, `D`, `T`, `Qa`, `Qi`, `Sx`,
  `Sp`, `Oc`, `No`) and tens T = (none, `Dc`, `Vg`, `Tg`, `Qag`, `Qig`, `Sxg`, `Spg`, `Ocg`,
  `Nog`). For example, 1e33 is `Dc`, 1e45 is `QaDc` and 1e285 is `QaNog`.
- n = 100: `Ce` (1e303).
- Standard uses these for 1e3 ≤ v < 1e306 and Scientific from 1e306 on. Tests cover
  9.9999e302 → `999.99NoNog`, 1e303 → `1.00Ce`, 9.9999e305 → `999.99Ce`, 9.99999e305 →
  `1.00e306` (the rounding carry crosses the boundary) and 1e306 → `1.00e306`.

**Rules:**

- **Small integers:** values below the integer threshold are exact, with fixed en-style
  grouping (`999,999`). `format.ts` inserts the commas itself; it never calls `Intl` or
  `toLocaleString`, so output does not depend on the machine's locale. The format tests also run
  under `LANG=de_DE.UTF-8` (a CI step from M1) to prove it. The threshold is 1e6 by default; it
  can be set to 1e3, 1e6 or 1e9. Non-integers between 1000 and the threshold show ⌊v⌋, grouped
  (`1,234` for 1234.9).
- **Small non-integers:** precision + 1 significant digits, so 3 at the default precision 2
  (`12.3`, `0.456`), and never fewer than the integer digits. Trailing zeros are kept (`0.500`,
  `0.00100`, `10.0`), and a value that rounds to 1000 is shown as 1000. Values below 1e-3 use
  negative exponents.
- **Zero** renders as `0`. Negative values (only in deltas) get a leading `−` (U+2212).
- **Mantissa rounding never shows 10.** `9.995e5` becomes `1.00e6`, not `10.00e5` (with the
  integer threshold at 1e3; at the default 1e6 it is below the threshold and shows `999,500`).
- **Large exponents:** exponents of 10,000 or more use the same comma grouping (`e19,728`).
  Once the exponent itself reaches 1e6, it is formatted recursively: `e1.23e45`, then
  `ee1.23e45`. "The exponent" is the true exponent ⌊log10 v⌋ after mantissa rounding, for every
  notation (Engineering included), so `9.996e999,999` becomes `e1.00e6`. A stacked exponent is
  itself formatted in Engineering in Engineering (`e123.45e45` for 10^(1.2345e47)) and in
  Scientific in every other notation, Logarithm included (`e1.23e47`). Values below 1e-3 do
  the same with `e-` (`e-1.00e6` once the exponent reaches −1e6).
- **Tetration form:** an output holds at most 3 `e` characters (`ee1.23e45` is the deepest
  e-form). Beyond that, show `10↑↑h.hh` (U+2191, in the shipped Latin subset), with h rounded
  **up** to the precision (tolerance 1e-9, so 10↑↑5 shows `10↑↑5.00`); rounding to nearest
  would show `10↑↑4.85` for a value above `ee9.99e999,999` and break the order rule. Heights of
  1e6 or more use the mantissa form (`10↑↑1.00e6`).
- **Never** output `NaN`, `Infinity`, `-0` or `undefined`. A non-finite value renders as `—`
  and raises a dev assertion. The assertion is the formatter's `onInvalid` option: `format.ts`
  cannot tell a dev build from a release build (it may not read `import.meta`), so the UI binds
  it once, `createFormatter(tables, { onInvalid })` (M2), to a hook that throws in dev builds.
- **Width** at precision 2, for 1e-3 ≤ v (smaller values may add 1 character for the minus
  sign of the exponent):

  | Notation              | v < 1e10000 | v < e1e6 (10^(10^6)) |
  | --------------------- | ----------: | -------------------: |
  | Scientific, Logarithm | ≤ 10        | ≤ 13                 |
  | Engineering           | ≤ 11        | ≤ 15                 |
  | Standard              | ≤ 11 below 1e306, then as Scientific | as Scientific |

  With the integer threshold at 1e9 the limit is 11 below 1e9 (`999,999,999`). Widths are
  bucketed by the displayed value, so a carry such as `1.00e10,000` (for 9.9999e9999) is judged
  in the column it shows. The property test's own fixtures include the boundary cases:
  `2.00e19,728` (11), `9.99e999,999` (12), `1.00e-999,999` (13), `999.99e999,996` (14,
  Engineering; the largest Engineering form below the recursion, since 999.99e999,999 would
  need exponent 1,000,001), `999.99NoNog` (11, Standard) and `999,999,999` (11, threshold 1e9).
- **Order:** the formatter is weakly monotone per notation. For v1 ≤ v2,
  parse(format(v1)) ≤ parse(format(v2)), where `parse` is the test's inverse of each notation
  (suffixes, `e` stacks and `10↑↑`). Distinct values may format the same: at precision 2,
  1.230e6 and 1.2349e6 both show `1.23e6`.
- **Screen-reader form** (an `aria-label` on every number): `1.23e45` is read as "1.23 times ten
  to the 45". The words come from the `strings.ts` table, which has two entries: "times ten to
  the" and "ten to the". Mantissa forms are always read in the Scientific reading, whatever the
  notation; a stacked form is read as "ten to the" followed by its exponent's reading
  (`e1.23e45` is "ten to the 1.23 times ten to the 45"); negative exponents use `−` (U+2212);
  values below the integer threshold, `0`, `—` and `10↑↑h` are read as displayed.

**Fonts** (§16.5): JetBrains Mono (@fontsource, OFL-1.1) for all numbers and UI, with tabular
figures. Only the Latin (weights 400, 500) and Greek (400, 500) subsets ship. Together they
cover the digits, `×`, `·`, `−`, `↑`, `↓` and Σ Δ Π ε β λ ρ δ μ π. A short fallback allowlist
(`≈ ≤ ≥ ∈ ⌊ ⌋ → ✓`) renders with the system monospace font.

**Stability:**
- Number columns are right-aligned with a minimum width.
- The headline number updates at most 10 times per second.
- Rates use a 1 s moving average.

---

## 5. Layer 0 — Sum (generators)

### 5.1 State and production

- **Start:** x = 10.
- **Generators G1–G8.** Each has an amount `A_k` (a `Num`, which includes produced units) and a
  bought count `b_k` (an integer). Discovery reads the **bought counts**.
- **Production:**
  - dx/dt = A_1 · m_1
  - dA_k/dt = A_(k+1) · m_(k+1) for k = 1..7
- **Per-tier multiplier:**

  m_k = β · g^L · slot_k · Coll · Pb · Ach · U_k · Ch_k

  | Factor | Meaning                                                    | Section |
  | ------ | ---------------------------------------------------------- | ------- |
  | β      | Base production, β = 2                                     | 5.1     |
  | g^L    | Global multiplier, g = 1.15, at level L                    | 5.3     |
  | slot_k | Step multiplier from the tier's slot                       | 5.2, 8.5 |
  | Coll   | Collection multiplier                                      | 6.5     |
  | Pb     | Unspent-P bonus                                            | 7       |
  | Ach    | Achievements                                               | 13      |
  | U_k    | Upgrade effects                                            | —       |
  | Ch_k   | Challenge modifiers                                        | 9       |

  After the cap lift, the whole product is raised to ε (§8.9).

### 5.2 Costs and steps (frozen)

- **Cost:** the n-th purchase of Gk (n counts from 0) costs 10^(λ_k + ρ_k·n).
  - **λ_k = A000124(k−1)** = 1, 2, 4, 7, 11, 16, 22, 29. These are the central polygonal
    numbers; the UI cites the A-number.
  - ρ_k = (k+2)/10, so each purchase multiplies the price by 2.0 for G1 up to 10 for G8.
  - Example: purchase index 10 of G3 costs exactly 10^(4 + 0.5·10) = 1e9.
- **Step:** i_k = ⌊b_k/10⌋.
- **Default curve:** a tier with no sequence equipped uses the powers of 2 (A000079), so
  slot_k = 2^min(i_k, 34).
  - The default curve means "no sequence equipped". It is not subject to the one-slot rule
    (§8.5), so all 8 tiers can use it at once. A tier on which the player explicitly equips
    A000079 is subject to the rule like any other sequence.
  - The default curve is always computed in code as 2^min(i, 34). It never depends on
    `oeis.json`, so Sum and Product keep their full production when the data fails to load.
- **Data horizon:** the curve stops at the last listed OEIS term. A000079 lists 35 terms (2^0
  to 2^34), so the row shows "term 34 of 34". From M14 a test asserts the code curve equals the
  A000079 data for i ≤ 100.

### 5.3 Global multiplier (frozen)

- Level L costs 10^(2+L) and multiplies every generator by 1.15^L. L counts from 0: the
  purchase made at level L costs 10^(2+L), so the first level costs 100, and owning L levels
  gives ×1.15^L (the prototypes' rule).
- The base becomes 1.175 with a Product upgrade, plus 0.005·c from Challenge 6 (§9).

### 5.4 Buying

- **Buy 1, Until 10, Max** per tier.
  - **Buy 1** buys one if affordable.
  - **Until 10** buys up to the next multiple of 10 of b_k (1 to 10 purchases). If not all are
    affordable, it buys as many as are. The button shows the cost of the full set.
  - **Max** buys as many as are affordable.
- **Max all** buys max of G8, then G7, down to G1, then max global levels with what is left.
  All buying is deterministic.
- **Hold caps** (§6.6) limit every bulk buy and every autobuyer.
- **Cost of n purchases** is a closed-form geometric sum below 10^308.25 and exact-plus-bound
  above (§8.8).
- **Exact exponents.** Cost exponents are computed in integer tenths,
  e(n) = (10·λ_k + (k+2)·n)/10 (and (20 + 10·L)/10 for global levels), so every integer exponent
  is exact: cost(G3, 10) is exactly 1e9. The naive double λ + ρ·n differs for 3,479 of the
  16,000 pairs with n < 2,000. A buy that purchases nothing returns the state unchanged.
- **Buy-max** finds n with the closed form (binary search on n), then checks the last purchase
  with the exact iterated cost: if the remaining x after n − 1 purchases cannot pay purchase n,
  n is reduced by 1. Every purchase uses `subClamp`, so x is never negative. In floating point,
  buy-max may differ from repeated single buys by 1 purchase only when the total cost is within
  1e-12 relative of x; it never overspends.
  - **Boundary zone.** The closed form's rounding (a few 1e-14 relative at layer 1) can put n one
    above what single buys pay for. So when the closed-form total of n purchases is within
    1e-12 relative below x, or that of n + 1 within 1e-12 above it, buy-max replays the
    purchases one at a time with their exact costs (at most n + 1 of them; n ≤ 1,024 below the
    cap). It therefore never buys more than repeated single buys would, which is what "never
    overspends" means; it may buy fewer only past the replay limit of 4,096.

### 5.5 Exact integration

Effects come in two classes (§21.3):

- **Event-constant** effects change only at discrete events (purchases, resets, unlocks,
  upgrades, loadout changes). This is almost everything: β, g^L, slot_k, Coll, Ach, Ch_k and
  most upgrade effects.
- **State-dependent** effects change continuously with the state. There are exactly three:
  - the 610-P upgrade G8 × (1 + log10 max(1, x)), which depends on x
  - Pb = (1 + P)^0.25 while passive P (Power milestone 15) is adding P
  - ε = 1 + log10(1 + y)/D, while the exponent chain produces y

With only event-constant effects, the chain is a nilpotent linear ODE between events. It has
an exact solution for any step Δ:

```
A_k(Δ) = Σ_{j≥k} A_j · (Π_{i=k+1..j} m_i) · Δ^(j−k)/(j−k)!
x(Δ)   = x + Σ_j A_j · (Π_{i≤j} m_i) · Δ^j/j!
```

- **Cost:** O(8²) terms in `src/engine/integrate.ts`.
- **Shared by everything:** online ticks, offline macro-steps and the bot all call this one
  function, `integrate(state, Δ)`.
- **State-dependent effects** are evaluated once, at the start of each integration step, and
  held for that step. This is the only refresh rule (§21.3 uses the same one).
  - Online, steps are at most 1 s long (below), so the error is negligible.
  - Offline macro-steps are longer (up to 62 s at 24 h, §20.2). A test bounds the error: for a
    fixture that owns the 610-P upgrade, has passive P on and has ε > 1, 8 h of `advance()` is
    within 0.5% of log10 x of the bot's 1 s-step reference.
- **Passive gains** (passive P and E) are applied at step boundaries: at the end of a step of
  length Δ, P += 0.01 · pendingP · Δ, using pendingP from the start of the step.
- **Lazy integration online.** Actions are applied every 50 ms tick, but the chain is
  integrated over the pending time only when an event happens (an action, a reset or an unlock)
  or the pending time reaches 1 s. The displayed x between flushes is computed from the pending
  time without committing it.
- **No lost growth.** If a flush would leave x unchanged while the exact increment is positive
  (sub-resolution growth at high layers, §4.1), the pending time keeps accumulating until x
  changes, up to 60 s. Deferral applies only to the periodic (1 s) flushes, never to event
  flushes, which always commit; it compares x before the clamp and is skipped at the cap. While
  it defers, online steps may be up to 60 s long (the exception to §21.3's "at most 1 s"), which
  only happens while the growth is below resolution anyway. A test at a height-18 fixture
  checks that 1 h of online ticks and 1 h of `advance()` agree within 0.5% of log10 x.
- **Only a change is an event.** An action that changes nothing (an unaffordable buy, as an
  autobuyer or a held hotkey sends every tick) does not flush, so the pending time keeps
  accumulating. A real purchase does flush and commits the pending time even when its growth is
  below resolution; at those heights that loses at most the growth since the last commit, once
  per purchase. M11 (autobuyers every tick) and M17 (post-lift heights) must keep both rules.
- **Clamp:** before the lift, x is clamped to 2^1024 after every step.

**Prototype check** (greedy bot, these exact numbers; `docs/prototypes/sim4.py`, which runs
the bot of `sim2.py`):
- Unlock times: G2 at 0.9 min, G5 at 5.2 min, G8 at 10.9 min.
- x reaches 1e40 at 12.2 min, with counts (b1…b8) = (130, 95, 72, 55, 42, 30, 20, 11). Read
  from G8 down, that is the rising tuple (11, 20, 30, 42, 55, 72, 95, 130).
- A single run without resets reaches 1e100 at 22.6 min and does not reach 1e200 within 2 h.
  That stall is where prestige takes over (§14.1).

---

## 6. The twist — reading counts as a sequence

### 6.1 Read vector

v = (b8, b7, …, b1).

Normal play buys many cheap low tiers and few expensive high ones. Read from G8 down, that gives
a **rising** tuple, which is the shape most sequences have.

### 6.2 Window index (built by the pipeline, frozen after M6b)

For a curated sequence S, let its listed terms be t_0 … t_(N−1). Index i counts from the first
listed term. The UI shows OEIS indices a(%O + i).

The window at start s is W_s = (t_s, …, t_(s+7)). It is **valid** when:

- every term is an integer with 0 ≤ t ≤ 2·10^4
- it has at least 3 distinct values
- its sum is at least 8

**Records are excluded** from the window index and the projection maps. They are obtained only
by their grants (§11). A000112 is the only Record with valid windows (2), and they are dropped.
A test asserts that no Record appears in the index.

Let W_S be the number of valid windows of S. Reference counts at the pinned commit
(`docs/prototypes/windows.mjs`):

| Sequence | Valid windows (W_S) | Largest count in the last window |
| -------- | ------------------: | -------------------------------- |
| A000045  | 16 | b1 = 17,711 |
| A000027  | 70 | b1 = 77     |
| A001477  | 71 | b1 = 77     |
| A000079  | 8  | b1 = 16,384 |
| A000142  | 1  | b1 = 5,040  |
| A000108  | 4  | b1 = 16,796 |
| A000110  | 2  | b1 = 4,140  |
| A000005  | 97 | b5 = 9      |

The largest count is not always the most expensive purchase: A000027's last window needs
b8 = 70, which costs 1e98, more than b1 = 77 (10^23.8).

**Why 2·10^4.** The governor (§8.8) makes deep counts expensive. Under the default knobs, the
last purchase a window needs costs at most about 10^(3.0e8) (G8 at b = 20,000), which is
height 14. The earlier bound of 10^5 needed height 20 for Fibonacci's last window (b1 = 75,025),
beyond the v1 reference height 18 (`docs/prototypes/window_heights.py`).

**Reachability report.** The pipeline computes, for every curated sequence, the cost of its
deepest window: the maximum over the 8 tiers of the cost of purchase t − 1 of that tier. It
imports the cost formulas from `windows.ts` and the governor from `knobs.ts` (from M17) and
commits `docs/balance/window-heights.json`: the cost and the height needed, or `pre-cap`.
Two tests read it:

- **Lift:** at least 24 sequences can be discovered and at least 3 completed with every cost
  ≤ 2^1024 (pre-cap), the lift requirements of §8.7. Pre-cap costs use only frozen formulas, so
  this test exists from M6b.
- **v1:** every achievement threshold (§13 rows 3 and 4) can be met with every cost at or below
  the v1 reference height 18 (from M17). If a threshold cannot, the achievement thresholds are
  lowered to the reachable counts in the same milestone; they are content, not frozen.

### 6.3 Matching semantics

1. **When to check.** After every action that changes a bought count: buy 1, buy n, buy max,
   or an autobuyer purchase.
2. **Sweeps.** A multi-unit buy of tier k from a to a+n checks every intermediate tuple, not
   only the final one.
   - The runtime keeps 8 **projection maps**. Map P_k is keyed by the 7 coordinates other than
     k, and lists the k-coordinate values of windows, sorted.
   - A sweep is one range query on P_k for values in (a, a+n]. It is exact and costs
     O(log W + matches).
   - Max all sweeps G8 first, then G7, …, G1. Each sweep holds the other coordinates at their
     values at that moment.
3. **Shared windows.** A tuple can equal windows of several sequences. Every match is
   credited. For example, (1, 2, …, 8) discovers A000027 at depth 0 **and** A001477 at depth 1.
   The pipeline commits a shared-window report.
4. **Credit.** An undiscovered sequence becomes discovered, and depth_S = max(depth_S, s).
5. **Resets.** A reset sets every b to 0. That is not a purchase, and the zero tuple is never a
   valid window anyway.
6. **Reverse read** (reward from Challenge 5). The game also checks v′ = (b1, …, b8). A reverse
   match credits depth min(W_S − 1, 2s). It needs "anti-natural" counts, such as eight G8 and
   one G1.
7. **No data, no discovery.** Discovery is inactive until `oeis.json` loads (§21.5). Sum and
   Product play normally without it.

**Reference cases** (unit tests):

- Bought (b1…b8) = (13, 8, 5, 3, 2, 1, 1, 0) discovers **A000045** at depth 0.
- (b8…b1) = (5, 8, 13, 21, 34, 55, 89, 144) gives A000045 depth 5.
- Hold (b8…b2) = (0, 1, 1, 2, 3, 5, 8), then use Max to take G1 from 0 to 20. The sweep passes
  b1 = 13 and discovers A000045.
- The digits of π, (b8…b1) = (3, 1, 4, 1, 5, 9, 2, 6), discover A000796.

### 6.4 Depth and completion

- **Completion:** δ_S = depth_S / (W_S − 1). If W_S < 2, δ_S = 1 on discovery.
- **Complete:** a sequence with δ_S = 1. It gets a "complete" badge and a jingle.
- **Climbing.** For a rising sequence, window s+1 is at least window s in every tier. So one run
  can keep climbing to deeper windows, and climbing becomes a late-game use of discovery.
- **Reachability is set by the data.** A000005 and A000027 complete cheaply, before the cap.
  Fibonacci's last window needs b1 = 17,711, which costs about height 14 under the default
  knobs: a Tower-era goal. The reachability report (§6.2) gives the height for every sequence.

### 6.5 Collection multiplier

Coll = Π over discovered S of (c0 + 0.12·δ_S).

- c0 = 1.08 (a knob, §14.3). The 144-P upgrade adds 0.02 (a knob), and Challenge 5 adds
  0.005·c.
- Unknown A-numbers kept from an older data version (§21.5) are inert and do not count.
- Coll applies to every generator.
- One discovery is worth about ×1.85 to x at steady state (1.08^8). Completing a sequence adds
  about another ×2.3 ((1.20/1.08)^8).

### 6.6 Finding windows: hints, nearness meter, hold caps

- **Hold caps.** Available as soon as the Collection is visible, and free. Each tier row has a
  "hold" field. Max, Max all and autobuyers never exceed it. This removes the friction of the
  first hours, before target-vector automation exists.
- **Clues.** The Collection lists undiscovered window sequences by A-number and quoted %N. The
  real OEIS name is the clue.
- **Hints.** Revealing the next term of a sequence's **signature window** costs 10·2^r P, where
  r is the number of terms already revealed for that sequence. The base 10 is a knob (§14.3). A
  Power upgrade divides the cost by 10.
  - The signature window is the lowest-s window that no other curated sequence shares. The
    pipeline computes it. If none exists, it is the lowest-s window.
  - A hint is stored as (A-number, s, r), not as r alone. After a data update (§21.5), a hint
    whose window s still exists keeps r. Otherwise it moves to the new signature window with
    the same r.
- **Nearness meter.** Shows the window with the most coordinates equal to v: "6/8". Ties go to
  the smallest Σ|difference|, then the lowest A-number.
  - It marks which tiers differ, with ↑ or ↓, but never shows target values unless a hint has
    revealed them.
  - It is recomputed at most 4 times per second in the UI, over about 5k windows.
  - A Product upgrade (34 P) also lists the 3 nearest windows' A-numbers.
- **Automation of the puzzle:**
  - Target-vector autobuyer mode (377 P) buys up to an exact count for all 8 tiers.
  - Climb mode (Power milestone 10) aims automatically at the next window of a chosen sequence.
  - The puzzle therefore moves from manual to automated, as idle games do.
- **Outside help is fine.** Players may look a sequence up on oeis.org. The design treats that
  as part of the fun of a maths game.

### 6.7 Cards

A sequence card shows, all from data:

- quoted `%N` and the A-number
- the offset and a strip of terms
  - the current depth window is highlighted
  - terms show exact digits up to 30 digits, otherwise `≈1.23e45 (46 digits)`
- windows found (`depth d of W−1`) and the δ bar
- keyword chips (raw `%K` tokens)
- the author: the first `_Name_` token of `%A`
- the revision: `#2599`, from `%I`
- `oeis.org/A000045` as a plain anchor that opens in a new tab (nothing is fetched at runtime)
- the credit line from `legal.ts`

Comments:
- Comment 1 is shown on discovery.
- The other curated comments (up to 6 in all) are revealed evenly as δ rises. All are shown at
  completion.
- A-numbers inside a comment link to in-game cards when that sequence is curated.

### 6.8 Discovery routes beyond windows

| Route                                       | Covers                                                                                  |
| ------------------------------------------- | --------------------------------------------------------------------------------------- |
| Windows (§6.3)                              | Most sequences (never Records)                                                          |
| Lab transforms and Cf. links (§8.6)         | Sequences without valid windows, e.g. A010060 (Thue–Morse), A008683                    |
| Cf. links only (§8.6)                       | A000012 (all 1's). The Lab cannot produce it, because constant results are excluded     |
| Challenge first completions (§9)            | The 8 challenge Records                                                                 |
| Tower milestones (§10)                      | The other 4 Records                                                                     |

A **reachability test** proves every curated sequence can be obtained through at least one
route. Grants are read from `content/records.ts`, which declares all 12 grants from M15a on,
so the test can run before the Tower layer ships.

---

## 7. Layer 1 — Product (P)

- **Unlock:** x ≥ 2^128 (3.40e38). The tab reveals at 2^127 (half the threshold, §17.4).
- **Gain (frozen):** P_gain = ⌊2^((log2 x − 128)/d_P) · μ_P⌋, with d_P = 40 (36 with an
  upgrade). It is computed only for x ≥ 2^128 (below that it is 0, so log2 never sees x = 0),
  through `floorGain` (§4.1) with threshold(n) = 2^128 · (n/μ_P)^d_P, computed in log2 space
  as `pow2(128 + d_P·log2(n/μ_P))`. After the lift the candidate outgrows doubles (2^53 at
  x ≈ 2^2248, the double range at 2^41088), so it is passed as a `Num`,
  `pow2((log2 x − 128)/d_P)·μ_P`, and P_gain is a `Num`.

  | x       | P_gain (μ_P = 1) |
  | ------- | ---------------: |
  | 2^128   | 1                |
  | 2^168   | 2                |
  | 1e100   | 34               |
  | 2^1024  | 5,534,417        |

  Threshold tests, for n = 1, 2 and 34: threshold(n) pays n, threshold(n)·(1 + 1e-12) pays n,
  and threshold(n)·(1 − 1e-12) pays n − 1.

- **Reset** puts x back to its start value (10, 1e4 or 2^64) and sets A_k, b_k, L and the run
  timer to 0. It keeps:
  - P, upgrades and autobuyer settings
  - hold caps
  - discoveries and depth
  - achievements and statistics
- **Unspent-P bonus:** Pb = (1 + P)^0.25 on every generator. The exponent 0.25 is a knob
  (§14.3). The 89-P upgrade adds 0.05 (a knob), and Challenge 4 adds 0.02·c. Spending and
  saving therefore pull against each other.
- **Upgrades.** 16 upgrades, costs F(2) … F(17) from A000045 (cited in the UI). The in-game
  text of each effect is its Appendix C template; the table below describes them.

| Cost | Effect                                            | Cost | Effect                                       |
| ---: | ------------------------------------------------- | ---: | -------------------------------------------- |
|    1 | Start runs with x = 1e4                           |   55 | G7–G8 autobuyers; global multiplier autobuyer |
|    2 | G1–G2 autobuyers                                  |   89 | Unspent-P exponent +0.05                     |
|    3 | Global base 1.15 → 1.175                          |  144 | Collection base c0 +0.02                     |
|    5 | Product gain ×1.02 per discovered sequence        |  233 | Product gain ×3                              |
|    8 | G3–G4 autobuyers                                  |  377 | Target-vector autobuyer mode                 |
|   13 | Gk × (1 + b_(k+1)/50), k ≤ 7                      |  610 | G8 × (1 + log10 max(1, x))                   |
|   21 | G5–G6 autobuyers                                  |  987 | Product autobuyer                            |
|   34 | Nearness meter lists the 3 nearest A-numbers      | 1597 | Gain divisor d_P 40 → 36                     |

  The 610-P factor is ≥ 1 for every x, including 0 < x < 1 and x = 0, and it is
  state-dependent (§5.5).
- **Upgrades that need later systems** can be bought from M5 on, but show as pending until
  their system ships: 5, 34 and 144 P need discovery (M7); the global-multiplier part of 55 P,
  377 P and 987 P need Automation I (M11).
- **Repeatables:**
  - Product gain ×2, costing 2584·4^n P. The coefficient 2584 = F(18) is frozen; the base 4 is
    a knob.
  - Autobuyer interval levels, costing 10·3^n P (§12).
- **Unlocks at the first Product reset:** Collection (if not already revealed by a discovery)
  and Statistics.

---

## 8. Layer 2 — Power (E), slots, the Lab, the cap and the exponent chain

### 8.1 The cap

- Before the lift, x is clamped at 2^1024 (≈ 1.80e308) and production stops there.
- The Power reset becomes available. The tab reveals at 2^1023.

### 8.2 E gain and reset

- **Before the lift:** E_gain = μ_E. That is 1 multiplied by the E multipliers.
- **After the lift:** E_gain = ⌊2^((log2 x − 1024)/d_E) · μ_E⌋, with d_E = 256 (a knob),
  computed through `floorGain` with threshold(n) = 2^1024 · (n/μ_E)^d_E, computed in log2
  space as `pow2(1024 + d_E·log2(n/μ_E))` (as a product it would round differently, §4.1).
  The candidate is passed as a `Num`, `pow2((log2 x − 1024)/d_E)·μ_E`: as a double it would
  pass 2^53 at 2^14592 and overflow at 2^263168 (Tower height ≈ 3).
  The two formulas meet:
  E_gain = 1 at exactly 2^1024, and 2 at 2^1280 (with d_E = 256). The raw floor would give 1 at
  2^1280, because log2(2^1280) = 1279.9999999999993 in break_eternity.js 2.1.3 (for the
  library's own `Decimal.pow(2, 1280)`; `num.ts`'s log-space `pow2(1280)` has log2 exactly
  1280, but an x reached by play carries no such guarantee). Threshold tests for n = 1, 2:
  threshold(n) pays n, ·(1 + 1e-12) pays n, ·(1 − 1e-12) pays n − 1.
- **Reset** clears the Product layer: P, Product upgrades (unless kept by a milestone) and
  autobuyer intervals (unless kept). It keeps:
  - E, Power upgrades and slot loadouts
  - discoveries and depth
  - challenge completions and collected Records
  - Lab edges, achievements and statistics

### 8.3 Power milestones (by number of Power resets)

The reset counts below are initial values of a knob (§14.3); tests read them from `knobs.ts`.

| Resets | Unlock                                                        |
| -----: | ------------------------------------------------------------- |
|      1 | Challenges and Slots tabs; keep the autobuyer unlock upgrades (2, 8, 21, 55 P) |
|      2 | Start runs with x = 2^64                                      |
|      3 | Keep all Product upgrades                                     |
|      5 | Keep autobuyer interval levels                                |
|      8 | Power autobuyer                                               |
|     10 | Climb mode                                                    |
|     15 | Passive P: 1% of pending P gain per second                    |
|     25 | +1 Lab charge per Power reset                                 |

The Power autobuyer at 8 resets, and E×2 at 3^n E, together fix the base design's 31-reset
grind before the lift.

### 8.4 Power upgrades (cost in E)

| Upgrade                                   | Cost                                                                                      |
| ----------------------------------------- | ----------------------------------------------------------------------------------------- |
| Slots for G1–2 / G3–4 / G5–6 / G7–8       | 1 / 2 / 4 / 8                                                                             |
| E gain ×2 (repeatable)                    | 3^n (1, 3, 9, …); the base 3 is a knob                                                    |
| Hint costs ÷10                            | 2                                                                                         |
| Offline cap 24 h → 72 h                   | 3                                                                                         |
| Lab                                       | 5                                                                                         |
| **Lift the cap**                          | 16 (a knob). Also requires 24 discoveries, 3 complete sequences (δ = 1), and Challenges 1–4 each completed once (the counts are knobs) |
| Exponent chain (after the lift)           | 1,000                                                                                     |

### 8.5 Sequence slots

Each tier whose slot is unlocked holds one discovered, slot-eligible sequence S.

- **Eligible:** at least 21 listed terms, all terms ≥ 0. Terms do not need to be monotone.
- **One slot per sequence.** An equipped sequence can be in at most one slot. An empty slot (or
  a tier whose slot is not yet unlocked) uses the default curve (§5.2), which is not an equipped
  sequence and is not limited by this rule. Equipping A000079 explicitly is limited by it.
- **Loadouts lock per run.** Slot changes are staged and take effect at the next reset of any
  layer. The choice is a plan, not something to swap every tick.

**Slot multiplier:**

```
slot_k = max(1, t_S(min(i_k, H_S − 1)))^(w_S · (1 + 0.5·δ_S) · (1 + 0.03·c_1) · Λ_k)
w_S    = 210 / Σ_{i=0..20} log2 max(1, t_i)      (w_S = 0 if the sum is 0, e.g. A000012)
```

- H_S is the horizon: the number of listed terms, plus any extrapolated terms (§9, §10).
- c_1 is the number of Challenge 1 completions.
- Λ_k is the Links factor (§8.6): Λ_k = min(1.25, 1 + 0.05·n_k), where n_k is the number of
  linked equipped pairs that include tier k.
- **Normalization.** w_S gives every sequence the same total over steps 0–20 as ×2 per step.
  A000079 gets w = 1 exactly.

**Reference weights** (pinned data):

| Sequence | w_S   |
| -------- | ----: |
| A000079  | 1.000 |
| A000027  | 3.208 |
| A000005  | 6.316 |
| A000010  | 4.286 |
| A000045  | 1.709 |
| A000142  | 0.405 |
| A000110  | 0.532 |
| A000108  | 0.684 |
| A000041  | 1.981 |
| A000040  | 2.210 |

**Best single sequence by step** (`docs/prototypes/norm3.py`). The 15 reference sequences
are A000079, A000027, A000290, A000005, A000045, A000142, A000110, A000041, A000040,
A000010, A000108, A000203, A000032, A000129 and A000244. "Best" compares
w_S · log2 max(1, t_S(min(i, N_S − 1))) at step i, with δ = 0, c_1 = 0 and Λ = 1; ties go to
the lowest A-number. Six different sequences each win somewhere:

| Steps | Best                                                                  | Why                                                                                |
| ----- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1–12  | A000005 (divisors) at steps 1, 2, 3, 5, 7, 9, 11; A000010 (totient) at 4, 6, 8, 10, 12 | Erratic: buying more can lower the multiplier, so players aim for specific step counts |
| 13    | A000045 (Fibonacci)                                                   |                                                                                    |
| 14–22 | A000142 (factorial)                                                   | Until its 23-term horizon                                                          |
| 23–29 | A000110 (Bell)                                                        |                                                                                    |
| 30–31 | A000108 (Catalan)                                                     |                                                                                    |
| 32–40 | A000045                                                               | Longest exponential data, 41 terms                                                 |

M14 tests this exact winner list for steps 1–40.

Because of the one-slot rule, the loadout is a real assignment problem across the 8 tiers'
expected step counts.

### 8.6 The Lab: transforms, cross-references, links and chains

Unlocked by the Power upgrade "Lab" (5 E).

**Charges.** These stop players from brute-forcing every operator × sequence pair.
- +2 per Power reset (a knob), +1 more at Power milestone 25.
- +1 per challenge completion.
- At most 10 stored (30 with a Tower upgrade).

**Compute.**
1. Pick a discovered sequence S and an unlocked operator.
2. A **new** pair costs 1 charge, whether or not it matches. Tried pairs are free and show the
   cached result.
3. The engine computes the first 24 terms with `src/engine/transforms.ts` (BigInt) and shows
   them.
4. If the precomputed table maps (operator, S) to a curated T, then T is discovered at depth 0
   and a derivation edge is recorded.

**Operators, in unlock order:**

| Unlocks at        | Operators                                                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Lab unlock        | Σ partial sums, Δ first differences                                                                                                    |
| 5 Power resets    | Π partial products, B binomial transform                                                                                               |
| 10 Power resets   | B⁻¹ inverse binomial, IM inverse Möbius, M Möbius                                                                                      |
| Cap lift          | E Euler transform, EXP exponential transform, complement, positions of value v ∈ {0, 1, 2}, nonzero positions, counting function, record positions |

**Match rule** (pipeline):
- 12 consecutive equal terms, with result shift ∈ {0, 1, 2} and target shift ∈ {0, …, 3}.
- Constant results and identities are excluded.
- "Nonzero positions" results that only give A000027 or A001477 are excluded.

**Verified examples** (12-term exact windows; `docs/prototypes/tr.py`):

| Operator                | Matches                                                                                                                           |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Σ partial sums          | A000027→A000217, A000217→A000292, A005408→A000290, A000290→A000330, A000079→A000225, A000045→A000071, A000108→A014137               |
| Π partial products      | A000027→A000142, A000040→A002110, A005408→A001147                                                                                 |
| B binomial              | A000012→A000079, A000079→A000244, A001006→A000108                                                                                 |
| E, EXP                  | Euler: A000012→A000041. EXP: A000012→A000110                                                                                      |
| IM, M                   | IM: A000012→A000005, A000027→A000203. M: A000027→A000010                                                                          |
| Positions, complement   | Positions of 2 in A000005 → A000040. Complement of A000040 → A002808                                                              |
| Counting function       | Counting function of A000040 → A000720                                                                                            |

The pipeline precomputes the whole table. A test asserts runtime `transforms.ts` gives the same
results for every pair.

**Cf. discovery.**
- From any discovered card, the player can discover any curated sequence that its entry
  mentions (in `%Y`, `%C`, `%F` or `%N`; the pipeline stores the mentioned A-numbers only).
- The n-th Cf. discovery costs **A000217(n)** E = 1, 3, 6, 10, … (cited).
- Counting every A-number mention, the 120 seed sequences have 446 undirected edges and a
  107-node connected component (`docs/prototypes/closure3.py`). The pipeline commits the counts for the
  final selection.

**Links.**
- Applies to each pair of equipped sequences joined by a cross-reference edge.
- Each linked pair adds 0.05 to both tiers' Λ: Λ_k = min(1.25, 1 + 0.05·n_k) (additive, not
  compounded).
- Well-connected sequences (A000217 and A000079 have 22 in-set links each, A000108 has 19) can
  beat stronger but isolated ones.

**Chains.**
- If tier k+1 holds the Σ transform of tier k's sequence (a derivation edge), tier k+1's slot
  multiplier is ×2.
- The real chain A000012 → A000027 → A000217 → A000292 gives ×8 across three tiers.
- A000012 contributes slot ×1 but completes the chain, which is a real trade-off.

### 8.7 Lifting the cap

- **Requirements:** 16 E, at least 24 discoveries, at least 3 complete sequences, and
  Challenges 1–4 each completed once.
- **Effects:**
  - The clamp is removed.
  - The post-lift E formula applies.
  - Challenge completions 2–5 become reachable.
  - The late Lab operators unlock.
  - The exponent chain can be bought.

### 8.8 Post-cap cost scaling (the governor)

Applies to every price paid in x, P or E, and to global multiplier levels.

Let L be log10 of the pre-cap formula's cost.

1. **Above L0 = 308.25:** L′ = L + a·e(e+1)/2, with a = 0.05 (a knob). Here e is the number of
   purchases of that item beyond the last one priced at or below 10^308.25.
2. **Above L′ = L1 = 10^4:** L″ = L1·(L′/L1)^1.5 (the exponent is a knob).

Properties:
- Prices are continuous and strictly increasing across both thresholds (property test).
- **Cost of n purchases:** the exact sum of the 50 most expensive, plus a geometric upper bound
  for the rest.
- Buy-max uses a binary search on n. It never overspends and is within 1 purchase of iterated
  single buys.

Why "governor": counts grow ∝ √X after the cap, so the feedback slope of slots and global levels
decays and a fixpoint always exists (§14.1).

### 8.9 Exponent chain (after the lift, 1,000 E)

- **Generators:** eight exponent generators X1–X8.
  - The n-th purchase of Xk costs 10^(λ_k + 3 + 2ρ_k·n) E. The offset 3 and factor 2 are
    knobs.
  - Xk produces X(k−1), and X1 produces **y**.
  - Each unit produces 1 per second, ×2 per 10 bought. They have no slots.
  - They use the same exact integrator.
- **Effect:** ε = 1 + log10(1 + y)/D, with D = 100 (a knob; a Tower repeatable multiplies it by
  0.9).
  - Every m_k becomes m_k^ε. The breakdown tooltip shows a "^ε" line.
- **State-dependent:** y grows continuously, so ε is evaluated at the start of each
  integration step (§5.5).
- **No hard softcap.** Runaway is prevented by the governor (§8.8). The fixpoint calculator
  checks it (§14.2). Sims assert ε·s < 0.97 for post-lift states above L0, where the governor
  is active (§14.2).

---

## 9. Challenges (unlock at the first Power reset)

- **Entering** forces a Power-style reset that keeps E. It pays no E, even if a Power reset
  would pay some. Leaving does the same.
- **Goal for completion c+1:** x ≥ 2^(1024·(c+1)²) inside the challenge.

  | Completion | Goal     | Reachable    |
  | ---------- | -------- | ------------ |
  | 1          | 2^1024   | Before the lift |
  | 2          | 2^4096   | After the lift  |
  | 3          | 2^9216   | After the lift  |
  | 4          | 2^16384  | After the lift  |
  | 5          | 2^25600  | After the lift  |
  | 8          | 2^65536  | Tower era       |
  | 10         | 2^102400 | Tower era       |

- **Cap:** 5 completions, 10 with a Tower upgrade.
- **Rewards** scale with c. The **first completion** also grants a **Record** (§11).
- **Card contents:**
  - "Challenge k"
  - the rule as a template
  - the cited sequence's quoted `%N` with its A-number, where the rule comes from one
  - the reward template and the Record granted
  - completions c/5 and the best time

The "Rule" and "Reward" columns describe each challenge. The in-game text is the Appendix C
template (for example C6 shows `b_k ∈ A002113`), never this prose.

| #   | Rule                                                                                                                    | Cited data                                    | Reward per completion c                                                          | Record granted |
| --- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------- | -------------- |
| 1   | Steps off: every slot ×1                                                                                                | —                                             | Slot exponents ×(1 + 0.03c)                                                      | A046859        |
| 2   | Generators 1–4 only                                                                                                     | —                                             | G5–G8 base costs ÷10^(4c)                                                        | A060843        |
| 3   | Cost ratios doubled (2ρ_k)                                                                                              | —                                             | ρ_k ×(1 − 0.03c)                                                                 | A028444        |
| 4   | Unspent-P bonus and Product upgrades off; autobuyers stay                                                               | —                                             | Unspent-P exponent +0.02c                                                        | A000215        |
| 5   | Collection ×1, and 3 distinct window matches during the run are also required                                           | —                                             | c ≥ 1 unlocks reverse read (§6.3); c0 +0.005c                                    | A000058        |
| 6   | A purchase is allowed only if the new count is a palindrome; buy-max jumps to the largest affordable palindrome         | A002113 "Palindromes in base 10."             | Global base +0.005c                                                              | A000372        |
| 7   | Step i_k = π(⌊b_k/10⌋)                                                                                                  | A000720 "pi(n), the number of primes <= n. …" | Step length 10 → 10 − 0.4c (floor(b_k / step length))                            | A003095        |
| 8   | Data horizon cut to 12 terms for every sequence                                                                         | —                                             | +2 extrapolated terms per completion for every sequence (§10.3 formula)          | A000396        |

The A000720 quote is shortened here only. The card shows the full `%N`.

**C5 matches.** A match is a moment, right after a purchase, when the read vector equals any
valid window (including windows already credited). C5 needs 3 distinct windows matched during
the challenge run; matching the same window twice counts once. Because already-credited windows
count, C5 stays completable after every reachable window has been found.

**C6 and C7 compute their rules in code.** The data cannot cover the counts these challenges
reach: at the pinned commit A000720 lists only π(1)…π(78) and A002113 lists palindromes only up
to 515. So `src/engine/systems/challenges.ts` computes π(n) with a sieve (grown by doubling as b
rises) and tests palindromes on the decimal digits. The A-numbers are cited only for the quoted
`%N` on the card. A test asserts that the code equals the data on the listed range (π(1)…π(78);
every palindrome ≤ 515).

---

## 10. Layer 3 — Tower (height h, TP)

### 10.1 Height, gain, reset

- **Available** at x ≥ 2^65536 = 2↑↑5 ≈ 2.00e19,728. The tab reveals at 2^65535 (half the
  threshold, §17.4).
- **Height (frozen):** h = ⌊log2 log2 x⌋ − 15, computed through `floorGain` with
  threshold(h) = 2^(2^(h+15)), built in log2 space as `pow2(2^(h+15))` (§4.1).
  - h = 1 at 2^65536 and 2 at 2^131072.
  - Each new height requires squaring x.
  - log2(2^65536) = 65535.999999999985 in 2.1.3 (for `Decimal.pow(2, 65536)`; `num.ts`'s
    `TOWER1` has log2 exactly 65536). A raw floor gives h = 1 there only because `Math.log2`
    happens to round up; the helper makes it safe. Threshold tests (h = 1, 2) use
    factors (1 ± 1e-9), because break_eternity cannot
    represent a 1e-12 relative change at 2^65536 (its layer-1 magnitude is about 19,728).
- **TP gain** = 2^(h−1) · μ_T. That is 1 at h1, 16 at h5 and 128 at h8.
- **Reset** clears the Power layer: E, Power upgrades (unless kept), the exponent chain, Power
  milestones (unless kept), and everything a Power reset clears. It keeps:
  - TP and Tower upgrades
  - Records and challenge completions
  - discoveries and depth
  - Lab edges, achievements and statistics

### 10.2 Tower milestones (by best height)

| Height | Unlock                                                                       |
| -----: | ---------------------------------------------------------------------------- |
|      1 | Keep Power milestones and the Power autobuyer; Record slot 1; grant A000668  |
|      2 | Challenge auto-runner; grant A005150                                         |
|      3 | Keep 10% of exponent-chain bought counts; Record slot 2; grant A000112       |
|      4 | Grant A000798                                                                |
|      5 | Tower autobuyer; Record slot 3                                               |
|      8 | Record slot 4                                                                |

### 10.3 Tower upgrades and TP sinks

**One-time upgrades.** Costs are Fibonacci numbers in TP: 1, 1, 2, 3, 5, 8, 13, 21.

| Cost | Effect                                                                                                                      |
| ---: | --------------------------------------------------------------------------------------------------------------------------- |
|    1 | Keep Power upgrades                                                                                                         |
|    1 | Offline cap 7 days                                                                                                          |
|    2 | **Extrapolation:** no limit on extrapolated terms                                                                           |
|    3 | Challenge completion cap 5 → 10                                                                                             |
|    5 | Passive E: 10% of pending E gain per second                                                                                 |
|    8 | Loadout presets that switch automatically for each challenge                                                                |
|   13 | Lab charge cap 10 → 30; +1 charge per Tower reset                                                                           |
|   21 | Records auto-pay                                                                                                            |

**Extrapolation formula.** Past the last listed index H−1:

log2 t(i) = ℓ(H−1) + (i − H + 1)·ḡ_S, with ℓ(j) = log2 max(1, t(j))

where ḡ_S is the mean of ℓ(j) − ℓ(j−1) over the last 5 differences (j = H−5 … H−1).

- Using max(1, t), as w_S does, keeps 0 terms (A010060 and A000035 contain them) from giving
  −Infinity or NaN.
- ℓ is computed from the decimal string with `log2Dec(s)`: Math.log2(Number(s)) for at most 15
  digits; otherwise log2 of the first 17 digits plus (digits − 17)·log2 10. Terms above about
  1e308 never pass through `Number` whole. A test checks `log2Dec` against the BigInt bit length
  on a 400-digit term to 1e-12 relative.
- Only sequences with at least 6 listed terms are extrapolated.
- A negative ḡ_S (a falling tail) is clamped to 0, so extrapolated terms never fall below the
  last listed one.

- Worked example: A000142 at step 30 gives log2 t = 69.929 + 8·4.3183 = 104.476. The true
  value of log2 30! is 107.709.
- Extrapolated values are always labelled "extrapolated" and shown with ≈. They are never
  presented as OEIS data.
- Effect on balance: fast-accelerating sequences (factorial, Bell, A006125) become the late
  picks, which changes the value of the whole collection.

**Repeatable TP sinks** (cost c·b^n; the coefficients c are frozen, the bases b are knobs
with initial values 4, 3 and 5):

| Upgrade        | Cost        |
| -------------- | ----------- |
| D ×0.9         | 4·4^n TP    |
| E gain ×4      | 2·3^n TP    |
| TP gain ×2     | 10·5^n TP   |

The main TP sink is Records (§11).

---

## 11. Records and the v1 goal

**Records** are 12 curated sequences whose known data is short. They are collectible from the
moment they are granted, and they count in the collection with δ = 1. From the Tower layer on
they can be loaded into Record slots. Records are excluded from the window index (§6.2), so a
grant is the only way to obtain one.

| Record  | Listed terms | TP to exhaust | Granted by    |
| ------- | -----------: | ------------: | ------------- |
| A046859 | 4            | 12            | Challenge 1   |
| A060843 | 5            | 42            | Challenge 2   |
| A028444 | 6            | 25            | Challenge 3   |
| A000215 | 9            | 520           | Challenge 4   |
| A000058 | 9            | 351           | Challenge 5   |
| A000372 | 10           | 312           | Challenge 6   |
| A003095 | 11           | 607           | Challenge 7   |
| A000396 | 11           | 697           | Challenge 8   |
| A000668 | 12           | 481           | Height 1      |
| A005150 | 15           | 1,028         | Height 2      |
| A000112 | 17           | 324           | Height 3      |
| A000798 | 19           | 848           | Height 4      |

The Records are, in order: simplified Ackermann function; busy beaver steps; busy beaver
sigma; Fermat numbers; Sylvester's sequence; Dedekind numbers; a(n) = a(n−1)^2 + 1; perfect
numbers; Mersenne primes; Look and Say; posets; topologies.

**Totals:** 128 advances and 5,247 TP to exhaust all 12 (`docs/prototypes/record_costs.mjs`,
exact BigInt).

**Advancing.**
- A loaded Record R at index r (0 ≤ r < N_R) advances to r+1 at a Tower reset if TP ≥
  cost(r) = max(1, ⌈log2(1 + t_R(r))⌉).
- **Exact costs.** The pipeline computes each cost as max(1, bitLength(t)) on the BigInt term,
  which equals ⌈log2(1 + t)⌉ for t ≥ 1, and stores the integer costs in `oeis.json`. Floating
  point is wrong here: Number(2^64 + 1), Number(2^128 + 1) and Number(2^256 + 1) round down to
  the power of two, which gave A000215 517 instead of 520. The max(1, ·) matters for A003095 and
  A028444, which start with 0; without it their first advance would be free.
- **Order at a reset:** the reset's TP gain is added first; then each loaded Record is checked
  against the new TP, in slot order.
- The cost is paid at that reset: automatically with auto-pay, otherwise when the player
  confirms.
- At most one advance per Record per Tower reset.
- The costs come from the data. Busy beaver costs 1, 3, 5, 7 and 26 TP, because its last known
  term is 47,176,870.

**Progress.** ρ_R = log(1 + t_R(r−1)) / log(1 + t_R(N−1)), with ρ_R = 0 when r = 0. The logs
use `log2Dec` (§10.3).

**Rewards** (both coefficients are knobs):
- ε gains Σ_R 0.02·ρ_R, summed over all 12 Records.
- TP gain is multiplied by Π_R (1 + 0.25·ρ_R), the product over all 12 Records.

**Exhausted.** When r = N_R, the card shows "Exhausted: N known terms" plus the raw `%K` chips
(for example `hard`, `more`). The slot is freed, and the rewards stay.

**v1 goal: exhaust all 12 Records.**
- A completion panel shows templated statistics: time played, resets per layer, discoveries and
  completions.
- Play continues.
- The backlog's Pentation layer is the next goal after v1.
- This replaces the base design's unreachable "2↑↑6 / h = 65521" horizon with a goal that has
  an end.

---

## 12. Automation

| Feature                       | Unlock                    | Behaviour                                                                                                         |
| ----------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| G1–G8 autobuyers (pairs)      | 2, 8, 21, 55 P            | Interval starts at 2 s. Each shared interval level costs 10·3^n P and multiplies it by 0.8, down to 0.05 s. Modes: single, max, target. Respect hold caps. |
| Global multiplier autobuyer   | 55 P                      | Max levels each interval                                                                                          |
| Target-vector mode            | 377 P                     | Buy up to exact counts for all 8 tiers, then optionally switch to max                                             |
| Product autobuyer             | 987 P                     | Triggers: x ≥ X; gain ≥ Y; every T s; gain ≥ k × last gain                                                        |
| Power autobuyer               | 8 Power resets            | Before the lift: at the cap. After the lift: same triggers as Product                                             |
| Climb mode                    | 10 Power resets           | Chosen sequence: set hold caps to its next window, buy up to it, advance                                          |
| Passive P / E                 | Power 15 / Tower upgrade  | 1% / 10% of pending gain per second                                                                               |
| Challenge auto-runner         | Height 2                  | Runs each unfinished challenge with its preset loadout                                                            |
| Tower autobuyer               | Height 5                  | Triggers on height or TP gain                                                                                     |

- Autobuyers are **silent**.
- They use the same `actions` as the UI. Offline uses the same autobuyer code (§20.2).
- **Firing order within a tick:** tier autobuyers G8 → G1, then the global multiplier
  autobuyer, then reset autobuyers (Product, Power, Tower).
- **Timers** count whole milliseconds. An interval is rounded to whole ms,
  I_ms = max(50, round(2000 · 0.8^n)), and the timer starts at the tick the autobuyer is
  unlocked or switched on (tick t_0). Its k-th firing is at tick t_0 + ⌈k·I_ms/50⌉. Tests
  derive expected firing ticks from this formula, not from a recorded list.

---

## 13. Achievements and statistics

**Achievements:** 64 in 8 rows.
- Each is named by its condition, as a template (Appendix C).
- Each gives ×1.02 to every generator. A completed row gives a further ×1.1.
- Rows are added as their systems ship: rows 1–5 in M12b, row 7 in M13, row 6 in M15b and row
  8 in M22.
- Rows 3 and 4 are checked by the v1 reachability test (§6.2).

| Row | Conditions                                                                         |
| --- | ---------------------------------------------------------------------------------- |
| 1   | Buy Generator k (k = 1..8)                                                         |
| 2   | Reach 1e10, 1e20, 1e40, 1e80, 1e160, 2^1024, 2^4096, 2^65536                       |
| 3   | Discover 1, 5, 10, 25, 50, 75, 100, 150 sequences                                  |
| 4   | Complete 1, 3, 5, 10, 20, 40, 60, 100 sequences                                    |
| 5   | Product reset in under 600, 300, 120, 60, 30, 10, 5, 1 s                           |
| 6   | Complete Challenge k (k = 1..8)                                                    |
| 7   | 1, 5, 10, 25, 50, 100, 250, 1000 Power resets                                      |
| 8   | Exhaust 1, 2, 3, 4, 6, 8, 10, 12 Records                                           |

**Statistics:**
- totals for x produced (all time, this run, this Power run)
- time played, split into active and offline
- fastest reset per layer and best gain per minute
- counts: resets, purchases, discoveries, completions
- highest x ever
- a table of the last 10 resets per layer

**Charts** (inline SVG, no library):
- samples live in their own storage key (§20.1), not in the save
- log10 x over 10 min, 1 h, this run and all time (samples with x ≤ 0 are skipped)
- P gain per minute in the current run, with a marker at its peak
- Okabe–Ito colours
- every chart has a "Show as table" toggle and an accessible summary

---

## 14. Growth model, fixpoint calculator and knobs

### 14.1 Why runs stall, and why that is good

Let X = log10 x.

**Steady state.** With everything affordable bought:

X ≈ ε·M(X) + A(T)

- M(X) = Σ_k log10 m_k at the counts affordable at X.
- A(T) ≈ log10(A_8·T^8/8!) is the time term.

**Feedback slope.** s(X) = M′(X).
- **Global levels:** one level per order of magnitude gives 8·log10 1.15 = **0.486**.
- **A000079 slots:** i_k ≈ X/(10ρ_k), which gives 0.0301·Σ 1/ρ_k = **0.430**.
- **Total ≈ 0.92 < 1** with the base constants. A first run therefore converges to a stall,
  X* ≈ A/(1 − s), instead of running away.
- **Before the lift the slope may exceed 1, and that is intended.** After the 3-P upgrade the
  global part is 8·log10 1.175 = 0.560, so with the A000079 slots the total is 0.990. The C6
  reward (base 1.2) gives 0.633 for the global part alone. Steeper slot sequences and the
  exponent factor (1 + 0.5δ)(1 + 0.03c_1)Λ, up to 2.44, push the slot part above 1. The cap
  bounds every pre-lift run, so a slope above 1 there just means "reaches the cap".

**Horizons.** Each tier's slot leaves the feedback when it reaches its horizon. For A000079 at
step 34 (b = 340):

| Tier       | X at horizon |
| ---------- | ------------ |
| G1         | ≈ 103        |
| G2         | ≈ 138        |
| G3         | ≈ 174        |
| G4         | ≈ 211        |
| G5         | ≈ 249        |
| G6         | ≈ 288        |
| G7, G8     | Beyond the cap |

That is why longer and steeper sequences in slots matter in the Power layer.

**Moving the stall outward.**
- Layer currencies add constant terms: Pb, Coll, Ach and upgrades. Each reset moves X*
  outward. That is the prestige loop.
- **After the lift**, the governor (§8.8) makes counts grow ∝ √X, so s(X) decays and a fixpoint
  always exists.
- ε multiplies the whole M, so the exponent chain and Records push X* toward 2^65536 without a
  pole.

### 14.2 Fixpoint calculator (`src/sim/fixpoint.ts`)

**Method:** iterate X ← ε·M(X) + A(T), using the real engine functions (buy-max at budget 10^X,
effects table).

**Slope, defined numerically:** s = (M(X* + 1) − M(X* − 1))/2, with M evaluated by the same
engine functions. The reported slope is ε·s.

**Reports:**
- X*
- the slope ε·s at X*
- the number of iterations
- the verdict:
  - "capped" for a pre-lift state whose iteration reaches log10 2^1024 (any slope; §14.1)
  - "runaway" for a post-lift state with no convergence in 200 iterations or ε·s ≥ 1
  - otherwise "converged"

**Assertion.** ε·s < 0.97 is asserted only for post-lift states with X* above L0 = 308.25,
where the governor is active. For pre-lift states the slope is reported, never asserted.

**Stall level** (what the calculator is compared with): run the bot without resets from the
fixture state; the stall is the log10 x at the first moment when log10 x has risen by less than
0.01 over the previous 10 simulated minutes.

**Uses:**
- the design tool for every late-game knob
- tested against the bot's stall level (§22.8)
- part of the balance report (`docs/balance/*.md`)

### 14.3 Frozen constants and knobs

**Frozen after their milestone.** Names are the constants in `src/engine/content/*.ts`. A
snapshot test asserts every value from its milestone on.

| Frozen after | Constants                                                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| M2           | `LAMBDA` = A000124(k−1) = 1, 2, 4, 7, 11, 16, 22, 29; `RHO` = (k+2)/10; `BETA` = 2; `GLOBAL_BASE` = 1.15; `GLOBAL_COST` = 10^(2+L); `STEP_LENGTH` = 10; `X_START` = 10; `DEFAULT_CURVE` = 2^min(i, 34); `TICK_MS` = 50 |
| M5           | `PRODUCT_THRESHOLD` = 2^128; `P_OFFSET` = 128; `D_P` = 40 and 36 with the 1597-P upgrade; `PRODUCT_UPGRADE_COSTS` = F(2)…F(17); the effects of the 1, 3, 5, 13, 233, 610 and 1597-P upgrades (1e4; 1.175; ×1.02 per discovery; 1 + b/50; ×3; 1 + log10 max(1, x); 36); `P_REPEAT_COEFF` = 2584; `INTERVAL_START` = 2 s |
| M6b          | Window rules (`WINDOW_LEN` = 8, `WINDOW_MAX_TERM` = 2·10^4, at least 3 distinct values, sum ≥ 8, Records excluded); the w_S formula 210 / Σ_{i=0..20} log2 max(1, t_i); `SLOT_MIN_TERMS` = 21 |
| M7           | `HINT_RATIO` = 2 (the hint base is a knob); the Collection formula Coll = Π(c0 + weight·δ_S) (c0 and the weight are knobs)       |
| M11          | `INTERVAL_FACTOR` = 0.8; `INTERVAL_MIN` = 0.05 s; `INTERVAL_COST` = 10·3^n                                                     |
| M13          | `CAP` = 2^1024; pre-lift E_gain = μ_E; hint divisor 10 (2 E); offline cap 72 h (3 E)                                          |
| M14          | Slot costs 1, 2, 4, 8 E; the slot exponent structure (1 + bonus·δ)(1 + 0.03·c_1)Λ; the Collection depth weight (a knob until M14 ships) |
| M15a         | Challenge goals 2^(1024(c+1)²); `CHALLENGE_CAP` = 5; C1–C4 rules and reward coefficients (0.03, 10^(4c), 0.03, 0.02)           |
| M15b         | C5–C8 rules and reward coefficients (0.005, 0.005, 0.4, 2 terms); reverse-read depth min(W_S − 1, 2s); the extrapolation formula |
| M17          | Governor threshold `L0` = 308.25                                                                                                |
| M18a         | Lab match rule (12 terms, result shift 0–2, target shift 0–3); Lab cost 5 E; `LAB_CHARGE_CAP` = 10                              |
| M18b         | Cf. cost A000217(n) E; `LINK_STEP` = 0.05; `LINK_CAP` = 1.25; `CHAIN_MULT` = 2                                                 |
| M19          | Exponent chain cost 1,000 E; ε = 1 + log10(1 + y)/D (D is a knob)                                                               |
| M21          | `TOWER_THRESHOLD` = 2^65536; h = ⌊log2 log2 x⌋ − 15; TP = 2^(h−1)·μ_T; Tower upgrade costs F(1)…F(8); repeatable coefficients 4, 2, 10 |
| M22          | Record costs max(1, bitLength(t)) (integers in `oeis.json`); at most one advance per Record per reset                          |

**Knobs.** Knobs live in `src/engine/content/knobs.ts`. Tests read the knob constants, not
literals, so tuning never breaks a test. A knob may be tuned by the milestone that introduces
it and by any later milestone, within its range, provided every earlier blocking band (§15)
still holds for seeds 1–3; the tuning milestone re-runs them.

| Knob                                       | Initial                    | Allowed range                              | From |
| ------------------------------------------ | -------------------------- | ------------------------------------------ | ---- |
| Collection base c0                         | 1.08                       | 1.04–1.12                                  | M7   |
| c0 step of the 144-P upgrade               | 0.02                       | 0.01–0.04                                  | M7   |
| Collection depth weight                    | 0.12                       | 0.05–0.25 (frozen once M14 ships)          | M7   |
| Unspent-P exponent                         | 0.25                       | 0.15–0.40                                  | M5   |
| Unspent-P exponent step of the 89-P upgrade| 0.05                       | 0.02–0.10                                  | M5   |
| Product gain repeatable base (2584·b^n)    | 4                          | 3–6                                        | M5   |
| Hint cost base (base·2^r P)                | 10                         | 2–50                                       | M7   |
| Power milestone reset counts               | 1, 2, 3, 5, 8, 10, 15, 25  | each ×0.5–×2; strictly increasing; first 1 | M13  |
| Slot depth bonus                           | 0.5                        | 0.25–1.0                                   | M14  |
| d_E (post-lift E divisor)                  | 256                        | 128–512                                    | M17  |
| Governor a                                 | 0.05                       | 0.01–0.2                                   | M17  |
| Governor L1                                | 10^4                       | 10^3.5–10^5                                | M17  |
| Governor exponent                          | 1.5                        | 1.2–2.0                                    | M17  |
| ε divisor D                                | 100                        | 20–400                                     | M19  |
| Exponent-chain cost offset                 | 3                          | 0–6                                        | M19  |
| Exponent-chain ratio factor                | 2                          | 1–3                                        | M19  |
| E×2 base (b^n E)                           | 3                          | 2–5                                        | M13  |
| Lift price                                 | 16 E                       | 8–64                                       | M17  |
| Lift discoveries                           | 24                         | 16–40                                      | M17  |
| Lift complete sequences                    | 3                          | 1–6                                        | M17  |
| Lab charges per Power reset                | 2                          | 1–4                                        | M18a |
| Record ε reward                            | 0.02                       | 0.005–0.05                                 | M22  |
| Record TP reward                           | 0.25                       | 0.1–0.5                                    | M22  |
| Tower repeatable bases (D, E, TP)          | 4, 3, 5                    | 2–8 each                                   | M21  |

Acceptance criteria that mention a knob are written in terms of the knob ("E×2 costs
base^n E"), and their tests read `knobs.ts`.

**Escalation.** If a blocking band still fails after every allowed knob has been tried within
its range:

1. The milestone records the miss, the measured values and the best knob set it found in
   `docs/balance/M<n>.md`.
2. It marks the band `escalated` in `balance/targets.json`. The band is then report-only for
   that milestone, which can finish.
3. It inserts a balance milestone `M<n>-bal` into the roadmap directly after itself, with the
   escalated band as its acceptance criterion. That milestone may widen a knob range or change a
   frozen constant, but only with a GDD changelog entry (§25), a save migration if stored state
   depends on the constant, and updated frozen-value tests. This is the only way a frozen
   constant ever changes.

---

## 15. Pacing targets

The bot profiles are defined in §22.6. A **blocking** band is asserted for bot seeds 1–3 in the
milestone named in the "Blocks" column, and again in every later milestone's regression run,
within exactly the stated range. If it cannot be met, §14.3's escalation applies. The
"Prototype" column is what `docs/prototypes/idle_sim.py` and `product_sim.py` measured; the
real bot will differ, and only the target is asserted.

| Event                                    | Profile | Target                                                    | Prototype                         | Blocks |
| ---------------------------------------- | ------- | --------------------------------------------------------- | --------------------------------- | ------ |
| G5 / G8 (first purchase)                 | active  | 4–7 min / 9–14 min                                        | 5.3 / 10.9 min                    | M2     |
| x ≥ 2^128 first reached                  | active  | 10–16 min                                                 | 12.1 min                          | M2     |
| x ≥ 2^128 first reached                  | idle    | ≤ 120 min                                                 | 90.4 min                          | M2     |
| First Product reset                      | active  | 10–16 min                                                 | 14.2 min (reset near peak P/min)  | M5     |
| First Product reset                      | idle    | ≤ 120 min                                                 | 105 min (next check-in after 90.4) | M5    |
| Second run reaches 2^128                 | active  | ≤ 90% of the first run's time to 2^128                    | 84–88% (10.2–10.7 vs 12.1 min)    | M5     |
| 60 min played                            | active  | ≥ 4 Product resets; the 3-P upgrade owned; best x ≥ 1e45  | 5 resets; 1, 2, 3 P owned; 1e57.7 | M5     |
| 60 min played                            | active  | ≥ 5 discoveries, and the M5 row above still holds         | —                                 | M7     |
| First Power reset (2^1024)               | active  | 3–8 h played; 15–25 discoveries                           | 4.4–5.3 h (simple discovery model) | M13   |
| First Power reset                        | regular | Day 1–3                                                   | —                                 | M13    |
| Longest gap between meaningful events    | active  | ≤ 15 min before the first Power reset                     | —                                 | M13    |
| Dead zone (before the first Power reset) | active  | No stretch > 10 min in which the next goal's ETA is > 1 h or none | —                         | M13    |
| Challenges 1–4 completed once            | regular | Day 2–5                                                   | —                                 | M15a   |
| Cap lifted                               | regular | Day 3–8                                                   | —                                 | M17    |
| Longest gap between meaningful events    | active  | ≤ 45 min between the first Power reset and the lift       | —                                 | M17    |
| First Tower reset (2↑↑5)                 | regular | Day 6–14                                                  | —                                 | M21    |

**Why these values.** The first idle run is set entirely by the M2 constants, and nothing from
Product applies before the first reset, so its band must hold at M2: with check-ins every
15 min the prototype reaches 2^128 at 90.4 min (37 min with 5-min check-ins, 70 min with
10-min ones). The first reset at 2^128 pays 1 P, so the second run is only modestly faster;
the 60-minute band reflects that the early Product loop pays 1–2 P per reset.

**Report-only bands.** Run nightly and in the milestone named. They inform knob tuning and
never block a milestone.

| Event                                 | Profile | Target                                    | Reported from |
| ------------------------------------- | ------- | ----------------------------------------- | ------------- |
| Product resets per 3 h, over 12 h     | idle    | Rising from window to window              | M11           |
| Longest gap between meaningful events | idle    | ≤ 2 h                                     | M13           |
| Day 30                                | regular | Height 8–14; ≥ 6 Records exhausted        | M22           |
| v1 completion                         | regular | Day 45–90                                 | M23           |

**Meaningful events:**
- a tier unlocked (its first purchase, the prototypes' `G<k>` event; not the half-cost reveal of
  §17.4)
- a reset of any layer
- an upgrade or milestone
- a discovery or completion
- a challenge completion
- a Record advance

**ETA of the next goal.** The Next goal chip's time-to-afford (§17.4) at the current rates. It
is "none" when the goal cannot be reached at the current rates: production is 0, or the goal
is not an amount of x or of a currency (for example a challenge completion or a discovery
count). "None" counts as more than 1 h.

---

## 16. Open assets: what is used and how

All sources are pinned in `scripts/assets/sources.json` and `docs/SOURCES.md`:

| Source              | Commit     |
| ------------------- | ---------- |
| game-icons          | `82d94881` |
| open-game-sfx-index | `34bbe8b5` |
| oeisdata            | `25716378` |
| CC0-1.0-Music       | `655388f9` |

### 16.1 OEIS (text and data, CC BY-SA 4.0)

**Selection.**
- `scripts/assets/oeis-selection.json` holds 150–170 entries.
- It is seeded from Appendix A, and every entry is verified to exist at the pinned commit.
- Roles are computed from the data:

  | Role          | Rule                                     |
  | ------------- | ---------------------------------------- |
  | window        | ≥ 1 valid window (never a Record, §6.2)  |
  | slot-eligible | ≥ 21 listed terms, all ≥ 0               |
  | record        | One of the 12 in §11                     |
  | route-only    | Reached only by the Lab, Cf. or a grant  |

**Extracted fields:**
- `%N`
- `%S`/`%T`/`%U` (terms as strings)
- `%O`
- `%K`
- the `%A` name token
- the `%I` revision number
- A-numbers mentioned anywhere in the entry (IDs only, for the cross-reference graph)
- up to 6 curated `%C`

**Comment filters** (in order):
1. Reject comments longer than 280 characters.
2. Reject any containing `(AT)`, `@`, `http` or `www.`.
3. Reject third-party quotations: ` writes:`, text opening with a quotation mark, or a quoted
   passage of 40 characters or more. This removes A000045's Knuth and Goonatilake quotes.
4. Reject context-dependent comments: "below", "above", "link", or text ending in `:`.
5. Reject `(Start)` / `(End)` blocks.
6. Apply the checked-in allow/deny list `scripts/assets/oeis-comments.json`.

Curation only **selects**. It never edits. Signatures ("- _Name_, date") are kept.

**Reading sources.** `git show <sha>:seq/A000/A000045.seq`, after a batched sparse
`git checkout <sha> -- <paths>`. A dirty working tree can never leak into the output. OEIS
b-files are **not** used: in the clone they are Git LFS pointers, and oeis.org is unreachable
from the sandbox.

**Output.** `public/assets/data/oeis.json` holds:
- a header with licence `CC-BY-SA-4.0`, the attribution, the source repo and commit, the list of
  changes and its `dataHash` (sha256 of the entries and derived tables)
- the entries, including each Record's integer advance costs (§11)
- the derived window index, signature windows, transform table and cross-reference graph

It is readable JSON, never obfuscated. It is **fetched at boot**, not inlined into the
MIT-licensed JavaScript, and ships as its own file. A sidecar `LICENSE-OEIS.txt` sits next to
it. The pipeline also writes `src/data/generated/data-manifest.json` (MIT, no OEIS text) with
the expected `dataHash`, which the build injects so the loader can fetch
`oeis.json?h=<dataHash>` (§21.5).

**Verification.** The pipeline checks every exported string against the source `.seq` at the
pinned commit and records the source sha256 and `verified: true` per entry in
`scripts/assets/manifest.json` (§2). The check-time tests read only the committed outputs.

**Licence files.**
- `public/LICENSES/CC-BY-SA-4.0.txt` is copied from `oeisdata/LICENSE` and ships in `dist/`.
- Code is MIT (`LICENSE` at the repo root). The README explains the split.
- **OEIS text inside the repo outside `oeis.json`.** Tests read OEIS strings from `oeis.json`
  instead of literals wherever they can. Where a test fixture or a document quotes OEIS text
  (for example this GDD), the README declares those excerpts CC BY-SA 4.0, © OEIS Foundation
  Inc., and lists the files that contain them.

**On screen:**
- Every OEIS string appears with its A-number.
- Every card has the line "Data: OEIS Annnnnn · © OEIS Foundation Inc. · CC BY-SA 4.0".
- The Credits tab lists every entry with author and revision, plus "Not affiliated with or
  endorsed by the OEIS Foundation." It reads these fields from `oeis.json` at runtime.
  `src/data/generated/credits.json` (bundled into the MIT JavaScript) covers icons, sounds,
  music, fonts and libraries only, and never contains OEIS fields.
- `CREDITS.md` has an OEIS section marked "CC BY-SA 4.0, © OEIS Foundation Inc."
- Raw strings are stored. The UI renders `_Name_` as Name, and that is the only change.

**Stated modifications:**
- fields extracted
- terms limited to the listed data
- comments selected, not edited
- markup rendered
- window index, transform table and graph derived

### 16.2 Icons (game-icons.net)

**CC0 `viscious-speed/abstract-001…121`** are used for:
- generators G1–G8
- exponent generators X1–X8
- emblems for the Sum, Product, Power and Tower layers and the Slots tab
- challenges 1–8
- Records 1–12
- achievement rows 1–8

**Assignment by measured complexity.**
- **Metric:** the number of path command letters (`MmLlHhVvCcSsQqTtAaZz`) in the source file's
  `d` attributes, excluding the background path `M0 0h512v512H0z`, counted before svgo (which
  rewrites commands). `docs/prototypes/icon_complexity.mjs` measures it.
- **Exclude** the face- or creature-like icons: 003, 008, 018, 019, 023, 037, 041, 046, 085,
  101 and 115. That leaves 110 eligible icons.
- **Ladder roles** G1…G8, then X1…X8: each takes the eligible icon with the smallest count that
  is strictly greater than the previous ladder icon's count; ties go to the lower icon number.
- **Other roles** (emblems, challenges, Records, rows) take the remaining icons in (count, icon
  number) order.

Measured at `82d94881` (count in parentheses). The pipeline recomputes this table and a test
asserts it, including that G1–G8 strictly increase:

| Role                  | Icons                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------- |
| G1–G8                 | 097 (17), 006 (18), 030 (22), 013 (24), 028 (25), 031 (26), 062 (27), 058 (29)              |
| X1–X8                 | 068 (30), 081 (31), 033 (33), 005 (34), 051 (37), 098 (38), 084 (39), 064 (40)              |
| Sum, Product, Power, Tower, Slots | 105 (22), 113 (25), 060 (26), 067 (26), 091 (26)                                |
| C1–C8                 | 095 (30), 059 (33), 079 (33), 014 (34), 042 (34), 108 (37), 080 (42), 027 (43)              |
| Records 1–12          | 039, 077, 034, 065, 099, 056, 045, 107, 004, 016, 073, 090 (43–50)                          |
| Achievement rows 1–8  | 054, 043, 061, 070, 116, 024, 050, 086 (51–54)                                              |

**CC BY 3.0 UI controls.** Each credit line reads
"Icons made by {author} · game-icons.net · CC BY 3.0 · recoloured", with a link to the licence
text in `public/LICENSES/CC-BY-3.0.txt`. "Recoloured" notes the modification (fill set to
`currentColor`, background removed).

| Artist      | Icons                                                                                                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| lorc        | cog (settings), padlock (locked), stopwatch (interval), sands-of-time (offline), over-infinity (lift), moebius-triangle (challenges), cycle (reset), crystal-growth (records), cross-mark (close), linked-rings (links) |
| delapouite  | padlock-open, histogram (statistics), robot-grab (automation), nested-hexagons (collection), star-formation (achievements), save, sound-on, sound-off, info, check-mark, prism (lab) |
| guard13007  | play-button, pause-button (music)                                                                                                                                         |

**Artist names.** `scripts/assets/artists.json` is an explicit map from folder to credited
name, and each name must be a verbatim substring of `license.txt`. The mapping is not
mechanical (for example `lucasms` → "Lucas", `heavenly-dog` → "HeavenlyDog", `darkzaitzev` →
"DarkZaitzev"). For the folders used here: `lorc` → "Lorc", `delapouite` → "Delapouite",
`guard13007` → "Guard13007", `viscious-speed` → "Viscious Speed" (CC0, credited anyway).

**Never used:** `badges/` (which also has a `cog.svg`) and `various-artists/`. Neither is listed
in `license.txt`. The build fails on any folder missing from `artists.json`.

**Processing:**
1. Remove `<path d="M0 0h512v512H0z"/>`.
2. Set `fill="currentColor"`.
3. Minify with svgo.
4. Pack into `sprite.svg` as `<symbol>` elements.

The manifest records each transform. Icons are tinted with theme tokens.

### 16.3 Sound effects (CC0, open-game-sfx-index)

- **Selection:** by `index.json` id.
- **Checks** (pipeline, against the source clone):
  - `license === "CC0-1.0"`
  - the source file's sha256 equals the index field for its format: `sha256_ogg` for an `.ogg`
    source, `sha256_wav` for a `.wav` source (the index has one field per format; 23 of the 24
    mapped sources are Ogg and `oga-levelup-powerup_Rise05` is WAV)
- **Allowed packs:** interface-sounds, ui-audio, digital-audio, sci-fi-sounds, music-jingles,
  casino-audio, oga-levelup-powerup, oga-gui-lokif.
- **Processing** (ffmpeg): trim silence, fade out so nothing exceeds 1.5 s, peak-normalize to
  −3 dBFS, write mono 22.05 kHz 16-bit WAV. WAV plays everywhere and has no codec delay.
- **Budget:** ≤ 700 KB total. From the index's `duration_sec`, the 24 mapped sounds total
  13.6 s after the 1.5 s cap, which is about 601 KB as 22.05 kHz 16-bit mono WAV. The pipeline
  computes the projected total from the durations before encoding and fails above the budget.
- **Index metadata.** `index.json` and its titles and tags are MIT-licensed (© Mcamento8). The
  pipeline copies only ids, pack names and durations into `sfx.json`, and the index's MIT
  notice ships in `public/LICENSES/` and in Credits.
- **Playback:** `AudioBufferSourceNode` plus a `GainNode`, after the first user gesture.
- **Limits:**
  - each event has a minimum interval (80 ms by default)
  - at most 8 sounds in any 1 s window, overall (so 50 buys in 1 s play at most 8)
  - muted when the tab is hidden
  - no pitch shifting
  - autobuyers and autosave are silent

| Event                                       | Sound id                                                     |
| ------------------------------------------- | ------------------------------------------------------------ |
| Buy (manual)                                | `ui-audio_click1`                                            |
| Max all                                     | `interface-sounds_maximize_003`                              |
| Can't afford (hotkey; off by default)       | `interface-sounds_error_004`                                 |
| Tier unlocked                               | `digital-audio_twoTone1`                                     |
| Step reached                                | `interface-sounds_tick_002`                                  |
| Product reset                               | `digital-audio_phaserUp3`                                    |
| Power reset                                 | `digital-audio_powerUp7`                                     |
| Tower reset                                 | `oga-levelup-powerup_Rise05` (3.5 s source, trimmed to 1.5 s) |
| Discovery                                   | `interface-sounds_confirmation_002`                          |
| Depth increase                              | `interface-sounds_glass_002`                                 |
| Sequence complete                           | `music-jingles_jingles_PIZZI02`                              |
| Lab: match / no match                       | `digital-audio_twoTone2` / `digital-audio_lowDown`           |
| Challenge start / complete                  | `sci-fi-sounds_forceField_000` / `music-jingles_jingles_NES03` |
| Achievement                                 | `music-jingles_jingles_STEEL04`                              |
| Record advance / exhausted                  | `digital-audio_threeTone1` / `music-jingles_jingles_STEEL07` |
| Tab switch / toggle                         | `interface-sounds_switch_002` / `ui-audio_switch3`           |
| Modal open / close                          | `interface-sounds_open_001` / `interface-sounds_close_001`   |
| Manual save                                 | `interface-sounds_confirmation_001`                          |
| Offline report                              | `interface-sounds_maximize_004`                              |

All ids were verified in `index.json`. The 3.4 s Lokif save sound from the base proposal is
dropped. Each event's sound ships with the milestone that adds the event: M10 maps the events
that exist by then; M12b adds the achievement jingle, M15a the challenge sounds, M18a the Lab
match and no-match sounds, and M22 the Record advance and exhausted sounds.

### 16.4 Music (FreePD via SoundSafari/CC0-1.0-Music)

**Tracks**, each fetched as a single file from the blobless clone. Tags were read with ffprobe
at `655388f9`:

| Track                         | Where it plays   | Tags (artist / title / album)                                     | Length  | Loop track |
| ----------------------------- | ---------------- | ----------------------------------------------------------------- | ------: | ---------- |
| "Bit Bit Loop"                | Sum and Product  | Kevin MacLeod / Bit Bit Loop / Public Domain                      | 76.9 s  | yes        |
| "Beat One"                    | Power            | Kevin MacLeod / Beat One / Free PD                                | 180.1 s | no         |
| "Alternative Clock Dimension" | Challenges       | Kevin MacLeod / Alternative Clock Dimension / Public Domain       | 144.1 s | no         |
| "Infinite Wonder"             | Tower            | Kevin MacLeod / Infinite Wonder / Public Domain                   | 190.1 s | no         |

"Beat One" replaces "Circuit", whose file has no ID3 tags at all.

**Why the tag rule matters.** A scan of `freepd.com/` found that the folder also holds tracks by
other artists, some tagged with a different licence (for example "Parhelion", album
"Complete Discography (CC BY Attribution 4.0)"), and Kevin MacLeod tracks without a title tag
("Blippy Trance", "Deep Tones").

**Pipeline** (`music.mjs`):
1. **Selection scan.** Run ffprobe on each candidate. A track passes only if:
   - its `artist` tag is exactly "Kevin MacLeod" (read from the file, never hard-coded)
   - its `album` tag is one of "Public Domain", "Free PD" or "FreePD Music"
   - no tag contains "CC BY" or "Attribution"
   - it is at most 240 s long (longer tracks fail; they are not trimmed)
   The scan result for every candidate goes into the manifest.
2. **Title.** From the `title` tag. If a passing track has no title tag, the title is the file
   name without `.mp3`, and the manifest records `titleSource: "filename"`; provenance then
   comes from the corpus folder (`freepd.com/`) and its README, also recorded.
3. Trim leading and trailing digital silence only (below −60 dBFS). No fade is applied to any
   track; looping is done by the player.
4. Apply `loudnorm` to −20 LUFS.
5. Encode MP3 mono at 80 kbps (about 0.8–1.9 MB per track, 5.9 MB in total).

**Budget:** ≤ 3 MB per track and ≤ 10 MB in total.

**Playback:**
- off by default
- loaded only when enabled
- **looping:** each track repeats by crossfading its last 1.5 s into its own start, so the MP3
  encoder delay and padding never cause a gap. Loop tracks such as "Bit Bit Loop" get no
  fade-out in the pipeline for the same reason.
- **layer changes:** a 2 s crossfade to the new layer's track
- **hidden tab:** music pauses while hidden and resumes within 1 s of being shown, at the set
  volume, with no second instance playing
- a "Now playing" line shows the title (or the file-name fallback) and the artist

**Credits:** CC0 / public domain; credited anyway.

### 16.5 Fonts and libraries

- **Fonts:** `@fontsource/jetbrains-mono` 5.3.0 (OFL-1.1), pinned exactly. The full OFL text
  ships in `public/LICENSES/OFL-1.1.txt`.
  - **Files:** only the woff2 files for Latin 400, Latin 500, Greek 400 and Greek 500 ship
    (21.2, 21.8, 4.2 and 4.3 KB; about 52 KB in total).
  - **CSS:** `src/ui/fonts.css` declares these four `@font-face` rules itself, each with the
    `unicode-range` copied from the package's `unicode.json`. It does not import the
    package's per-subset CSS files (`latin-400.css` etc.), because in 5.3.0 those carry no
    `unicode-range`, so two of them for the same weight would replace each other. A test
    asserts that the ranges in `fonts.css` equal `unicode.json`.
  - **Coverage:** the Latin range includes U+2191 ↑ and U+2193 ↓, `×`, `·` and `−`; the Greek
    range covers Σ Δ Π ε β λ ρ δ μ π. The glyph test (§2) allows only these plus the fallback
    allowlist `≈ ≤ ≥ ∈ ⌊ ⌋ → ✓`, which renders with the system monospace font
    (`font-family: 'JetBrains Mono', ui-monospace, monospace`).
  - **Dropped:** IBM Plex Mono has no Greek subset, and STIX Two Math has only a Latin subset
    (a 403 KB woff2) whose range excludes Greek and ≈.
- **Libraries:** Preact and break_eternity.js are MIT. Their notices ship in
  `public/LICENSES/`, and the Credits tab lists them.

---

## 17. UI information architecture

### 17.1 Header (always visible)

- x, large
- the rate `+X/s` and the growth `×10^Y /min` (trailing 60 s change in log10 x). Samples with
  x ≤ 0 are skipped (`log10Pos` returns `null`); with fewer than 2 positive samples the readout
  shows `—`.
- layer currencies (P, E, TP) once unlocked
- the **Next goal** chip, a template with a log-scale bar such as "Reach 2^128 · 43%". The
  percentage is (log10Floor1(x) − log10 start) / (log10 goal − log10 start), clamped to 0–100%,
  so x = 0 shows 0%.
- save status, mute and Settings

### 17.2 Tabs

Each tab has an icon and a label. It appears when its condition is first met (the half-cost
rule) and shows a dot badge until visited.

| Tab          | Icon                       | Appears                                         |
| ------------ | -------------------------- | ----------------------------------------------- |
| Sum          | Sum emblem (CC0)           | Start                                           |
| Product      | Product emblem             | x ≥ 2^127                                       |
| Collection   | delapouite/nested-hexagons | First discovery or first Product reset          |
| Automation   | delapouite/robot-grab      | First autobuyer                                 |
| Statistics   | delapouite/histogram       | First Product reset                             |
| Achievements | delapouite/star-formation  | First achievement                               |
| Power        | Power emblem               | x ≥ 2^1023                                      |
| Slots        | Slots emblem (CC0)         | First Power reset                               |
| Challenges   | lorc/moebius-triangle      | First Power reset                               |
| Lab          | delapouite/prism           | Lab upgrade                                     |
| Tower        | Tower emblem               | x ≥ 2^65535                                     |
| Records      | lorc/crystal-growth        | First Record granted                            |
| Settings     | lorc/cog                   | Always. Sub-tabs: Numbers, Display, Audio, Accessibility, Save, Credits |

### 17.3 Generator row

```
[icon] Generator 3 | 145 (140 bought) | step 14 · 0/10 | ×6.4e4 | +1.2e4/s | [Buy 1 · 1e9] [Until 10 · 3.2e13] [Max] ≈ 8s | hold [   ]
```

- The step progress is a log-scale bar. The data horizon is shown as "term 14 of 34".
- **Silhouette:** a tier row is shown dimmed from the moment it is revealed (its resource
  reaches half its cost, §17.4) until its first purchase. Its Buy button shows its cost; it has
  no other label. Before the reveal the row is absent. So a new game shows no G2 row, and the G2
  silhouette appears at x = 50 with "Buy 1 · 100".

### 17.4 Onboarding without text

- A new game shows only the header (x = 10), the Generator 1 row and Settings.
- **Reveal at half price (one rule):** a hidden element fades in when its resource first
  reaches half its cost or threshold, value ≥ threshold/2. For 2^n thresholds that is 2^(n−1):
  Product at 2^127, Power at 2^1023, Tower at 2^65535. Every reveal has a unit test.
- **One highlight at a time:** a pulsing outline marks the cheapest useful action. It stops
  after that action has been done 3 times.
- **Breakdown tooltips** list every factor of a rate, for example:
  ```
  Generator 1 production
    23 owned
    β 2                 ×2
    global 1.15^12      ×5.35
    A000079 a(5)        ×32
    collection          ×1.17
    = 9.2e3 /s
  ```
  The displayed product equals the displayed rate to 1e-9 in log space (unit test).
- **Time-to-afford** on every button: `≈ 12s` or "now".

### 17.5 Notifications

- **Toasts:** top right on desktop, top centre on mobile. At most 3; extra events merge
  ("+5"). Each lasts 4 s and pauses on hover or focus. They show icons and numbers only. M7
  ships a minimal toast (one at a time, 4 s, for discoveries and completions); M12b replaces it
  with this full system through the same `notify(event)` API.
- **Live region:** `aria-live="polite"`, at most one announcement every 2 s.
- **Tab title:** optional, e.g. `1.23e45 · Integer Sequence Idle`.
- **No Notification API.**

### 17.6 Layout

**Desktop (≥ 1024 px):**
- left tab rail
- main panel
- an optional pinned Details panel for the selected card or upgrade

**Mobile (≤ 640 px):**
- sticky compact header and a bottom tab bar (5 tabs plus More)
- generator rows become 2-line cards
- a floating Max all button
- tap targets ≥ 44 px
- tooltips become bottom sheets
- `touch-action: manipulation`, safe-area insets, no horizontal scroll at 375 px

### 17.7 Juice

- **Visuals:**
  - CSS transform and opacity only
  - a short pulse on buy
  - a radial wipe on reset, using the layer emblem as a CSS mask (700 ms)
  - a card flip on discovery
  - the term strip slides on depth increase
- **Limits:** at most 3 flashes per second anywhere (WCAG 2.3.1).
- **Ambient:** generator icons spin at a speed ∝ log10(1 + production), capped at 1 turn per
  4 s.
- **Reduced motion** disables all of this except fades of 150 ms or less.

---

## 18. Accessibility

- **Keyboard:**
  - every control is a native `<button>` or `<input>`
  - tabs follow the WAI-ARIA tablist pattern
  - focus is always visible; modals trap focus and restore it
- **Hotkeys** (`src/ui/hotkeys.ts`). They match on `event.code`, so they do not depend on the
  keyboard layout or on what Shift does to `event.key`:

  | Key (`event.code`)          | Action                          |
  | --------------------------- | ------------------------------- |
  | `Digit1`–`Digit8`           | Buy one of that tier            |
  | Shift + `Digit1`–`Digit8`   | Buy max of that tier            |
  | `KeyM`                      | Max all                         |
  | `KeyG`                      | Global multiplier               |
  | `KeyP` / `KeyW` / `KeyT`    | Product / Power / Tower reset (with confirmation) |
  | `KeyH`                      | Focus hold caps                 |
  | `KeyN`                      | Read out x                      |
  | Shift + `Slash`             | List hotkeys                    |
  | `Escape`                    | Close                           |

  - Ignored when the event target is an `input`, `textarea` or `select`, or is inside a
    `contenteditable` element, so typing "12" into a hold-cap field buys nothing.
  - Ignored when Ctrl, Meta or Alt is held, so browser shortcuts such as Ctrl/Cmd+1 still work.
  - Ignored on `event.repeat` for reset keys.
  - jsdom tests cover each case: input focus, contenteditable, each modifier, Shift+digit on a
    non-US layout (`event.key` = "!" or "&"), and `?`.

- **Screen readers:**
  - numbers have spoken labels
  - live values are not announced continuously
  - buttons have full names, e.g. "Buy Generator 3, costs 1.00 times ten to the 9, affordable"
- **Motion:** Full, Reduced or Off. The default follows `prefers-reduced-motion`.
- **Colour:**
  - Okabe–Ito palette for charts
  - affordability is never shown by colour alone (solid border plus ✓, versus dashed at 70%
    with ≈ time)
  - text contrast ≥ 4.5:1 and UI contrast ≥ 3:1, computed from theme tokens in a unit test
  - themes: dark (default), light, high-contrast
- **Size:** font scale 87.5–150%, in rem units, with layouts that reflow.

---

## 19. Settings (defaults in bold)

| Section       | Settings                                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Numbers       | Notation (**Scientific**); precision 0–4 (**2**); integer threshold (**1e6**)                                                                     |
| Display       | Theme (**dark**); font scale (**100%**); UI fps (**30**); points in tab title (**off**)                                                           |
| Audio         | Effects (**on, 50%**); music (**off, 40%**, from M20); mute in background (**on**); error sounds (**off**)                                        |
| Accessibility | Motion (**system**); hotkeys (**on**); tooltip delay (**300 ms**); onboarding highlight (**on**)                                                  |
| Save          | Autosave interval (**15 s**); offline progress (**on**); offline resets (**off**); reset confirmations (**on**); include settings in exports (**off**) |
| Credits       | Generated from the manifest (§16); OEIS entries read from `oeis.json` at runtime                                                                  |

**Save panel** (`src/ui/settings/SavePanel.tsx`), all labels from `strings.ts`:
- **Save now**, which writes immediately and plays the manual-save sound.
- **Export**: as text, with **Copy** (uses the Clipboard API; if that is blocked, as it can be
  in an Artifact iframe, the text box is focused with all text selected so the player can copy
  it by hand), or as a `.txt` download.
- **Import**: paste text, or **Import from file** (`<input type="file">`, `.txt`).
- **Restore backup**: shows the backup's timestamp; restoring asks for confirmation.
- **Download quarantine**: shown only when `isi.save.quarantine` holds a blob; downloads it
  as-is.
- **Hard reset** (type "RESET"): clears slots a and b, the backup, the quarantine, the chart
  samples and `meta`, and keeps settings. A later failed load therefore cannot bring back
  pre-reset progress from the backup. A test asserts exactly these keys are removed.

**Settings storage.** `isi.settings` holds `{ "settingsVersion": n, "values": { … } }`.
- Each field is validated on load: a missing or invalid field gets its default; unknown keys
  are dropped.
- Settings migrations work like save migrations, with one frozen fixture per settings version
  in `tests/fixtures/settings/`. Milestones that add settings (M3, M5, M10, M12b, M16, M20) add
  a settings version and its fixture.
- With "include settings in exports" on, the export envelope carries the settings object;
  importing it asks whether to apply them.

---

## 20. Save model and offline progress

### 20.1 Saves (`src/engine/save/`, `src/platform/storage.ts`)

**Envelope:**

```json
{ "format": 1, "saveVersion": 1, "gameVersion": "0.x.y", "savedAt": 0, "maxSeenAt": 0, "dataHash": "…", "state": {} }
```

- `Num` values are stored as `[sign, layer, mag]`.
- Ids are stable strings, never array indices. Discoveries, depths, hints, slots, Records and
  Lab pairs are keyed by A-number.
- `savedAt` never decreases, and `maxSeenAt` = max(previous `maxSeenAt`, now) at every save
  (§20.2).

**Storage keys:**

| Key                  | Holds                                                                  |
| -------------------- | ---------------------------------------------------------------------- |
| `isi.save.a`, `isi.save.b` | Two save slots                                                   |
| `isi.save.meta`      | `{active, seq, owner}`; `owner` is the id of the tab allowed to save   |
| `isi.save.bak`       | Hourly backup                                                          |
| `isi.save.quarantine`| A save that failed to load. It is kept until the player downloads or hard-resets it. |
| `isi.stats.samples`  | Chart samples (§13), written every 60 s and on hide, not in the save   |
| `isi.settings`       | Settings, separate so a bad save never takes them with it              |

- **Write sequence:** check the engine invariant, write to the inactive slot, read it back,
  verify its CRC, then flip `meta`.
- **Engine invariant** (`checkInvariants(state)`, in production): every `Num` passes
  `isValidNum` (finite and ≥ 0), every count is an integer ≤ 2^53, every id is known. It runs
  before every save. If it fails, the save is refused, autosave stops, the last good save stays
  untouched, and the recovery panel opens (§21.8).
- **Wrapping:** every storage call is in try/catch.
- **Quota:** a `QuotaExceededError` on write leaves the previous slot active, shows the storage
  banner with Export, and retries at the next autosave. A test uses a fake storage that throws
  it above a byte limit.
- **Fallback:** if storage is unavailable (a private window, or some Artifact contexts), the
  game runs in memory and shows a banner with an Export button.
- **Size budget:** the save JSON is at most 64 KB, tested on a late-game fixture (all layers,
  170 sequences, a full Lab history). Chart samples are kept out of it, and the Lab history
  stores tried pairs as `operator:A-number` ids only; results are recomputed on demand.

**Load order:** active slot, then the other slot, then the backup, then a new game. A blob that
fails to parse, fails its CRC or fails `validate()` goes to quarantine, and the loader tries the
next source. Whenever a load falls back past the active slot, a banner says so and offers
Restore backup and Download quarantine. Progress is never lost silently.

**Rules:**
- `validate(state)` never throws and never repairs. It returns the list of problems. Any NaN,
  infinite, negative or wrong-typed field, or a missing field, makes the blob invalid. (New
  fields come with defaults through migrations, never through `validate()`.)
- A save from a **newer** version is refused, autosave is switched off, and the player is asked
  to export.
- **Data version mismatch.** A save whose `dataHash` differs from the loaded data is accepted
  and adapted (§21.5).

**Migrations:**
- `migrations[i]` converts version i+1 to version i+2.
- One frozen fixture per shipped version: `tests/fixtures/saves/vN.json`.
- Tests: `migrations.length === CURRENT − 1`, and every fixture migrates and validates.
- Every milestone that changes state adds a version and a fixture.

**Autosave:** every 15 s, on `visibilitychange` (hidden) and on `pagehide`. It is silent.

**Export:**
- Format: `ISI1:` + base64url(deflate-raw(JSON)) + `:` + crc32, using `CompressionStream`.
  Without it, the fallback is `ISI1u:` (uncompressed).
- Available as text or as a `.txt` download.

**One active tab** (`src/platform/tablock.ts`). Two open tabs must not both tick and save:
one could overwrite the other's progress, and both together would double progress.
- On start, a tab generates an id and announces `{hello, id, startedAt}` on a
  `BroadcastChannel('isi')`. Without BroadcastChannel it uses `storage` events on
  `isi.save.meta`.
- The newest tab owns ticking and saving and writes its id as `meta.owner`. A tab that sees a
  newer hello stops its loop and autosave without saving and shows a chrome banner ("Open in
  another tab") with a "Use here" button that reclaims ownership.
- Before every write, a tab re-reads `meta.owner` and writes only if it is the owner, so the
  lock holds even if a message is lost.
- Test: two jsdom instances sharing one fake storage and a fake BroadcastChannel; only the
  newer one advances and saves, and "Use here" flips ownership.

### 20.2 Offline progress (`src/engine/offline.ts`)

`advance(state, seconds, schedule?)` handles every case. `schedule` is an optional list of
actions at fixed times (used by tests); macro-steps are split at those times.

**Credited time.** The credit is max(0, now − `maxSeenAt`), not now − `savedAt`, then capped.
Setting the clock back gives 0 and leaves `maxSeenAt` where it was, so moving the clock forward
again earns nothing until real time passes the highest time ever seen. Test: a scripted clock
of +24 h, back to the start, +24 h again credits 24 h in total, not 48 h.

| Credited time              | Handling                                            |
| -------------------------- | --------------------------------------------------- |
| 0                          | Nothing                                             |
| ≤ 1 s                      | Fine 50 ms ticks                                    |
| Above the cap              | Capped (24 h, 72 h or 7 days)                       |
| Otherwise                  | At most 2,000 macro-steps (below)                   |

**Macro-step schedule** (exact; `docs/prototypes/macro_steps.py`). For credited time Δ:
- N = min(2000, ⌈Δ / 0.05 s⌉).
- If N · 0.05 s ≥ Δ, there are N equal steps of Δ/N.
- Otherwise step i (i = 0 … N−1) is min(0.05 s · 1.01^i, h_max), where h_max is found by
  bisection so the steps sum to Δ; the last step absorbs the rounding residual.
- Resulting maximum step: 2.1 s at 1 h, 19 s at 8 h, 62 s at 24 h, 205 s at 72 h, 516 s at
  7 days. A test checks N ≤ 2000, the sum, and these maxima.

**At every boundary:**
- Autobuyers fire with offline semantics (below), including discovery sweeps.
- The exact integrator advances the chain; state-dependent effects use the boundary's values
  (§5.5).
- Resets happen offline only if the "offline resets" setting is on.

**Offline autobuyer semantics** (shared code with online; the boundary's step length is Δ_b):
- **Max mode** (from M5): buys max at each boundary, respecting hold caps.
- **Single mode** (from M11): buys min(⌊(carry + Δ_b)/interval⌋, affordable, hold-cap room)
  purchases, and keeps the remainder (carry + Δ_b) mod interval as the next carry. A 0.05 s
  autobuyer therefore makes about 1,240 purchases over a 62 s step instead of 1.
- **Target mode** (from M11): as max mode, but up to the target vector.
- **Reset autobuyers and the prestige-loop credit** (from M11). Let meanCycle and meanGain be
  the mean duration and gain of the last 10 completed cycles before going offline (fewer if
  fewer exist; with none, the autobuyer only fires at boundaries where its trigger holds), and
  peakRate the best gain per second among them. If a step is shorter than meanCycle, the
  autobuyer fires normally when its trigger holds at the boundary. Otherwise it is credited
  k = ⌊Δ_b / meanCycle⌋ cycles: credit = min(k · meanGain, peakRate · Δ_b), added to the
  currency at that boundary. The credit is recomputed at every boundary from the current state,
  so the credited P raises Pb for the following steps. The Statistics tab shows meanGain and
  peakRate.

**Runner.** Works in time slices of ≤ 8 ms, behind a progress modal, then shows a "While away"
summary (before and after values).

**Budgets** (`npm run bench`, Node, not part of `npm run check`):
- 24 h without autobuyers ≤ 300 ms (M4).
- 24 h with every autobuyer firing at every boundary ≤ 1 s (M11). At about 0.45 µs per `Num`
  operation, 2,000 steps of up to ~1,000 operations is ~0.9 s.
- The benchmark reports `Num` operations per macro-step from the op counter (§4.1).

---

## 21. Architecture

### 21.1 Layout

```
src/engine/            pure TypeScript: no DOM, no clock, no Math.random; erasable syntax only; relative imports end in .ts
  num.ts format.ts state.ts actions.ts tick.ts integrate.ts effects.ts offline.ts transforms.ts invariants.ts
  content/             data tables with stable string ids: sum, product, power, challenges, tower, records, achievements, knobs
  systems/             sum product discovery collection slots lab power exponent challenges tower records autobuyers achievements stats
  data/                oeis.ts (typed loader), windows.ts (window index + projection maps), log2dec.ts
  save/                codec envelope migrations validate
src/sim/               bot strategies, fixpoint calculator, pacing metrics (pure; Node-runnable)
src/platform/          storage, tablock, loop (rAF), clock, audio (sample playback), music, visibility, data (fetch oeis.json), errors, devhooks
src/ui/                Preact components; strings.ts; legal.ts; fonts.css; theme tokens; reveal.ts; goals.ts; hotkeys.ts; Recovery.tsx
src/data/generated/    icon manifest, sfx manifest, data-manifest.json, credits.json (icons, sfx, music, fonts, libraries only; MIT/CC0; never OEIS fields)
public/assets/         icons/sprite.svg, sfx/*.wav, music/*.mp3, data/oeis.json + LICENSE-OEIS.txt
public/LICENSES/       CC-BY-SA-4.0.txt, CC-BY-3.0.txt, OFL-1.1.txt, MIT notices (Preact, break_eternity.js, open-game-sfx-index)
scripts/assets/        sources.json, artists.json, lib/git.mjs, oeis.mjs, icons.mjs, sfx.mjs, music.mjs, credits.mjs, build-assets.mjs, manifest.json
scripts/sim/ scripts/ci/ scripts/deploy/ scripts/dev/playtest.mjs scripts/bench/
balance/targets.json   docs/balance/*.md   docs/balance/window-heights.json   docs/adr/*.md   docs/prototypes/
tests/unit tests/arch tests/assets tests/ui tests/sim tests/fixtures (saves, settings, data, dev)
```

**Generated files and formatting.** Pipeline and sim outputs outside `public/assets` and
`src/data/generated` (`scripts/assets/manifest.json`, `docs/balance/window-heights.json`,
`tests/fixtures/settings/*.json`, `tests/fixtures/saves/*.json`) are added to
`.prettierignore` by the milestone that first writes them (M3 for settings fixtures, M4 for save
fixtures, M6a for the manifest, M6b for the height report), so
`prettier --check .` never fails on them and a second `npm run assets` gives no diff.
`sim-output/` is added to `.gitignore` in M2.

### 21.2 Determinism and the action queue

- **Fixed timestep:** dt = 50 ms (20 TPS). `tick(state, actions)` applies the actions and
  advances 50 ms; `advance(state, seconds, schedule?)` covers longer spans. Both are pure, both
  call `integrate(state, Δ)`, and nothing else changes game state.
  - Order inside `tick`: if there are actions, flush the pending time (an event flush, §5.5) and
    apply them; then add 50 ms to the pending time and flush once 1 s is pending. A purchase
    therefore produces during the tick it was made in. If no action changes the state, the
    flush is discarded (§5.5: only a change is an event).
  - `step(state, actions, seconds)` = flush, apply, then `integrate(seconds)` exactly: the bot's
    1 s exact steps (§22.6), from M2 on (before `advance()` exists).
  - `addTime(state, ms)` adds time that does not fit into whole ticks to the pending time
    (§21.4).
- **Actions:** the UI, hotkeys, autobuyers and the bot all send serializable actions, such as
  `{type: 'buy', tier: 3, mode: 'max'}`. They are applied at the next tick boundary.
- **Replay:** action logs can be replayed. Two runs with the same actions produce byte-identical
  saves (a test checks this).
- **No randomness:** the engine has none. `src/sim/rng.ts` (sfc32) is used only by bots and fuzz
  tests.

### 21.3 Effects pipeline

- Content declares effects as data: `{id, target, kind: 'mul' | 'pow' | 'add', class:
  'event' | 'state', value(state, tier), label, templateId?}`. `label` is the `strings.ts` key of
  the effect's breakdown row. `templateId` points at the Appendix C string and is present only on
  upgrades, milestones, challenge rules, rewards and achievements: the Sum base factors (β, g^L,
  slot_k) are not Appendix C content and carry a `label` only, so the templates test (M3) covers
  content that has a `templateId`.
- `labelParams(state, tier)` fills the label's `{placeholders}` from the same state as `value`
  (for slot_k, `{a} a({i})`: the curve's A-number and the term used, `A000079 a(5)`), and the
  evaluated factor carries them as `params`. A breakdown row therefore needs nothing outside the
  table, and from M14 the A-number follows the equipped sequence.
- Every event that changes what event-constant effects read goes through `withSum` (or a
  later layer's equivalent), which marks the table dirty; a test replays random action logs and
  checks after every tick and action that a cached table equals a fresh rebuild.
- **Fold order**, per tier: m = ((1 + Σ add) · Π mul) ^ (Π pow), every factor taken in content
  order, so the result is deterministic.
- `effects.ts` folds them into a cached multiplier table.
  - **Event-constant** effects (`class: 'event'`) are rebuilt when a dirty flag is set
    (purchase, reset, unlock, upgrade, loadout).
  - **State-dependent** effects (`class: 'state'`: the 610-P factor, Pb while passive P is on,
    and ε; §5.5) are re-evaluated at the start of every integration step and held for that
    step. That is the only refresh rule; online steps are at most 1 s apart (except while
    sub-resolution growth is deferred, §5.5).
  - Tables record the content version they were built for. The test-only hook
    `installTestEffect` (§21.8) adds an effect and bumps the version, so cached tables are
    rebuilt.
- Breakdown tooltips read the same table, so what is shown is what is computed.

### 21.4 UI loop

- **Frames:** `requestAnimationFrame` feeds an accumulator. It runs at most 40 fine ticks per
  frame. Any remaining time is added to the pending integration time (§5.5) and integrated
  exactly by `integrate()`, so a slow frame never drops time. Gaps longer than 60 s (a suspended
  laptop, a hidden tab) go through `advance()`.
  - "Remaining time" is the time beyond 40 ticks; it goes to the pending time (`addTime`) and is
    integrated lazily and exactly. The fraction below 50 ms stays in the accumulator.
  - Until `advance()` exists (M4), a gap is one forced exact `integrate` of the whole gap. That
    is exact in M2, which has no state-dependent effects.
  - The view is derived from the state inside the safe wrapper (§21.8) at most at the UI fps
    (30 by default; the setting comes with M3), and the loop keeps the last good view.
- **Hidden tabs** catch up through the same path when shown again.
- **Errors:** every call into the engine goes through `safeTick` (§21.8).
- **Rendering:** Preact re-renders at most at the UI fps setting, from a version counter.
  Formatted number strings are memoized per row: each rendered number formats again only when
  its value changes (compared by sign, layer and mag). The Sum tab's columns have fixed
  widths, so buttons never move sideways as numbers grow.
- **Threading:** the engine stays on the main thread. Its API is free of the environment, so it
  could move to a Worker if profiling ever demands it.

### 21.5 Data loading

- **Fetch:** `src/platform/data.ts` fetches
  `import.meta.env.BASE_URL + 'assets/data/oeis.json?h=' + DATA_HASH`. `DATA_HASH` is injected
  at build time from `src/data/generated/data-manifest.json`, so a redeploy changes the URL and
  a cached old file is never paired with new code. This works under a sub-path and in
  Artifacts.
- **Validation:** the payload's `dataHash` must equal `DATA_HASH`. On a mismatch the loader
  retries once with `cache: 'reload'`, then shows the failure state.
- **Failure:** the Collection shows an "unavailable" state with Retry, and discovery stays off.
  Sum and Product keep working, with full production: every slot falls back to the
  code-computed default curve (§5.2), and equipped sequences count as empty until the data
  loads. A jsdom test covers this from M6b, and runs again with slots equipped from M14 on.
- **Save data from another data version.** When a save's `dataHash` differs from the loaded
  data (after an update such as M18b's changes or the backlog's growth to 300 sequences):
  - discoveries are keyed by A-number and kept
  - depth is clamped to the new W_S − 1, and δ is recomputed
  - A-numbers missing from the new data are kept in the save but are inert (no Coll factor, not
    shown), so they come back if a later data version restores them
  - hints follow §6.6; slots holding a missing or no-longer-eligible sequence become empty
    (staged); Record indices are clamped to N_R; Lab pairs are kept by id
  - the save's `dataHash` is updated at the next save
  - a migration test loads a fixture against an altered data fixture
    (`tests/fixtures/data/altered-oeis.json`: one entry removed, one window removed, one term
    count changed)
- **No `file://`:** the game is served by any static server.

### 21.6 Node interop

- Node 22.22 strips types by default. Engine modules use explicit `.ts` imports and
  `erasableSyntaxOnly`, so the asset pipeline and the sim CLI import the same code directly
  (`windows.ts`, `transforms.ts`, `integrate.ts`).
- tsconfig sets `allowImportingTsExtensions` and `erasableSyntaxOnly`, plus
  `verbatimModuleSyntax` (Node's type stripping keeps an `import { T }` of a type and fails at
  run time with "does not provide an export named 'T'", so type-only imports must say
  `import type`) and `noEmit` (which `allowImportingTsExtensions` requires).
  `tests/arch/node-import.test.ts` checks the whole path with a plain `node`.
- `tsconfig.engine.json` typechecks `src/engine` and, from M2, `src/sim` with lib
  ES2023 and no DOM, Node or Vite types, as part of `npm run typecheck`. The engine-purity,
  import and `.ts`-extension scans (§2) cover `src/sim` too, since `Math.random` is not a type
  error; `src/sim` may import `src/engine`, never the reverse. Any environment access
  (`self`, `Buffer`, `location`, `import.meta.env`, `console`, timers) is then a compile error,
  not only a lint finding.

### 21.7 Performance budgets

Measured by `npm run bench` (§22.12), never asserted in `npm run check`.

| Budget                       | Limit                                                    |
| ---------------------------- | -------------------------------------------------------- |
| Late-game tick               | p50 ≤ 0.3 ms, p99 ≤ 1 ms in Node; ≤ 2 ms in the browser   |
| Num operations per tick      | ≤ 400                                                    |
| Offline 24 h                 | ≤ 300 ms without autobuyers; ≤ 1 s with autobuyers       |
| Discovery sweep              | ≤ 0.05 ms                                                |
| Nearness meter               | ≤ 4 ms at 4 Hz                                           |

### 21.8 Errors and recovery (`src/platform/errors.ts`, `src/ui/Recovery.tsx`)

- **Per-tab error boundary.** Each tab panel is wrapped in a Preact error boundary. A render
  error replaces only that panel with the recovery panel; the engine keeps running.
- **`safeTick`.** Every `tick`, `advance` and `integrate` call from the platform is wrapped. On
  an exception, or when `checkInvariants` fails after a step, the loop pauses, autosave stops,
  and the recovery panel opens.
- **Recovery panel** (labels from `strings.ts`): Export current (the in-memory state, marked
  unverified), Export last good (the last saved blob, byte for byte), Reload.
- **Global handlers:** `window.onerror` and `unhandledrejection` open the same panel. They are
  installed with `addEventListener('error' | 'unhandledrejection')`, so other listeners keep
  working.
- **Pause:** a fault stops the loop for good: no further frames, enqueued actions are ignored,
  and the last good state and view are kept (for M4's Export current). The view is checked too:
  a NaN in a derived value is an invariant fault, so the UI never renders one. The check walks
  the whole view (`checkValues`: every `Num` and number), so new view fields are covered
  without a list. The paused screen disables every game control and moves the focus to the
  panel's Reload, so the panel is the only thing the player can act on.
- **Never persist a bad state:** the invariant check before every save (§20.1) refuses an
  invalid state and keeps the last good save.
- **Test:** a test-only content hook injects an effect that throws, and another that returns
  NaN. In both cases the loop pauses, no save is written, the panel shows, and "Export last
  good" equals the stored save.

### 21.9 Development hooks (`src/platform/devhooks.ts`)

- `?fixture=<name>&speed=<n>` loads a committed save from `tests/fixtures/dev/<name>.json` and
  runs the game clock n times faster (1–1000).
- The hook exists only when `import.meta.env.DEV` is true or the build sets
  `VITE_DEV_HOOKS=1` (`npm run build:playtest`, which writes `dist-playtest/`). The production
  `dist/` never contains it; a test greps `dist/` for the hook's marker string.
- Playtests that need late-game state (screenshots, axe runs of late tabs, the keyboard-only
  run to the first Product reset) load fixtures through this hook.

---

## 22. Testing strategy

**Where tests run.**
- `npm run check` (local and CI): typecheck, unit, property, architecture, check-time asset,
  UI and quick sim tests, and `prettier --check`. It contains **no wall-clock assertions**:
  every timing budget lives in `npm run bench`.
- `npm run bench`: the benchmarks of §21.7, run as their own CI job with ×3 guards.
- Nightly: long sims, 50 ms reference sims, 100k save fuzz, and the source-backed asset tests.

**Timeouts.** Vitest's default 5 s timeout stays for ordinary tests. Every sim or long test
sets an explicit timeout (for example `{ timeout: 120_000 }`), and no test asserts how long it
took.

1. **Unit tests (Vitest)** for every system module, every upgrade, every challenge rule and
   every formula reference value in this document.
2. **Property tests (fast-check):**
   - the codec round-trips exactly at layers 0–3
   - arithmetic identities hold within tolerance
   - `format` never returns a forbidden token, meets the width table of §4.2 (with its listed
     boundary fixtures) and is weakly monotone after parsing back (§4.2)
   - every log-based function (`log10Pos`, `log10Floor1`, the growth readout, the goal
     percentage, P_gain, the 610-P factor) is finite and in range for inputs that include 0,
     1e-400 and values in (0, 1)
   - buy-max equals iterated single buys (allowing a difference of 1 only when the total cost is
     within 1e-12 relative of x), never overspends and never leaves x negative, below and above
     the governor thresholds
   - for **event-constant effects**, the integrator gives the same result as one step or 64
     smaller ones (1e-9 relative); state-dependent effects are covered by the bounded-error
     test of §5.5
   - prices are monotone
   - save/load is idempotent
   - discovery sweeps equal stepwise single-buy checks
3. **Architecture and asset-rule tests** (§2), each proven against a planted fixture.
4. **Data tests:**
   - parsed term counts (A000045 41, A000079 35, A000142 23, A000005 104, A000040 58)
   - %N byte-identical for 10 sampled entries (nightly, against the source)
   - email/quote filters (check) and exact substrings (nightly)
   - window rule conformance, Records excluded
   - signature windows
   - Record costs: integers in the data, 5,247 in total
   - `log2Dec` on a 400-digit term
   - π(n) and palindrome code equal A000720 and A002113 on their listed ranges
   - transform table = runtime transforms
   - reachability of every curated sequence; the lift and v1 reachability tests (§6.2)
5. **UI tests** (jsdom with `@testing-library/preact`; audio, storage and rAF mocked):
   - render, buy and hotkeys (including input focus, contenteditable and modifiers, §18)
   - reveal rules and the next goal
   - breakdown product = rate
   - import errors and the storage-fallback banner
   - the one-active-tab lock (two jsdom instances, §20.1)
   - the recovery panel with an injected throwing effect (§21.8)
   - Credits matches the manifest, and its OEIS section comes from `oeis.json`
6. **Bot pacing simulation** (`src/sim`, CLI `npm run sim`):
   - **Profiles:**

     | Profile   | Behaviour                                                                                                                                                                                                 |
     | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
     | `active`  | Acts every 1 s. Greedy (the `sim2.py` rule that the §5.5 and §15 reference numbers come from: buy the highest affordable tier, searching G8 down to G1, and a global level instead when it costs less than 3× that tier's purchase or no tier is affordable; repeat until nothing is affordable). Resets near peak gain per minute. Pursues the nearest affordable undiscovered window with hold caps; it may read the window index, modelling a player who uses hints and outside lookup. |
     | `idle`    | Every 15 min, runs the active policy for 10 s. Between check-ins only owned autobuyers act.                                                                                                              |
     | `regular` | Per day: two 45-min active sessions, six 2-min checks, the rest offline through `advance()`.                                                                                                              |

   - **Mechanics:**
     - drives the engine only through actions
     - uses 1 s exact steps while active (lazy integration, §5.5)
     - runs with seeds 1–5, which vary reaction delays (and tie-breaks once a policy has exact
       ties): after a round with purchases the bot waits a seeded 0–2 extra seconds before it
       acts again, still on the 1 s grid. The M2 policy has no exact ties: a global level costs
       10^(2+L), and 3× a tier price 10^(e/10) is never a power of ten
     - "G<k> at t" is the time of the tier's first purchase
   - **Outputs:** `sim-output/report.{json,md}` (gitignored), with an event timeline and
     metrics: the longest gap between meaningful events (counted from the start of the run and
     up to its end, so a stall after the last event is not hidden; the trailing stretch is also
     reported on its own), dead-zone minutes, and the fixpoint slope. Milestones commit the parts they need as `docs/balance/M<n>.md`.
   - **Gating:**
     - `balance/targets.json` holds the bands from §15, each with the milestone it blocks.
       Every blocking band must hold for seeds 1–3 (nightly: 1–5).
     - Quick checks (to the first Product reset, seeds 1–3) run in `npm run check` with an
       explicit timeout.
     - Long runs (`npm run sim:long`) are committed as `docs/balance/M<n>.md` reports.
7. **Reference simulations.** Unit tests compare offline `advance()` with the bot's 1 s exact
   steps run through the same events, never with 50 ms ticks (8 h of 50 ms ticks is 576,000
   full ticks, 20–90 s of test time). The 50 ms references run nightly. Reference tests give the
   offline run scripted events (purchases at fixed times through `schedule`, §20.2), so the
   comparison exercises step splitting and changing multipliers.
8. **Fixpoint tests:** for 5 fixture states, the calculator's X* is within 25% of the bot's
   stall level (§14.2). ε·s < 0.97 is asserted for post-lift states above L0 only; pre-lift
   slopes are reported.
9. **Determinism:** the same action log gives the same save bytes. Offline 1 h is within 0.5%
   of log10 x of the 1 s reference (check) and of the 50 ms reference (nightly).
10. **Save fuzz:** 10k byte flips and truncations in check, 100k nightly. Loading never throws,
    and an invalid blob always ends in quarantine with the next source loaded.
11. **End-to-end** (`scripts/dev/playtest.mjs`, Playwright 1.56.1 pinned as a devDependency;
    required in every milestone's review):
    - zero console errors
    - only same-origin requests
    - no music fetch until enabled
    - no horizontal scroll at 375 px
    - screenshots at 375×667 and 1280×800
    - axe-core with no serious or critical issues (from M16)
    - late-game screens are reached by loading fixtures through the dev hook (§21.9) in the
      `dist-playtest/` build
12. **Performance benchmarks** (`npm run bench`) for the budgets in §21.7, with ×3 CI guards,
    reporting `Num` operations per tick and per macro-step.

**"Playable"**, as used in every milestone's acceptance list, means a scripted playtest of the
built game: click Buy on Generator 1, x rises over the next 5 s, and there are 0 console
errors.

---

## 23. CI and deployment

| Workflow                  | From | Runs                                                                                                                                                   |
| ------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ci.yml` (push, PR)       | M1   | Node 22: `npm ci`, `npm run check`, `npm run build`, plus a step that runs the format tests under `LANG=de_DE.UTF-8` (from M1). M9 adds `check-size`, `verify-manifest`, the quick sim and a separate `bench` job with ×3 guards |
| `e2e.yml`                 | M9   | `npx playwright install --with-deps chromium` (CI only), then the Playwright playtest; uploads screenshots                                            |
| `nightly.yml` (cron)      | M9   | Long sims (3 profiles × 5 seeds, 30 days), 50 ms reference sims, 100k save fuzz, asset re-extraction from fresh blobless clones of the pinned sources with every `ASSET_SRC_<NAME>` set (so the source-backed tests run), then `git diff --exit-code` |
| `pages.yml`               | M9   | On push to `claude/idle-game-dev-oq3ded` or manual dispatch: build, `upload-pages-artifact`, `deploy-pages`                                         |

**Playwright.** `playwright` is pinned to 1.56.1 as a devDependency, which matches the
preinstalled browsers here (`/opt/pw-browsers`, chromium-1194). Locally,
`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` and `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` stay set,
so installing the devDependency never downloads browsers and never breaks local runs. Only CI
runs `npx playwright install chromium`.

**Pages.** All work goes to `claude/idle-game-dev-oq3ded`, the only branch on origin, so
`pages.yml` triggers on that branch (plus `workflow_dispatch`), not on `main`. The repository
owner must, once:
- set Settings → Pages → Source to "GitHub Actions", and
- allow the working branch in Settings → Environments → `github-pages` → Deployment branches,
  because the environment otherwise only accepts deployments from the default branch.
`docs/DEPLOY.md` records these steps. If the deployment cannot be verified (the URL does not
return 200), `docs/DEPLOY.md` records the blocker.

**Asset outputs are committed:**
- `public/assets/**`
- `src/data/generated/**`
- `scripts/assets/manifest.json` (with source hashes and `verified: true`, §2)

CI never needs the source clones or the 40 GB music corpus. Check-time asset tests verify the
committed outputs against the manifest. `ASSET_SRC_<NAME>` environment variables point the
pipeline, and the source-backed tests, at local clones.

**Budgets** (`budget.json`, enforced by `scripts/ci/check-size.mjs`):

| Item                         | Budget                          |
| ---------------------------- | ------------------------------- |
| JS                           | ≤ 150 KB gzip (≤ 120 KB at M3)  |
| CSS                          | ≤ 30 KB                         |
| Fonts                        | ≤ 150 KB, counting every emitted `.woff` and `.woff2` |
| Sprite                       | ≤ 150 KB                        |
| `oeis.json`                  | ≤ 400 KB                        |
| SFX                          | ≤ 700 KB                        |
| Music                        | ≤ 3 MB per track, ≤ 10 MB total |
| First load without music     | ≤ 1.5 MB                        |
| `dist/`                      | ≤ 13 MB and < 100 files         |

**claude.ai Artifact.**
- `scripts/deploy/artifact-files.mjs` turns `dist/` (built with `base: './'`) into a multi-file
  `files` map.
- Music and `oeis.json` stay separate files; nothing is inlined.
- It asserts: page ≤ 16 MB, each file ≤ 15 MB, total ≤ 64 MB, ≤ 255 files.

**Fallback.** The push token may lack the `workflow` scope. If so, the workflows live in
`docs/ci/workflows/`, `npm run ci` reproduces the CI pipeline locally, and the milestone notes
record it. From M1 on, `npm run ci` exists either way.

---

## 24. Risks and mitigations

| Risk                                                           | Mitigation                                                                                                                       |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Late-game balance (lift → 2↑↑5 → heights)                      | Governor design (§8.8), fixpoint calculator, knob table with ranges, wide blocking bands only up to the first Tower, report-only after |
| Discovery feels like friction before automation                | Free hold caps from the start, nearness meter, hints, target mode at 377 P, climb mode at 10 Power resets                        |
| Lab brute force                                                | Charges; each new pair costs 1 whether or not it matches                                                                         |
| OEIS licensing (share-alike, third-party quotes, emails)       | Separate BY-SA file, licence sidecar, exact-substring tests, quote and email filters, allow/deny list, per-entry credit, non-affiliation line |
| Icon licensing                                                 | `artists.json` checked against `license.txt`; build fails on unlisted folders                                                    |
| Asset-rule drift (flavour text, synthesized sound)             | String lint, JSX literal scan, audio API ban, manifest-for-every-file test                                                       |
| Save corruption across many schema versions                    | A/B slots, quarantine, frozen fixtures per version, a `validate()` that never throws and never repairs, visible fallback banner |
| Offline drift                                                  | One exact integrator; lazy online integration; bulk offline autobuyers; prestige-loop credit tested against the 1 s reference (50 ms nightly) |
| Workflow push rejected                                         | `docs/ci/workflows/` fallback plus `npm run ci`                                                                                  |
| Slow blobless fetches                                          | Batched sparse checkouts; committed outputs                                                                                      |
| NaN from log10(0) and other invalid numbers                    | `log10Pos`/`log10Floor1`, `subClamp`, property tests at 0 and 1e-400, the production invariant before every save, the recovery panel |
| Floating-point thresholds (gains, Record costs)               | `floorGain` with exact `Num` comparisons; integer Record costs from BigInt in the data                                           |
| Two tabs, clock rollback                                       | One-active-tab lock; offline credit from `maxSeenAt`                                                                            |
| Blocking bands that cannot be met                              | Pre-Power knobs, per-milestone band lists, and the escalation rule of §14.3                                                      |
| Stale data after a redeploy                                    | `oeis.json?h=<dataHash>`, and the data-version rule of §21.5                                                                     |

---

## Appendix A — Seed sequence pool (all verified to exist at `25716378`)

The groupings are where each sequence was first considered. The pipeline recomputes roles from
the data.

| Group                       | A-numbers                                                                                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Polynomial                  | A000027 A001477 A005408 A005843 A000290 A000578 A000217 A000292 A000330 A000326 A000384 A002378 A000124 A000127 A001844 A003215 A000201 A001950               |
| Number theory               | A000040 A002808 A001358 A000961 A005117 A001097 A002113 A000069 A001969 A005101 A000720 A000005 A000010 A000203 A006530 A001223                                 |
| Exponential                 | A000079 A000244 A000225 A000045 A000032 A000071 A000129 A000073 A001045 A000931 A000930 A001608 A000031 A001037 A003418                                         |
| Combinatorial               | A000108 A014137 A001006 A001003 A006318 A001764 A005043 A000957 A000984 A007317 A000041 A000009 A000081 A000055 A000085                                         |
| Super-exponential           | A000142 A000166 A001147 A002110 A000110 A000111 A000670 A000262 A000312 A006125                                                                                 |
| Erratic                     | A006577 A006877 A005132 A005185 A004001 A002487 A001462 A007318 A008277                                                                                         |
| Bounded, digits, route-only | A000012 A000035 A010060 A000002 A003849 A010051 A008683 A001511 A000120 A001221 A001222 A000796 A001113 A001622 A002193 A001620 A002117 A002162                 |
| Short data                  | A060843 A028444 A046859 A000372 A000058 A003095 A000215 A000668 A000043 A000396 A000001 A000088 A000112 A000798 A006966 A000170 A005130 A006880 A005150         |

**Additions to reach 150+.** Candidates: A000123 A000594 A001055 A001190 A001654 A002385 A002620
A005100 A007088 A000014 A000007, plus `core`/`nice` entries in `seq/A000`–`A002` that pass the
filters.

**Dropped** for lacking quotable comments: A000959, A007053, A000004, A033478.

## Appendix B — Reference numbers (checked locally)

**Listed term counts:**

| Sequence | Terms |
| -------- | ----: |
| A000079  | 35  |
| A000045  | 41  |
| A000142  | 23  |
| A000027  | 77  |
| A000005  | 104 |
| A000040  | 58  |
| A000110  | 27  |
| A000108  | 31  |
| A060843  | 5   |
| A000372  | 10  |
| A046859  | 4   |

**Formula values:**

| Quantity                      | Value                                                     |
| ----------------------------- | --------------------------------------------------------- |
| 2^128                         | 3.403e38                                                  |
| log10 2^1024                  | 308.2547                                                  |
| 2^65536                       | 2.0035e19,728                                             |
| Height 5 / 8 / 15 / 18        | log10 x = 3.157e5 / 2.525e6 / 3.232e8 / 2.586e9           |
| P_gain at 1e100 / 2^1024      | 34.41 / 5,534,417                                         |
| A000142 extrapolated to step 30 | log2 = 104.4756                                         |
| Feedback slope parts          | 8·log10 1.15 = 0.4856; 0.0301·Σ_{k=1..8} 10/(k+2) = 0.4301 |

**Window counts at the 2·10^4 bound** (`docs/prototypes/windows.mjs`): A000045 16, A000027
70, A001477 71, A000079 8, A000142 1, A000108 4, A000110 2, A000005 97, A000010 62, A000040 51,
A000041 30, A000112 2 (excluded as a Record). At the old 10^5 bound they were 19, 70, 71, 10,
2, 5, 3, 97.

**Record costs** (`docs/prototypes/record_costs.mjs`, BigInt): A000215 costs 2, 3, 5, 9, 17,
33, 65, 129, 257 (520); all 12 Records cost 5,247 TP over 128 advances.

**Heights for deep counts** (`docs/prototypes/window_heights.py`, default knobs): G1 purchase
#17,711 needs height 14; #20,000 of G8 needs height 14; #41,000 of G1 needs 17; #75,025 of G1
needs 20.

**Sources checked:**
- **Sounds:** every id in §16.3 exists in `index.json`, and all are CC0-1.0. 23 sources are Ogg
  and 1 is WAV; total duration after the 1.5 s cap is 13.6 s.
- **Icons:** every UI icon in §16.2 exists in a listed artist folder; the CC0 role table of §16.2
  was measured at `82d94881`.
- **Music:** all 4 tracks exist under `freepd.com/` and pass the tag rule of §16.4. Source
  sizes: Bit Bit Loop 3.1 MB, Beat One 5.8 MB, Alternative Clock Dimension 5.8 MB, Infinite
  Wonder 7.6 MB. "Circuit" (7.2 MB) has no tags and is not used.
- **Fonts:** `@fontsource/jetbrains-mono` 5.3.0: Latin 400/500 woff2 21.2/21.8 KB, Greek
  400/500 woff2 4.2/4.3 KB. Its per-subset CSS files carry no `unicode-range`.
- **break_eternity.js 2.1.3:** `new Decimal(0).log10()` is NaN; log2(2^1280) =
  1279.9999999999993; log2(2^65536) = 65535.999999999985; at log10 x ≈ 2.586e9, x.add(x·1e-7)
  returns x. Measured in M1 (ADR 001, locked by `tests/unit/num.test.ts`):
  - at log10 x ≈ 2.586e9 (height 18), x is stored on layer 1 (mag 2.586e9), and the smallest
    relative change that registers is about 5.5e-7 (x.mul(1 + 5e-7) is x; x.mul(1 + 6e-7) is
    not);
  - `Decimal.pow(2, 1280)` < `Decimal.pow(2, 1024)·Decimal.pow(2, 256)` (one ulp of mag);
    `Decimal.pow(2, e)` is one ulp below the correctly rounded e·log10 2 at e = 1280 and 65536,
    and `Decimal.pow(2, 10)` is 1024.0000000000002;
  - `Decimal.pow(10, e)` is inexact for large e (mag 2586000000.000001 at e = 2.586e9);
  - the smallest relative `mul` change is about 6.5e-14 at 2^1024 and 4.2e-12 at 2^65536;
  - tetrate(10, slog x) can come out below x (mag 999999.9999999919 for x = 10^10^10^1e6).

---

## Appendix C — Canonical template strings

Every upgrade, milestone, challenge rule, reward and achievement shows exactly the template
below, and nothing else. Each is a `strings.ts` entry under the content id, at most 32
characters, symbolic, with `{placeholders}` filled from data or `knobs.ts`. Content tables
reference these ids (`templateId`), and `tests/arch/templates.test.ts` parses this appendix and
checks that the ids and strings match exactly. A milestone that adds content adds its rows here
in the same commit. The prose in §7–§13 describes the effects; it is never shown.

**Product (§7)**

| Id                      | Template                       |
| ----------------------- | ------------------------------ |
| `product.u1`            | `start x = 1e4`                |
| `product.u2`            | `Auto G1–G2`                   |
| `product.u3`            | `g = 1.175`                    |
| `product.u5`            | `P gain ×1.02^{discoveries}`   |
| `product.u8`            | `Auto G3–G4`                   |
| `product.u13`           | `G_k ×(1 + b_(k+1)/50)`        |
| `product.u21`           | `Auto G5–G6`                   |
| `product.u34`           | `Nearness: top 3`              |
| `product.u55`           | `Auto G7–G8, global`           |
| `product.u89`           | `Pb exponent +{pbStep}`        |
| `product.u144`          | `c0 +{c0Step}`                 |
| `product.u233`          | `P gain ×3`                    |
| `product.u377`          | `Autobuy mode: target`         |
| `product.u610`          | `G8 ×(1 + log10 max(1, x))`    |
| `product.u987`          | `Auto Product reset`           |
| `product.u1597`         | `d_P = 36`                     |
| `product.rep.gain`      | `P gain ×2`                    |
| `product.rep.interval`  | `Interval ×0.8`                |
| `product.pending`       | `Pending`                      |

**Power milestones and upgrades (§8.3, §8.4).** Milestones are numbered by position; the reset
count comes from the knob and is shown with `power.ms.count`.

| Id                          | Template                       |
| --------------------------- | ------------------------------ |
| `power.ms.count`            | `{n} Power resets`             |
| `power.ms1.a`               | `Unlock Challenges, Slots`     |
| `power.ms1.b`               | `Keep 2/8/21/55 P upgrades`    |
| `power.ms2`                 | `start x = 2^64`               |
| `power.ms3`                 | `Keep Product upgrades`        |
| `power.ms4`                 | `Keep interval levels`         |
| `power.ms5`                 | `Auto Power reset`             |
| `power.ms6`                 | `Autobuy mode: climb`          |
| `power.ms7`                 | `Passive P 1%/s`               |
| `power.ms8`                 | `Lab charges +1 per reset`     |
| `power.slots12` … `power.slots78` | `Slots G{a}–G{b}`        |
| `power.e2`                  | `E gain ×2`                    |
| `power.hints`               | `Hint cost ÷10`                |
| `power.offline72`           | `Offline cap 72 h`             |
| `power.lab`                 | `Unlock Lab`                   |
| `power.lift`                | `Lift cap 2^1024`              |
| `power.lift.req.disc`       | `Discoveries ≥ {n}`            |
| `power.lift.req.complete`   | `Complete ≥ {n}`               |
| `power.lift.req.challenges` | `C1–C4 done`                   |
| `power.chain`               | `Unlock X1–X8`                 |

**Challenges (§9)**

| Id                     | Template                        |
| ---------------------- | ------------------------------- |
| `challenge.goal`       | `Goal 2^(1024·(c+1)²)`          |
| `challenge.grant`      | `Grants {anumber}`              |
| `challenge.c1.rule`    | `slot_k = ×1`                   |
| `challenge.c2.rule`    | `G5–G8 locked`                  |
| `challenge.c3.rule`    | `ρ_k ×2`                        |
| `challenge.c4.rule`    | `Pb = 1, Product upgrades off`  |
| `challenge.c5.rule`    | `Coll = 1`                      |
| `challenge.c5.rule2`   | `Window matches ≥ 3`            |
| `challenge.c6.rule`    | `b_k ∈ A002113`                 |
| `challenge.c7.rule`    | `i_k = π(⌊b_k/10⌋)`             |
| `challenge.c8.rule`    | `H_S = 12`                      |
| `challenge.c1.reward`  | `Slot exponent ×(1 + 0.03c)`    |
| `challenge.c2.reward`  | `G5–G8 cost ÷10^(4c)`           |
| `challenge.c3.reward`  | `ρ_k ×(1 − 0.03c)`              |
| `challenge.c4.reward`  | `Pb exponent +0.02c`            |
| `challenge.c5.reward`  | `Reverse read; c0 +0.005c`      |
| `challenge.c6.reward`  | `g +0.005c`                     |
| `challenge.c7.reward`  | `Step length 10 − 0.4c`         |
| `challenge.c8.reward`  | `Extrapolated terms +2c`        |

**Tower (§10)**

| Id                 | Template                          |
| ------------------ | --------------------------------- |
| `tower.ms.height`  | `Height {h}`                      |
| `tower.ms.keepPm`  | `Keep Power milestones`           |
| `tower.ms.slot`    | `Record slot {n}`                 |
| `tower.ms.grant`   | `Grant {anumber}`                 |
| `tower.ms.autoCh`  | `Auto challenges`                 |
| `tower.ms.keepX`   | `Keep 10% of X counts`            |
| `tower.ms.autoT`   | `Auto Tower reset`                |
| `tower.u1a`        | `Keep Power upgrades`             |
| `tower.u1b`        | `Offline cap 7 d`                 |
| `tower.u2`         | `Extrapolation: no limit`         |
| `tower.u3`         | `Challenge cap 10`                |
| `tower.u5`         | `Passive E 10%/s`                 |
| `tower.u8`         | `Loadout presets`                 |
| `tower.u13.a`      | `Lab charge cap 30`               |
| `tower.u13.b`      | `Lab charges +1 per Tower reset`  |
| `tower.u21`        | `Records auto-pay`                |
| `tower.rep.d`      | `D ×0.9`                          |
| `tower.rep.e`      | `E gain ×4`                       |
| `tower.rep.tp`     | `TP gain ×2`                      |

**Records, slots, Lab, automation (§8.5, §8.6, §11, §12)**

| Id                    | Template                      |
| --------------------- | ----------------------------- |
| `record.reward.eps`   | `ε +{eps}ρ`                   |
| `record.reward.tp`    | `TP gain ×(1 + {tp}ρ)`        |
| `record.next`         | `Next: {cost} TP`             |
| `record.exhausted`    | `Exhausted: {n} known terms`  |
| `slot.term`           | `term {i} of {N}`             |
| `slot.link`           | `Λ +0.05`                     |
| `slot.chain`          | `Chain ×2`                    |
| `lab.charges`         | `Charges {n}/{cap}`           |
| `auto.trigger.x`      | `x ≥ {X}`                     |
| `auto.trigger.gain`   | `gain ≥ {Y}`                  |
| `auto.trigger.time`   | `every {T} s`                 |
| `auto.trigger.ratio`  | `gain ≥ {k} × last`           |
| `exponent.eps`        | `m_k^ε`                       |

**Achievements (§13)**

| Id        | Template                 |
| --------- | ------------------------ |
| `ach.r1`  | `Buy G{k}`               |
| `ach.r2`  | `Reach {value}`          |
| `ach.r3`  | `Discover {n}`           |
| `ach.r4`  | `Complete {n}`           |
| `ach.r5`  | `Product reset < {t}`    |
| `ach.r6`  | `Complete C{k}`          |
| `ach.r7`  | `Power resets: {n}`      |
| `ach.r8`  | `Exhaust {n} Records`    |

---

## 25. Changelog

**v1.3 (M2):** clarifications found while implementing the Sum layer, the loop and the bot. No
formula, frozen constant or stored format changed (there is no save format yet), so no
migration is needed.
- **"G5 / G8 at t" (§15, §22.6):** the time of the tier's first purchase, the prototypes' `G<k>`
  event and §15's "a tier unlocked", not the half-cost reveal of §17.4.
- **Bot policy (§22.6):** the `active` profile implements the `sim2.py` greedy rule the §5.5 and
  §15 reference numbers come from (highest affordable tier first; a global level when it costs
  less than 3× that tier's purchase or no tier is affordable), instead of an unspecified
  "return on cost" rule. Measured with seeds 1–5: G5 at 5.18–5.23 min, G8 at 10.68–10.80 min,
  x ≥ 2^128 at 11.82–11.93 min (active) and 90.37–90.50 min (idle); `docs/balance/M2.md`.
- **Seeds (§22.6):** seeds vary a 0–2 s reaction delay after each round with purchases (the bot
  still acts on the 1 s grid). The M2 policy has no exact cost ties (10^(2+L) never equals 3×
  a tier price), so there is no seeded tie-break yet; a later policy with real ties gets one.
- **Tick order (§21.2):** flush, apply the actions, then add 50 ms, as §21.2's wording says. A
  purchase produces during its own tick, so the jsdom check "x = 0 after Buy" is made on the
  committed state while the header preview already shows 0.100.
- **`step(state, actions, seconds)` and `addTime` (§21.2):** the bot's exact 1 s steps and the
  loop's remainder, before M4's `advance()` exists.
- **Loop remainder and gaps (§21.4):** time beyond 40 ticks goes to the pending time and is
  integrated lazily and exactly; the fraction below 50 ms stays in the accumulator. Until M4,
  a gap over 60 s is one forced exact `integrate`.
- **Deferral scope (§5.5, §21.3):** only periodic flushes defer, event flushes always commit;
  the check uses x before the clamp and is skipped at the cap; steps may then be up to 60 s
  long.
- **Global level index (§5.3):** the purchase made at level L (from 0) costs 10^(2+L), so the
  first level costs 100; owning L levels gives ×1.15^L.
- **Exact cost exponents (§5.4):** exponents are computed in integer tenths, so integer
  exponents are exact (cost(G3, 10) = 1e9).
- **`label` and `templateId` (§21.3, §2):** effects carry a `strings.ts` `label`; `templateId` is
  optional and only on Appendix C content, which the Sum base factors are not. The §2 row of
  `tests/arch/templates.test.ts` now says so: it covers every content id that has a
  `templateId`.
- **Label parameters (§21.3):** `labelParams(state, tier)` fills a label's placeholders, carried
  on the factor as `params`; `factor.slot` is the template `{a} a({i})`, so the A-number is no
  longer a literal in `strings.ts`.
- **Fold order (§21.3):** m = ((1 + Σ add) · Π mul) ^ (Π pow), in content order.
- **`src/sim` purity (§2, §21.6):** the engine-purity, import and extension scans cover
  `src/sim`, which may import `src/engine`; a new arch test keeps the test-only
  `installTestEffect` hook out of `src/` (§2, §21.8).
- **Recovery (§21.8):** global handlers use `addEventListener`; a fault stops the loop for good
  and keeps the last good state and view; a NaN in the derived view is an invariant fault,
  found by a walk of the whole view (`checkValues`), the loop's default. The paused screen
  disables every game control and focuses Reload.
- **Buy-max boundary zone (§5.4):** within 1e-12 relative of a total-cost boundary, buy-max
  replays single buys, so it never buys more than they would. The closed form alone bought one
  more in about 4% of states planted within 2e-13 of a boundary (2.6e-14 relative over x).
- **Only a change is an event (§5.5, §21.2):** a tick whose actions change nothing discards its
  forced flush, so no-op actions (unaffordable buys) no longer lose sub-resolution growth.
- **Cache coherence (§21.3):** events go through `withSum`, which marks the effect table
  dirty; a replay property checks the cached table against a rebuild after every tick and
  action.
- **Longest gap (§22.6):** the report counts the stretch after the last meaningful event up to
  the end of the run, and reports that trailing stretch on its own as well. The 30 min active
  run reports 19.3 min (the stall after G8 at 10.7 min, which M5's Product reset fills), not the
  2.05 min between unlocks.
- **Sum tab (§5.2, §17.3, §17.6, §18, §21.4):** the amount cell is `{a} ({b} bought)` (§17.3);
  column headers come from `strings.ts`, and the cost header cites λ_k = A000124(k−1) from the
  content constant; every buy button's accessible name starts with its row header ("Generator 3
  Max"); formatted numbers are memoized per rendered number; fixed column widths keep the
  buttons still, and below 640 px each row is a 2-line card, so there is no horizontal scroll
  at 375 px. The M2 playtest checks both after 12 simulated minutes on a fake clock.

**v1.2 (M1):** corrections found while implementing the number core and the notation. No
frozen constant or stored format changed, so no migration is needed.
- **Resolution at height 18 (§4.1, Appendix B):** the value is stored on layer 1 (mag
  2.586e9), not layer 2, and the smallest relative change that registers is about 5.5e-7, not
  3e-5. `x.add(x·1e-7)` is still a no-op, so the "no lost growth" rule of §5.5 stays.
- **Thresholds in log2 space (§4.1, §7, §8.2, §10.1):** every `floorGain` threshold is
  computed as `pow2(base + d·log2(n/μ))`, because in 2.1.3 `Decimal.pow(2, 1280)` is one ulp
  below `Decimal.pow(2, 1024)·Decimal.pow(2, 256)`. The formulas are unchanged.
- **Exact powers (§4.1, Appendix B):** `pow2` and `pow10` build large results from components
  (mag = e·log10 2, the correctly rounded value, or mag = e) and give exact doubles for small
  integer exponents; the library's `Decimal.pow` is one ulp low at 2^1280 and 2^65536, gives
  1024.0000000000002 for 2^10 and is inexact for 10^2.586e9. `CAP` and `TOWER1` are
  snapshot-tested from M1.
- **Safe-log API (§4.1):** `log10Pos`/`log10Floor1` return doubles that saturate at
  ±`Number.MAX_VALUE`; invalid input gives `null` or 0. `log2Pos`, `slog10` and `tetrate10`
  join the exports. The op counter is an opt-in `installOpCounter()` that the app bundle
  tree-shakes.
- **Notation (§4.2):** the recursion threshold is the true exponent ⌊log10 v⌋ ≥ 1e6 after
  rounding, for every notation, so the Engineering width fixture is `999.99e999,996` (the
  former `999.99e999,999` needs exponent 1,000,001); widths are bucketed by the displayed
  value; `9.995e5 → 1.00e6` holds at integer threshold 1e3 (at the default it shows
  `999,500`); an output has at most 3 `e`s and the `10↑↑h` height rounds up (tolerance 1e-9);
  non-integers in region 1000…threshold show ⌊v⌋; small non-integers use precision + 1
  significant digits with trailing zeros; the spoken form always uses the Scientific reading,
  "ten to the" for stacks and U+2212 for negative exponents.
- **Tests and tooling:** the audio ban covers `getChannelData` outright and the other
  synthesis APIs (§2); engine purity also bans the other environment globals (§2); tsconfig
  also sets `verbatimModuleSyntax` and `noEmit` (§21.6); `ci.yml` runs the de_DE format
  tests from M1 instead of M9 (§23).
- **M1 review fixes:**
  - `floorGain` returns a `Num`, applies the ±1 correction only below 2^52, takes `Num`
    candidates, and saturates an overflowed `number` candidate instead of paying 1 (§4.1).
  - `pow2`'s mag is `e·log10 2` correctly rounded for every exponent (a double-double product);
    it was one ulp off for about 6% of integers, 1023 and 65535 among them (§4.1).
  - `subClamp` returns NaN for invalid input instead of 0; `decodeNum` accepts only canonical
    codes and runs in constant time; `isValidNum`/`isFiniteNum` no longer narrow a `Num` to
    `never` (§4.1).
  - The formatter's dev assertion is the `onInvalid` option, bound once by
    `createFormatter(tables, { onInvalid })`; Engineering stacks an Engineering exponent (§4.2).
  - The arch scans also catch `.ln()`/`.log(b)`/`.absLog10()` and bracketed or optional log
    calls (while `Math` logs of doubles are allowed), `self`, `indexedDB`, `queueMicrotask`
    and other globals, `Math` aliases, `import.meta`, JavaScript-built WAVs, and code hidden
    behind regex literals (the tokenizer fails closed); `tsconfig.engine.json` typechecks the
    engine without DOM or Node types; the MIT notices of Preact and break_eternity.js ship in
    `public/LICENSES/` from M1 (§2, §16.5, §21.6).
  - The bench contract separates the count self-check (`expectedCount`) from the reported unit
    (`units`, `unit`) and the count budget (`maxCountPerUnit`) (§4.1, §22.12).

**v1.1 (M0 review):** fixes from the adversarial review of v1.0, before any game code.
- **Pacing:** the idle first-reset band is ≤ 120 min (the M2 constants give 90.4 min with
  15-min check-ins); the second-run band is ≤ 90%; the 60-minute band matches the prototype
  (≥ 4 resets, 3-P upgrade, best x ≥ 1e45); every band names the milestone it blocks; pre-Power
  knobs and an escalation rule were added (§14.3, §15).
- **Numbers:** safe logs (`log10Pos`, `log10Floor1`), `floorGain` for every threshold gain,
  `subClamp`, the 610-P factor 1 + log10 max(1, x), exact buy-max, and the production invariant
  before every save (§4.1, §5.4, §20.1).
- **Integration:** event-constant versus state-dependent effects, one refresh rule, lazy online
  integration, and no lost sub-resolution growth (§5.5, §21.3).
- **Notation:** width limits per notation and range, weak monotonicity, fixed en-style grouping,
  the Standard suffix rule up to `Ce` (§4.2).
- **Data:** window term bound 2·10^4 (deep windows were unreachable in v1), Records excluded from
  the index, the reachability report, exact Record costs (A000215 520, total 5,247),
  `oeis.json?h=<dataHash>`, the data-version rule, OEIS credits read at runtime (§6.2, §11,
  §16.1, §21.5).
- **Assets:** JetBrains Mono replaces IBM Plex Mono and STIX Two Math; "Beat One" replaces the
  untagged "Circuit"; the music tag rule and loop crossfade; SFX budget 700 KB and per-format
  sha256; the icon complexity metric and measured role table; the full CC BY credit line;
  explicit artist names; pipeline-time source checks with check-time manifest tests (§2, §16).
- **Robustness:** error boundaries and the recovery panel, the one-active-tab lock, `maxSeenAt`
  against clock rollback, offline autobuyer bulk purchases and a defined prestige-loop credit,
  the exact macro-step schedule, versioned settings, the save panel, a 64 KB save budget, dev
  hooks, hotkeys on `event.code` (§18–§21).
- **Text:** Appendix C holds every in-game template; the string lint covers JSX attributes and
  content labels; `format.ts` takes its tables from `strings.ts` (§2).
- **Process:** CI from M1, Playwright pinned, Pages on the working branch, benchmarks out of
  `npm run check`, prototypes committed under `docs/prototypes/` (§22, §23).
- **Smaller decisions:** Until 10 replaces ×10; Λ = min(1.25, 1 + 0.05n); Record rewards
  Σ 0.02ρ and Π(1 + 0.25ρ); TP checked after the reset's gain; C5 counts distinct window
  matches; entering a challenge pays no E; A000012 is a Cf.-only route; autobuyers fire
  G8 → G1, then global, then resets; one reveal rule (Tower at 2^65535); the default curve is not
  subject to the one-slot rule; C6 and C7 compute their rules in code; extrapolation uses
  log2 max(1, t) and `log2Dec`.

**v1.0 (M0):** synthesized from four proposals. The judges' totals were progression 123.5,
sequences 116.5, engineering 116 and experience 101. Changes against the progression base:

**Fixed weaknesses:**
- Tower has a TP sink: TP = 2^(h−1), Records and repeatables.
- The unreachable 2↑↑6 goal is replaced by a finite v1 goal: exhaust 12 Records.
- Depth is normalized to δ = depth/(W−1) and pays out through the collection, slot exponents and
  comment reveals.
- Shared windows credit every matching sequence.
- Buy-max sweeps check every intermediate tuple exactly.
- Free hold caps remove the early friction.
- Power autobuyer at 8 resets, plus E×2 at 3^n, removes the 31-reset grind.
- The ε softcap is replaced by the governor and a fixpoint calculator, with wide bands.
- The window term bound is 10^5, so completions stay reachable (lowered to 2·10^4 in v1.1).
- The 3.4 s save sound is dropped.
- Music ships as separate files.
- OEIS data is a separate BY-SA file with a licence sidecar, quote and email filters, and a
  non-affiliation line.
- `badges/` and `various-artists/` are guarded against.

**Grafted from "sequences":**
- the Lab (with charges) and Cf. discovery
- links and Σ-chains
- Records from short-data sequences, ending "Exhausted"
- challenges built on real sequences, with quoted `%N`
- constants cited from sequences (λ = A000124, costs from A000045 and A000217)
- icon assignment by path complexity
- comment reveals tied to completion

**Grafted from "experience":**
- breakdown tooltips that must equal the rate
- the Next goal chip, log bars and time-to-afford
- reveal at half cost
- the string lint
- the notation spec
- accessibility, the juice table and the dead-zone metric

**Grafted from "engineering":**
- the action queue and determinism tests
- architecture tests
- A/B saves, quarantine, migration fixtures and a `validate()` that never throws
- offline prestige-loop credit
- multi-profile bots with a longest-gap metric
- `git show` extraction, committed outputs and a per-file manifest
- budgets, the Artifact files map and the workflow-scope fallback

**Left out:**
- the Rhythm slot (low agency, borderline under the audio rule)
- b-file extended terms (LFS pointers, unreachable)
- the monotone-only curve rule
- uniform challenge rewards

**Moved to the backlog:**
- nested challenges
- second-order discovery
- keyword sets
- %F formula mastery
