// Planted violation: a raw .log2() call on a Num outside num.ts.
import type { Num } from '../engine/num.ts';

export const bits = (x: Num) => x.log2();
