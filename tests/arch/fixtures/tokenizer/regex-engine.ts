// Planted violations hidden behind regex literals that contain a block-comment opener, a line
// comment, a quote and a backtick, and between two divisions (checked as src/engine/x.ts).
declare const n: number;
export const a = /[/*]/;
export const b = Math.random();
export const c = /'/;
export const d = new Date();
export const e = /`/;
export const f = window.innerWidth;
export const g = /\/\//.test('x') && performance.now();
export const i = n / 2 + Math.random() / 3;
