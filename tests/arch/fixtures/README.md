# Architecture test fixtures

Planted violations and negative controls for `tests/arch/*.test.ts`. Each test reads a fixture
and checks it at a virtual path (for example `src/engine/x.ts`), so these files are never part
of the build: they are excluded from `tsconfig.json`, are not named `*.test.ts`, and import
modules that may not exist.

`tokenizer/unterminated.ts` is deliberately not valid TypeScript (a block comment that never
closes, to prove the scanner fails closed), so it is listed in `.prettierignore`.

`sim/` holds the fixtures for the `src/sim` purity and import rules (M2): the sim is pure like
the engine and may import only `src/engine` and `src/sim` (`engine/sim-import.ts` plants the
engine importing the sim). `engine/test-effect.ts` plants a production use of the test-only
effect hook (`tests/arch/test-hooks.test.ts`).

M3 adds the fixtures of the string, template and glyph rules:

- `strings/`: planted violations of `tests/arch/strings.test.ts` (a 33-character entry, a
  sentence, JSX text, one literal per text attribute plus component props, object-literal props
  and spread objects, an unresolvable spread, two-word literals in UI code, the review's bypass
  routes in `bypass.tsx`, a non-key `label:` in content, words in `format.ts`, a literal
  template passed to `fill`, and `legal.ts` notices breaking each origin rule) and its negative
  controls (`decimal.ts`, the Appendix C templates with decimals; `jsx-allowed.tsx`). The `.ts`
  tables are plain modules exporting `STRINGS` (`legal.ts` exports `LEGAL`), loaded with
  `import()`; the others are parsed at a virtual path.
  `strings/parse-error.tsx` is deliberately not valid TSX (the lint fails closed on it), so it is
  listed in `.prettierignore`.
- `templates/`: a strings.ts entry whose text differs from its Appendix C template, a content
  `templateId` that is not in Appendix C, and a key in an Appendix C namespace that the
  appendix does not list (`tests/arch/templates.test.ts`).
- `glyphs/`: `outside.ts` plants ★ and ∑ (U+2211, not the Greek Σ), which no shipped subset
  covers, and `jsx-text.tsx` plants ★ as JSX text (no string literal holds it); `allowed.ts` is
  the negative control (`tests/arch/glyphs.test.ts`).
