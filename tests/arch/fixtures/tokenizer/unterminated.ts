// Planted violation: a block comment that never closes would blank the rest of the file, so
// the scan fails closed instead of passing the code below.
export const x = 1;
/* never closed
export const y = Math.random();
