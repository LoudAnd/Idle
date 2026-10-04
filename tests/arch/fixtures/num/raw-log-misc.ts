// Planted violations: the other Decimal log methods (NaN at 0 like log10), optional calls and
// bracketed names. One per line from line 6.
import type { Num } from '../engine/num.ts';
declare const x: Num;
declare const D: { ln(v: Num): Num };
export const a = x.ln();
export const b = x.log(10);
export const c = x.absLog10();
export const d = x.logarithm(2);
export const e = x.pLog10();
export const f = x['log10']();
export const g = x?.log10();
export const h = x.log10?.();
export const i = D.ln(x);
export const j = x[`log2`]();
