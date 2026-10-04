// Planted violations: Math reached other than as Math.<name>, import.meta, and the Function
// constructor (each a way around the Math.random and globalThis bans). One per line.
export const r1 = Math['random']();
const { random } = Math;
export const M = Math;
export const r2 = Reflect.get(Math, 'random');
export const dev = import.meta.env;
export const g = Function('return this')();
export const h = new Function('return 1');
export const r3 = random();
