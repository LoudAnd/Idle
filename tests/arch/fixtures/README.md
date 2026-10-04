# Architecture test fixtures

Planted violations and negative controls for `tests/arch/*.test.ts`. Each test reads a fixture
and checks it at a virtual path (for example `src/engine/x.ts`), so these files are never part
of the build: they are excluded from `tsconfig.json`, are not named `*.test.ts`, and import
modules that may not exist.

`tokenizer/unterminated.ts` is deliberately not valid TypeScript (a block comment that never
closes, to prove the scanner fails closed), so it is listed in `.prettierignore`.
