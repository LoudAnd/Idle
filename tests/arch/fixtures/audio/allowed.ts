// Negative control: sample playback is allowed (a comment may mention createOscillator).
declare const ctx: AudioContext;
declare const bytes: ArrayBuffer;
declare const SFX: { click: string };
declare const el: HTMLAudioElement;

export const source = ctx.createBufferSource();
export const decoded = ctx.decodeAudioData(bytes);
export const play = (url: string) => new Audio(url).play();
export const click = () => new Audio(SFX.click).play();
export const fetched = async (url: string) =>
  ctx.decodeAudioData(await (await fetch(url)).arrayBuffer());
export const mp3 = el.canPlayType('audio/mpeg');
export const path = 'assets/sfx/click.wav';
