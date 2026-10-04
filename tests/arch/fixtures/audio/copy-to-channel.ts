// Planted violation: writing samples into a buffer.
declare const buffer: AudioBuffer;

buffer.copyToChannel(new Float32Array(128), 0);
