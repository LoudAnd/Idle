// Planted violations: a WAV assembled in an ArrayBuffer and decoded (no 'RIFF' string needed).
declare const ctx: AudioContext;
const wav = new ArrayBuffer(44 + 88200);
const view = new DataView(wav);
view.setUint32(0, 0x46464952, true);
view.setInt16(44, 12000, true);
export const decoded = ctx.decodeAudioData(wav);
