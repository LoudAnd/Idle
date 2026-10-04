// Planted violation: creating a sample buffer to write into.
declare const ctx: AudioContext;

export const buffer = ctx.createBuffer(1, 44100, 44100);
