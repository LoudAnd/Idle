// Negative control (checked as src/sim/x.ts): the sim may import the engine and itself, with .ts.
import { newGame } from '../engine/state.ts';
import type { GameState } from '../engine/state.ts';
import { createRng } from './rng.ts';

export const start: GameState = newGame();
export const roll = createRng(1).next() + Math.floor(1.5);
