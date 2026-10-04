// Planted violation: the engine imports the sim (checked as src/engine/x.ts); only the sim may
// import the engine.
import { runBot } from '../sim/bot.ts';

export const run = runBot;
