# ADR 001 — Big numbers: break_eternity.js 2.1.3 behind `num.ts`

**Status:** Accepted (M1).

## Context

- x grows far past 1e308. The Tower layer reaches log10 x ≈ 2.586e9 at height 18 (GDD
  Appendix B), and the backlog's Pentation layer goes well past that, towards 10↑↑h.
- The engine budget is ≤ 400 `Num` operations per late-game tick (GDD §21.7), and offline
  catch-up runs thousands of macro-steps, so every operation must cost well under a
  microsecond.
- Saves store numbers; a number format chosen now must stay loadable forever (GDD §20.1).
- x is exactly 0 right after the first purchase, so every log must handle 0.

## Decision

- Use **`break_eternity.js` 2.1.3** (MIT), pinned exactly in `package.json`
  (`"break_eternity.js": "2.1.3"`).
- **`src/engine/num.ts` is the only module that imports it.** Everything else uses the `Num`
  type and the helpers of `num.ts`. `Num` is a type alias of `Decimal`, so there is no wrapper
  object and no per-operation overhead.
- Enforced by `tests/arch/num.test.ts`: no import, `import type`, dynamic import or `require`
  of `break_eternity.js` (or a subpath) anywhere in `src/` outside `num.ts`, no raw log method
  on a `Num` outside `num.ts` (`.log10()`, `.log2()`, `.ln()`, `.log(b)`, `.absLog10()`,
  `.pLog10()`, `.logarithm(b)`, directly, through `?.` or by a bracketed name; `Math` logs of
  doubles are allowed), and no use of the bench-only op counter.

## Alternatives rejected

| Option | Why not |
| --- | --- |
| **break_infinity.js** | Faster, but its ceiling of about 1e9e15 rules out the backlog's Pentation layer, and switching later would need a save migration of every stored number. |
| **Log-space doubles** (store log10 x) | Cannot represent 0, which x is right after the first purchase; add and sub need log-sum-exp with cancellation error (every purchase is a subtraction); overflow past log10 ≈ 1.8e308; every operation would be bespoke code with its own tests. |
| **decimal.js / BigInt** | Arbitrary precision is far too slow for 400 operations per tick and thousands of offline steps, and neither has tetration or super-logarithms for the `10↑↑h` notation. |

## Codec

- `encodeNum(x)` writes the normalized components `[sign, layer, mag]`, with `mag` as a JSON
  double. JSON round-trips doubles exactly, so the codec is exact. A negative zero is written
  as 0.
- `decodeNum(code)` never throws and never hangs. It accepts only the canonical codes
  `encodeNum` writes: an array of length 3 with `sign ∈ {−1, 0, 1}`, a safe-integer
  `layer ≥ 0` and a finite `mag`, where zero is `[0, 0, 0]`, layer 0 has
  1/9e15 ≤ mag < 9e15, and layers ≥ 1 have log10(9e15) ≤ |mag| < 9e15. It builds the value
  without normalizing (`fromComponents_noNormalize`), so it runs in constant time. Anything
  else gives `null`.
- **Why canonical only:** normalizing a non-canonical code can hang. In 2.1.3, `normalize()`
  turns `[1, L, 0]` into `[1, 0, 1]` (wrong as well as slow) by stepping down one layer per
  loop iteration, because `signmag = Math.sign(0)` keeps mag at 0: 1e8 layers took 0.7 s, so
  `[1, 2^53 − 1, 0]` would take about two years. Load code (M4, GDD §22.10: loading never
  throws and an invalid blob ends in quarantine) inherits the guarantee.
- Tested exactly (identical components through `JSON.stringify` / `JSON.parse`) for 0, 1, −5,
  1e-10, 1.5e-300, 10, 2^128, 1e308, 2^1024, 2^65536, 10^10^20 and 10↑↑5, plus a 10,000-run
  property over layers 0–3 and both signs, a property that decode-then-encode is the identity
  on every accepted code, a property that arithmetic results round-trip (so every library
  result is canonical), and the huge-layer codes in a child process with a kill timer
  (`tests/unit/num.test.ts` › `codec round-trips exactly`, `codec property at layers 0–3`,
  `decodeNum never throws on malformed codes`).
- **`Decimal.toJSON` is lossy** (`JSON.stringify(num(1.5e-300))` is
  `"1.5000000000000004e-300"`). Save code (M4) must use `encodeNum`, never serialize a
  `Decimal` directly.

## API surface of `num.ts`

| Export | Notes |
| --- | --- |
| `Num`, `NumSource`, `NumCode` | `NumSource` is `Num \| number \| string`; strings hold values a JS literal cannot (`'1e-400'`). |
| `num(v)`, `fromComponents(s, l, m)` | `num` returns a `Num` argument unchanged. |
| `ZERO`, `ONE`, `CAP` (2^1024), `TOWER1` (2^65536) | `Object.freeze`d; snapshot-tested: `CAP = [1, 1, 308.25471555991675]`, `TOWER1 = [1, 1, 19728.30179583467]`. |
| `log10`, `log2` | Raw logs for x > 0 (a NaN `Num` otherwise). `log10` on layer ≥ 1 is an exact layer-down. |
| `pow10`, `pow2` | Exact: exponents that leave layer 0 are built from components (`mag = e`, or `e·log10 2` from a double-double product, the correctly rounded value for every exponent, tested against BigInt arithmetic); integer exponents of small results are exact doubles. A plain `e * Math.log10(2)` rounds twice and is one ulp off for about 6% of integers (1023 and 65535 among them). |
| `slog10`, `tetrate10` | For the `10↑↑h` notation and its test parser. |
| `log10Pos`, `log2Pos` | Doubles, or `null` when x is not a finite positive `Num`. Results beyond the double range (inputs on layer ≥ 2 with mag ≥ 308.25) saturate to ±`Number.MAX_VALUE`. |
| `log10Floor1` | log10 max(x, 1): always finite and ≥ 0; 0 for invalid input. |
| `floorGain(v, x, threshold)` | A `Num`: ⌊v⌋ corrected by at most 1 with exact `Num` comparisons below `EXACT_GAIN_LIMIT` (2^52), the floored candidate from there on (consecutive thresholds round to the same `Num`). `v` is a `number` or, when it can leave the double range (post-lift P and E gains), a `Num` built in log space; a `number` +Infinity saturates to `Number.MAX_VALUE`. Non-decreasing in v and x. **Thresholds are built in log2 space**, `pow2(base + d·log2(n/μ))`, never as products. |
| `subClamp(x, cost)` | max(0, x − cost); a NaN `Num` for invalid input (x NaN, infinite or negative, cost NaN or infinite), so the invariant sees it. |
| `isFiniteNum`, `isValidNum` | `isValidNum` is the save invariant: finite and ≥ 0. Overloaded: a plain boolean for a `Num` argument (no narrowing to `never` in the failing branch), a type guard for `unknown`. |
| `encodeNum`, `decodeNum` | The codec above. |
| `installOpCounter()` | Bench only (below). |

**Op counter.** `installOpCounter()` wraps every `Decimal.prototype` method except
conversions, constructors and mutators (`countedMethods()`: arithmetic, comparison,
`cmpabs`/`maxabs`/`minabs`, the `*_tolerance` comparisons, logs including `absLog10`, and the
transcendental functions) and turns on counting in the `num.ts` helpers. A depth guard counts only top-level
calls, so a helper such as `subClamp` counts once although it calls `gte` and `sub`, and
`Decimal.pow(2, 10)` counts once although it calls `mul` and `pow10` internally. `uninstall()`
restores the originals. Nothing in `src/` calls it (arch test), so the app bundle tree-shakes
it; that is what "compiled in only for `npm run bench`" means (GDD §4.1). Outside the bench
the helpers pay one boolean check.

## Measured pitfalls of 2.1.3

Each row is locked by a test in `tests/unit/num.test.ts` › `break_eternity.js 2.1.3 pitfalls
(ADR 001)` (or the named test), so a library change shows up as a test failure.

| Pitfall | Measured | Consequence |
| --- | --- | --- |
| `new Decimal(0).log10()` | NaN | Safe logs `log10Pos` / `log10Floor1`; raw-log lint outside `num.ts`. |
| `Decimal.pow(2, 1280).log2()` | 1279.9999999999993 (and 65535.999999999985 at 2^65536, 131071.99999999997 at 2^131072) | A raw floor would pay E_gain = 1 at 2^1280; `floorGain` corrects the candidate (`floorGain corrects log2(2^1280)`). |
| `Decimal.pow(2, e).mag` | 385.3183944498958 at e = 1280 and 19728.301795834668 at e = 65536, each one ulp below the correctly rounded `e·log10 2` (385.31839444989595, 19728.30179583467); `Decimal.pow(2, 10)` is 1024.0000000000002 | `pow2` is computed in log space and is exact for small integer exponents; with it, `log2(pow2(1280))` is exactly 1280 and `log2(TOWER1)` exactly 65536. |
| `Decimal.pow(2, 1280)` vs `Decimal.pow(2, 1024)·Decimal.pow(2, 256)` | the single pow is one ulp smaller | A product-form threshold can sit above the value the log formula inverts, so thresholds are built in log2 space (GDD §4.1). |
| `Decimal.pow(10, e).mag` | 2586000000.000001 at e = 2.586e9, 19728.299999999985 at e = 19728.3 | `pow10` builds layer ≥ 1 results from components and is exact. |
| Resolution at height 18 (log10 x = 2.586e9) | x is stored on **layer 1** (mag 2.586e9), not layer 2 as GDD v1.1 said. The smallest relative change that registers is about **5.5e-7** (half an ulp of the mag, times ln 10), not 3e-5: `x.mul(1 + 5e-7)` equals x, `x.mul(1 + 6e-7)` does not. `x.add(x·1e-7)` still returns x. | GDD §5.5's "no lost growth" rule is still needed (corrected in GDD §4.1). |
| Smallest relative `mul` change | about 6.5e-14 at 2^1024 and 4.2e-12 at 2^65536 | ε = 1e-12 works for the P and E threshold tests; the height thresholds need 1e-9. |
| Mutability | `fromNumber`, `fromComponents`, `fromString` and `normalize` mutate `this` | Shared constants are frozen; the library is strict-mode code, so a mutator called on a frozen constant throws `TypeError` instead of changing it. |
| JS literals | `1e-400` is the double 0 | Tiny test values are written as strings: `num('1e-400')`. |
| Packaging | `main` is a UMD build (Node loads it as CJS), `module` is the ESM build, no `exports` map; the types declare `export default class Decimal` | `import Decimal from 'break_eternity.js'` works in Node type stripping (`tests/arch/node-import.test.ts`), in Vitest and in a Vite bundle. |
| `tetrate(10, slog x)` | can come out below x: for x = 10^10^10^1e6, slog is 4.8504757875762765 and tetrate of that has mag 999999.9999999919 | The `10↑↑h` height rounds **up** (with a 1e-9 tolerance), or the notation would not be monotone. |
| `slog` speed | about 0.4 ms per call (the library refines it with up to 100 tetrations) | `format.ts` memoizes the last height; `10↑↑h` values only occur far beyond the v1 game. |
| NaN, ±Infinity and −0 | NaN has sign, layer and mag all NaN; ±Infinity has layer = mag = Infinity; `num(-0)` normalizes to `[0, 0, 0]`, but `ZERO.neg()` has sign −0 | `isFiniteNum` checks all three components; `encodeNum` writes a −0 as 0, so the codec is exact up to the sign of zero. |
| Static functions | `Decimal.pow = (v, o) => D(v).pow(o)` and so on | The op counter only needs to wrap prototype methods. |
| `normalize()` of `[±1, L, 0]` with L > 0 | loops once per layer (`signmag = Math.sign(0)` keeps mag 0) and ends at `[1, 0, 1]`: 1e8 layers take about 0.7 s | `decodeNum` accepts only canonical codes and builds them without normalizing; the huge-layer codes are tested in a child process with a kill timer. |
| `e * Math.log10(2)` | rounds twice: one ulp off the correctly rounded e·log10 2 for about 6% of integers (e = 1023: 307.9536855642528 instead of 307.95368556425274; e = 65535 too) | `pow2` uses a double-double product, tested against exact BigInt arithmetic. |

## Performance (M1)

`npm run bench` runs 100,000 mixed operations (10 per iteration: add, `subClamp`, mul, div,
`pow(1.15)`, cmp, `log10Floor1`, max, `pow10`, gte) over a deterministic pool of 1,024 values on
layers 0–2. The instrumented run counts exactly 100,000 top-level `Num` operations.

The bench contract separates three things: `count(state)` measures the `Num` operations of one
run; `units`/`unit` say what the count is reported per (iteration here, tick or macro-step in
later benches, GDD §22.12); `expectedCount` is an optional exact self-check (this bench sets it
to 100,000; a mismatch is a broken bench, exit 2) and `maxCountPerUnit` an optional count budget
(400 per tick from M2, GDD §21.7; over budget is a failure, exit 1).

| Run | min | median | max | Budget |
| --- | ---: | ---: | ---: | ---: |
| `npm run bench` (Node 22.22, M1 sandbox, 5 runs) | 16.8–21.8 ms | 17.3–22.1 ms | 18.9–24.3 ms | 250 ms (×3 guard in CI from M9) |

That is about 0.2 µs per operation, so the per-tick budget of 400 operations costs about
0.1 ms. The minified library is about 14 KB gzip; the M1 app bundle does not include it yet,
because the scaffold page does not import `num.ts`. Its MIT notice (and Preact's, which the
scaffold already bundles) ships in `public/LICENSES/` from M1, checked byte for byte against
the installed package by `tests/arch/licenses.test.ts` (GDD §16.5).

## Revisit when

- break_eternity.js is upgraded (the pitfall tests will fail and must be re-measured), or
- the Pentation layer is designed (check `slog` / `tetrate` accuracy and speed at those
  heights).
