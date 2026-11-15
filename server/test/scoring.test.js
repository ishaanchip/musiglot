import test from 'node:test';
import assert from 'node:assert/strict';
import { scorePitch } from '../src/scoring/pitch.js';
import { scoreFromTranscript } from '../src/scoring/pronunciation.js';
import { encodeWav, parseWav, sliceSamples } from '../src/scoring/wav.js';
import { similarity } from '../src/scoring/text.js';
import { templateFeedback } from '../src/scoring/feedback.js';

const HOP = 0.025;
// Two 2-second lines: an ascending line then a descending one.
const melody = (t) => (t < 2 ? 60 + Math.floor(t * 2) * 2 : 67 - Math.floor((t - 2) * 2) * 2);
const reference = { hopSec: HOP, frames: Array.from({ length: 160 }, (_, i) => melody(i * HOP)) };
const lines = [
  { index: 0, start: 0, end: 2 },
  { index: 1, start: 2, end: 4 },
];
const sing = (fn, from = 0, to = 4) => {
  const out = [];
  for (let t = from; t < to; t += HOP) out.push([t, fn(t)]);
  return out;
};

test('perfect singing scores ~10', () => {
  const r = scorePitch({ reference, userTrack: sing(melody), lines });
  assert.ok(r.score >= 9.8, `score ${r.score}`);
});

test('singing an octave lower and a fourth up still scores high (transposition)', () => {
  const r = scorePitch({ reference, userTrack: sing((t) => melody(t) - 12 + 5), lines });
  assert.ok(r.score >= 9.5, `score ${r.score}`);
  assert.ok(Math.abs(r.transposition - 5) <= 0.5, `transposition ${r.transposition}`);
});

test('150 ms late is forgiven', () => {
  const r = scorePitch({ reference, userTrack: sing(melody).map(([t, m]) => [t + 0.15, m]), lines });
  assert.ok(r.score >= 9, `score ${r.score}`);
});

test('a monotone drone scores low; silence scores 0', () => {
  const drone = scorePitch({ reference, userTrack: sing(() => 61), lines });
  assert.ok(drone.score < 6, `drone ${drone.score}`);
  const silent = scorePitch({ reference, userTrack: [], lines });
  assert.equal(silent.score, 0);
  assert.equal(silent.perLine[0].timingOffsetMs, null);
});

test('skipping a line only zeroes that line', () => {
  const r = scorePitch({ reference, userTrack: sing(melody, 0, 2), lines });
  assert.ok(r.perLine[0].pitch >= 9.5);
  assert.ok(r.perLine[1].pitch <= 1.5, `line 2 ${r.perLine[1].pitch}`);
});

test('wav round trip and slicing', () => {
  const samples = Int16Array.from({ length: 16000 }, (_, i) => i % 100);
  const wav = parseWav(encodeWav(samples, 16000));
  assert.equal(wav.sampleRate, 16000);
  assert.deepEqual(Array.from(wav.samples.subarray(0, 5)), [0, 1, 2, 3, 4]);
  assert.equal(sliceSamples(wav, 0.25, 0.5).length, 4000);
  assert.equal(sliceSamples(wav, 5, 6).length, 0);
});

test('text similarity ignores accents and punctuation; works for Devanagari', () => {
  assert.equal(similarity('¡Corazón!', 'corazon'), 1);
  assert.equal(similarity('रानी है', 'रानी है।'), 1);
  assert.ok(similarity('como la flor', 'como la floor') > 0.8);
  assert.ok(similarity('como la flor', 'banana') < 0.4);
});

test('transcript scoring assigns words to lines and scores them', () => {
  const song = {
    lines: [
      { index: 0, start: 0, end: 2, original: 'Como la flor' },
      { index: 1, start: 2, end: 4, original: 'con tanto amor' },
    ],
  };
  const words = [
    { word: 'como', start: 0.2, end: 0.5 },
    { word: 'la', start: 0.6, end: 0.7 },
    { word: 'flor', start: 0.8, end: 1.4 },
  ];
  const r = scoreFromTranscript(words, song);
  assert.equal(r[0].pronunciation, 10);
  assert.equal(r[1].pronunciation, 0);
  const fb = templateFeedback(song, { pronunciationScore: 5, pitchScore: 5, perLine: r.map((x) => ({ ...x, pitch: x.index ? 0 : 9, timingOffsetMs: 0 })) });
  assert.ok(fb.wentWell.length >= 2 && fb.improve.length >= 2);
});

test('only lines covered by the recording are graded', async () => {
  const { attemptedLines, normalizeCoverage } = await import('../src/scoring/coverage.js');
  const song = [0, 1, 2, 3].map((i) => ({ index: i, start: i * 10, end: i * 10 + 8 }));
  // Sang 0-9 s, skipped ahead, sang 21-24 s (less than half of line 2), then 30-36 s.
  const coverage = normalizeCoverage([[30, 36], [0, 5], [4, 9], [21, 24], [7, 'x']], 0);
  assert.deepEqual(coverage, [[0, 9], [21, 24], [30, 36]]);
  assert.deepEqual(attemptedLines(song, coverage).map((l) => l.index), [0, 3]);
  // Older clients send no coverage: fall back to the length of the recording.
  assert.deepEqual(attemptedLines(song, normalizeCoverage(undefined, 19)).map((l) => l.index), [0, 1]);
  assert.deepEqual(normalizeCoverage([], 0), []);
});
