// Planted violation: the engine imports a Node built-in.
import { readFileSync } from 'node:fs';

export const read = readFileSync;
