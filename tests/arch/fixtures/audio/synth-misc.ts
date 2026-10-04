// Planted violations: one line per further synthesis API, and a bracketed name.
declare const ctx: AudioContext;

export const wave = ctx.createPeriodicWave(new Float32Array(2), new Float32Array(2));
export const dc = ctx.createConstantSource();
export const proc = ctx.createScriptProcessor(256, 1, 1);
export const worklet = ctx.audioWorklet;
export const node = (c: BaseAudioContext) => new AudioWorkletNode(c, 'x');
export const osc = (c: BaseAudioContext) => new OscillatorNode(c);
export const offline = new OfflineAudioContext(1, 44100, 44100);
export const bracketed = (ctx as unknown as Record<string, () => unknown>)['createOscillator'];
