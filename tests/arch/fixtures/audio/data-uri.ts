// Planted violation: a data URI of a built WAV, played through the allowed new Audio(url).
declare const b64: string;
export const play = () => new Audio('data:audio/wav;base64,' + b64).play();
