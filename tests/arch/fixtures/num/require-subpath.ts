// Planted violation: a require of a break_eternity.js subpath outside num.ts.
declare const require: (id: string) => unknown;

export const lib = require('break_eternity.js/dist/break_eternity.js');
