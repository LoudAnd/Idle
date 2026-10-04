// Planted violations: window access in the engine, directly and in a ternary.
export const width = window.innerWidth;
export const maybe = (a: boolean) => (a ? window : null);
