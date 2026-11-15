// Microphone capture + live pitch tracking.
//
// The recording is laid out on the SONG's timeline: audio captured while the
// instrumental is at time T is written at offset T in the output. Pausing stops
// capture, so sample index <-> song time stays a simple multiplication and the
// server can score each lyric line by slicing the WAV at its timestamps.
import { PitchDetector } from 'pitchy';

const TARGET_RATE = 16000; // what speech services expect
const ANALYSIS_SIZE = 2048;
const PITCH_INTERVAL_MS = 25;
const MIN_CLARITY = 0.9;
const MIN_HZ = 70;
const MAX_HZ = 1100;

const WORKLET_SOURCE = `
class TapProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) this.port.postMessage(channel.slice(0));
    return true;
  }
}
registerProcessor('musiglot-tap', TapProcessor);
`;

export const hzToMidi = (hz) => 69 + 12 * Math.log2(hz / 440);

export class MicRecorder {
  constructor() {
    this.segments = []; // [{ songStart, chunks: Float32Array[] }]
    this.rawTrack = []; // [[songTime, midi, segmentIndex], ...] voiced frames only
    this.live = null; // { t, midi } for the newest voiced frame, or null
    this.capturing = false;
  }

  async init() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot record audio.');
    try {
      // Browser "enhancements" are tuned for speech calls and mangle sustained sung notes.
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
      });
    } catch (err) {
      throw new Error(err.name === 'NotAllowedError' ? 'Microphone access was blocked. Allow it in your browser and try again.' : `Could not open the microphone (${err.message}).`);
    }
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.sampleRate = this.ctx.sampleRate;
    const source = this.ctx.createMediaStreamSource(this.stream);

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = ANALYSIS_SIZE;
    source.connect(this.analyser);
    this.buffer = new Float32Array(ANALYSIS_SIZE);
    this.detector = PitchDetector.forFloat32Array(ANALYSIS_SIZE);

    const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'application/javascript' }));
    await this.ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    this.tap = new AudioWorkletNode(this.ctx, 'musiglot-tap');
    this.tap.port.onmessage = (e) => {
      if (this.capturing) this.segments[this.segments.length - 1].chunks.push(e.data);
    };
    source.connect(this.tap);
    // Keep the graph pulling audio without playing the mic back to the user.
    const mute = this.ctx.createGain();
    mute.gain.value = 0;
    this.tap.connect(mute).connect(this.ctx.destination);

    // What the user hears lags audio.currentTime by the output latency, and what
    // we capture lags their voice by the input latency. The server also estimates
    // any remaining constant lag when scoring.
    this.latency = (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0) + 0.02;
  }

  /** Begin (or resume) capturing. getSongTime returns the instrumental's current time. */
  async start(getSongTime) {
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.getSongTime = getSongTime;
    this.segments.push({ songStart: Math.max(0, getSongTime() - this.latency), chunks: [] });
    this.capturing = true;
    clearInterval(this.timer);
    this.timer = setInterval(() => this.samplePitch(), PITCH_INTERVAL_MS);
  }

  pause() {
    this.capturing = false;
    this.live = null;
    clearInterval(this.timer);
  }

  samplePitch() {
    if (!this.capturing) return;
    this.analyser.getFloatTimeDomainData(this.buffer);
    const [hz, clarity] = this.detector.findPitch(this.buffer, this.sampleRate);
    if (clarity < MIN_CLARITY || hz < MIN_HZ || hz > MAX_HZ) {
      this.live = null;
      return;
    }
    // The analysis window is centred half a buffer in the past.
    const t = this.getSongTime() - this.latency - ANALYSIS_SIZE / this.sampleRate / 2;
    if (t < 0) return;
    const midi = Math.round(hzToMidi(hz) * 100) / 100;
    this.rawTrack.push([Math.round(t * 1000) / 1000, midi, this.segments.length - 1]);
    this.live = { t, midi };
  }

  /** [start, end] in song seconds of each recorded stretch (a new one starts after every pause or skip). */
  segmentRanges() {
    return this.segments.map((seg) => {
      const length = seg.chunks.reduce((n, c) => n + c.length, 0);
      return [seg.songStart, seg.songStart + length / this.sampleRate];
    });
  }

  /** Stretches of the song that were recorded, for the server to grade only those. */
  coverage() {
    return this.segmentRanges().filter(([a, b]) => b - a > 0.05).map(([a, b]) => [Math.round(a * 1000) / 1000, Math.round(b * 1000) / 1000]);
  }

  /**
   * Pitch track for scoring. If a part of the song was sung more than once
   * (the singer skipped back), only the latest pass counts, matching buildWav.
   */
  get track() {
    const ranges = this.segmentRanges();
    return this.rawTrack
      .filter(([t, , seg]) => !ranges.some(([a, b], j) => j > seg && t >= a && t <= b))
      .map(([t, midi]) => [t, midi]);
  }

  /** 16 kHz mono 16-bit WAV on the song's timeline. */
  buildWav() {
    const sr = this.sampleRate;
    let total = 0;
    const placed = this.segments.map((seg) => {
      const offset = Math.round(seg.songStart * sr);
      const length = seg.chunks.reduce((n, c) => n + c.length, 0);
      total = Math.max(total, offset + length);
      return { offset, chunks: seg.chunks };
    });
    const full = new Float32Array(total);
    for (const { offset, chunks } of placed) {
      let pos = offset;
      for (const chunk of chunks) {
        full.set(chunk.subarray(0, Math.max(0, total - pos)), pos);
        pos += chunk.length;
      }
    }

    // Downsample by averaging each output sample's input span (cheap low-pass).
    const ratio = sr / TARGET_RATE;
    const outLength = Math.floor(total / ratio);
    const view = new DataView(new ArrayBuffer(44 + outLength * 2));
    const writeString = (pos, s) => [...s].forEach((ch, i) => view.setUint8(pos + i, ch.charCodeAt(0)));
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + outLength * 2, true);
    writeString(8, 'WAVEfmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, TARGET_RATE, true);
    view.setUint32(28, TARGET_RATE * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, outLength * 2, true);
    for (let i = 0; i < outLength; i++) {
      const a = Math.floor(i * ratio);
      const b = Math.min(total, Math.max(a + 1, Math.floor((i + 1) * ratio)));
      let sum = 0;
      for (let j = a; j < b; j++) sum += full[j];
      const s = Math.max(-1, Math.min(1, sum / (b - a)));
      view.setInt16(44 + i * 2, Math.round(s * 32767), true);
    }
    return new Blob([view], { type: 'audio/wav' });
  }

  destroy() {
    this.pause();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close().catch(() => {});
  }
}
