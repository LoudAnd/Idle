// Planted violations: the jsfxr/riffwave route, a WAV built in JavaScript and played by URL.
const samples = new Uint8Array(44100);
for (let i = 0; i < samples.length; i++) samples[i] = 128;
const header = 'RIFF';
const blob = new Blob([header, samples], { type: 'audio/wav' });
export const play = () => new Audio(URL.createObjectURL(blob)).play();
