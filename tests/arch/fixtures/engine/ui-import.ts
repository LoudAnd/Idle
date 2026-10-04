// Planted violation: the engine imports from the UI layer (checked as src/engine/x.ts).
import type { NOTATION_TABLES } from '../ui/strings.ts';

export type Tables = typeof NOTATION_TABLES;
