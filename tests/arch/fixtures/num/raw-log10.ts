// Planted violation: a raw .log10() call outside num.ts.
import type { Num } from '../engine/num.ts';

export const digits = (x: Num) => x.log10();
