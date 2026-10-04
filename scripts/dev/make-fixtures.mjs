#!/usr/bin/env node
// Writes the save fixtures (GDD §20.1, §21.9): `npm run fixtures`.
//
// - tests/fixtures/dev/<name>.json: envelope JSON that the dev hook loads with
//   `?fixture=<name>` (§21.9), through the same migrations and validate() as any save, so old
//   fixtures keep loading. Regenerated on every run:
//   - new-game:    a new game
//   - mid-sum:     about 6 minutes of the active bot (G1–G5)
//   - pre-product: x just below 2^128 (the first Product reset; M16's keyboard run uses it)
//   - late-sum:    all 8 tiers, x about 1e100
// - tests/fixtures/saves/v<SAVE_VERSION>.json: the frozen fixture of the current save version
//   (§20.1 migrations). Written only when it is absent: an existing vN.json is never
//   overwritten (tests/unit/save-migrations.test.ts also pins its sha256).
//
// Each state comes from the bot's 1 s exact steps (src/sim/bot.ts), with the onboarding memory
// observed at every step as the game loop does, and fixed save times (no offline credit is
// given to fixtures anyway). Node runs the TypeScript sources directly (type stripping, §21.6).
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeSave, decodeSaveJson, SAVE_VERSION } from '../../src/engine/save/envelope.ts';
import { checkSave } from '../../src/engine/invariants.ts';
import { log10Floor1 } from '../../src/engine/num.ts';
import { newGame } from '../../src/engine/state.ts';
import { step, tick } from '../../src/engine/tick.ts';
import { runBot } from '../../src/sim/bot.ts';
import { memoryToIds, newMemory, observeContext, observeMemory } from '../../src/ui/onboarding.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEV = join(ROOT, 'tests', 'fixtures', 'dev');
const SAVES = join(ROOT, 'tests', 'fixtures', 'saves');

/** Fixed save times (2026-09-21T14:13:20Z), so the fixtures are reproducible. */
const META = Object.freeze({
  gameVersion: '0.4.0',
  savedAt: 1_790_000_000_000,
  maxSeenAt: 1_790_000_000_000,
  dataHash: '',
});

/** A bot run replayed with its 1 s steps, the onboarding memory observed at every step. */
function botSave(opts, { pendingTick = false } = {}) {
  const run = runBot({ profile: 'active', seed: 1, ...opts });
  let s = run.initial;
  let m = newMemory();
  for (const actions of run.log) {
    m = observeMemory(m, observeContext(s));
    s = step(s, actions, 1);
  }
  m = observeMemory(m, observeContext(s));
  if (pendingTick) {
    // Seven 50 ms ticks: 350 ms pending, as a save made between two flushes has.
    for (let i = 0; i < 7; i++) s = tick(s, []);
  }
  return { game: s, onboarding: memoryToIds(m) };
}

function json(save) {
  const problems = checkSave(save);
  if (problems.length > 0) throw new Error(`invalid fixture state: ${problems.join('; ')}`);
  const { json: text } = encodeSave(save, META);
  const back = decodeSaveJson(text);
  if (back.kind !== 'ok') throw new Error(`fixture does not decode: ${JSON.stringify(back)}`);
  return text + '\n';
}

function describe(name, save) {
  const s = save.game.sum;
  const owned = s.bought.filter((b) => b > 0).length;
  return `${name}: log10 x = ${log10Floor1(s.x).toFixed(2)}, ${owned} tiers, level ${s.globalLevel}`;
}

const dev = {
  'new-game': { game: newGame(), onboarding: memoryToIds(newMemory()) },
  'mid-sum': botSave({ seconds: 360 }),
  'pre-product': botSave({ seconds: 3600, stopAtLog2: 127 }),
  'late-sum': botSave({ seconds: 7200, stopAtLog2: Math.log2(10) * 100 }),
};

mkdirSync(DEV, { recursive: true });
for (const [name, save] of Object.entries(dev)) {
  writeFileSync(join(DEV, `${name}.json`), json(save));
  console.log(`wrote tests/fixtures/dev/${name}.json (${describe(name, save)})`);
}

mkdirSync(SAVES, { recursive: true });
const frozen = join(SAVES, `v${SAVE_VERSION}.json`);
if (existsSync(frozen)) {
  console.log(`kept tests/fixtures/saves/v${SAVE_VERSION}.json (frozen, never overwritten)`);
} else {
  // G1–G5 owned, global levels, 350 ms pending, reveals and goals done.
  const save = botSave({ seconds: 330 }, { pendingTick: true });
  writeFileSync(frozen, json(save));
  console.log(`wrote tests/fixtures/saves/v${SAVE_VERSION}.json (${describe('v1', save)})`);
}
