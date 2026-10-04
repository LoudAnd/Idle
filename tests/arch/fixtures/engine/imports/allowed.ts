// Negative control (checked as src/engine/sub/x.ts): relative imports with .ts that stay in
// src/engine.
import { a } from './a.ts';
import type { B } from '../b.ts';

export const value: B = a;
