// Planted violations: synthesis hidden behind regex literals with `/*` and `//` inside.
declare const ctx: AudioContext;
export const re = /[/*]/;
export const osc = ctx.createOscillator();
export const twice = /\/\//.test('x') ? ctx.createOscillator() : null;
