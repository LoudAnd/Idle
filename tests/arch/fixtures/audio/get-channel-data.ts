// Planted violation: getChannelData, whose array can be written to.
declare const buffer: AudioBuffer;

buffer.getChannelData(0)[0] = 1;
