// Minimal PCM16 WAV reader/writer. The browser uploads 16 kHz mono 16-bit WAV
// whose sample index maps directly to song time (see client/src/audio/recorder.js).

export function parseWav(buffer) {
  if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Recording is not a WAV file');
  }
  let offset = 12;
  let fmt = null;
  let data = null;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      fmt = {
        format: buffer.readUInt16LE(body),
        channels: buffer.readUInt16LE(body + 2),
        sampleRate: buffer.readUInt32LE(body + 4),
        bits: buffer.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      data = buffer.subarray(body, Math.min(body + size, buffer.length));
    }
    offset = body + size + (size % 2);
  }
  if (!fmt || !data) throw new Error('WAV file is missing fmt/data chunks');
  if (fmt.format !== 1 || fmt.bits !== 16) throw new Error('Only 16-bit PCM WAV is supported');
  const frames = Math.floor(data.length / (2 * fmt.channels));
  const samples = new Int16Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < fmt.channels; c++) sum += data.readInt16LE((i * fmt.channels + c) * 2);
    samples[i] = Math.round(sum / fmt.channels);
  }
  return { sampleRate: fmt.sampleRate, samples };
}

export function encodeWav(samples, sampleRate) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(samples[i], 44 + i * 2);
  return buf;
}

/** Slice [startSec, endSec] out of a parsed WAV (clamped to the recording). */
export function sliceSamples(wav, startSec, endSec) {
  const a = Math.max(0, Math.floor(startSec * wav.sampleRate));
  const b = Math.min(wav.samples.length, Math.ceil(endSec * wav.sampleRate));
  return b > a ? wav.samples.subarray(a, b) : new Int16Array(0);
}

/** Root-mean-square level in 0..1. */
export function rms(samples) {
  if (!samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length) / 32768;
}
