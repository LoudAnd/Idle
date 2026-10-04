// Negative control: the wrapped helper, a comment that mentions x.log10(), and a string.
import { log10, num } from '../engine/num.ts';
import * as N from '../engine/num.ts';

export const three = log10(num(1000));
export const note = '.log2(';
// Logs of doubles through Math, console.log and a namespaced helper are allowed.
export const bits = Math.log2(8) + Math.log10(100) + Math.log(2);
export const viaNamespace = N.log2(N.num(8));
console.log(bits);
