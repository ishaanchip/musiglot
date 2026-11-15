// Seeds a demo user and a fake Hindi song so the Hindi flow works without real data.
//   npm run seed
// The "song" is a traditional Hindi nursery rhyme (Machhli Jal Ki Rani Hai) with
// synthesized stub audio: beeps for the vocal melody and a simple backing track.
// Real songs come from the Python pipeline (pipeline/process_song.py).
import fs from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { config } from '../src/config.js';
import Song from '../src/models/Song.js';
import User from '../src/models/User.js';
import { encodeWav } from '../src/scoring/wav.js';

const SLUG = 'demo-machhli-jal-ki-rani';
const SR = 22050;
const BEAT = 0.6; // 100 BPM
const INTRO_BEATS = 4;
const LINE_BEATS = 8;
const HOP = 0.025;

// Each word: [devanagari, romanized, phonetic, gloss, midi note, beats]
const LINES = [
  {
    original: 'मछली जल की रानी है',
    romanized: 'machhlī jal kī rānī hai',
    phonetic: 'MUHCH-lee jul kee RAH-nee hai',
    translation: 'The fish is the queen of the water',
    words: [
      ['मछली', 'machhlī', 'MUHCH-lee', 'fish', 60, 1.5],
      ['जल', 'jal', 'jul', 'water', 62, 1],
      ['की', 'kī', 'kee', 'of', 64, 1],
      ['रानी', 'rānī', 'RAH-nee', 'queen', 65, 1.5],
      ['है', 'hai', 'hai', 'is', 67, 2],
    ],
  },
  {
    original: 'जीवन उसका पानी है',
    romanized: 'jīvan uskā pānī hai',
    phonetic: 'JEE-vun OOS-kah PAH-nee hai',
    translation: 'Water is her life',
    words: [
      ['जीवन', 'jīvan', 'JEE-vun', 'life', 67, 2],
      ['उसका', 'uskā', 'OOS-kah', 'her / its', 65, 2],
      ['पानी', 'pānī', 'PAH-nee', 'water', 64, 1.5],
      ['है', 'hai', 'hai', 'is', 62, 1.5],
    ],
  },
  {
    original: 'हाथ लगाओ डर जाएगी',
    romanized: 'hāth lagāo ḍar jāegī',
    phonetic: 'hahth luh-GAH-oh dur jah-AY-gee',
    translation: "Touch her and she'll get scared",
    words: [
      ['हाथ', 'hāth', 'hahth', 'hand', 60, 1.5],
      ['लगाओ', 'lagāo', 'luh-GAH-oh', 'put / touch (command)', 64, 2],
      ['डर', 'ḍar', 'dur', 'fear', 62, 1],
      ['जाएगी', 'jāegī', 'jah-AY-gee', 'will go (she will become)', 67, 2.5],
    ],
  },
  {
    original: 'बाहर निकालो मर जाएगी',
    romanized: 'bāhar nikālo mar jāegī',
    phonetic: 'BAH-hur nee-KAH-lo mur jah-AY-gee',
    translation: 'Take her out and she will die',
    words: [
      ['बाहर', 'bāhar', 'BAH-hur', 'outside', 69, 2],
      ['निकालो', 'nikālo', 'nee-KAH-lo', 'take out (command)', 67, 2],
      ['मर', 'mar', 'mur', 'die', 62, 1],
      ['जाएगी', 'jāegī', 'jah-AY-gee', 'will go (she will)', 60, 2],
    ],
  },
];

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const round3 = (x) => Math.round(x * 1000) / 1000;

function addTone(buf, start, dur, midi, gain, harmonics = [1, 0.4, 0.2]) {
  const a = Math.floor(start * SR);
  const n = Math.floor(dur * SR);
  const f = hz(midi);
  for (let i = 0; i < n && a + i < buf.length; i++) {
    const t = i / SR;
    const env = Math.min(1, t / 0.03) * Math.min(1, (dur - t) / 0.06);
    let s = 0;
    harmonics.forEach((h, k) => (s += h * Math.sin(2 * Math.PI * f * (k + 1) * t)));
    buf[a + i] += gain * env * s;
  }
}

function addPluck(buf, start, midi, gain) {
  const a = Math.floor(start * SR);
  const f = hz(midi);
  for (let i = 0; i < 0.5 * SR && a + i < buf.length; i++) {
    const t = i / SR;
    buf[a + i] += gain * Math.exp(-6 * t) * (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t));
  }
}

const toInt16 = (buf) => Int16Array.from(buf, (x) => Math.max(-32767, Math.min(32767, Math.round(x * 32767))));

function build() {
  const totalBeats = INTRO_BEATS + LINE_BEATS * LINES.length + 3;
  const durationSec = totalBeats * BEAT;
  const vocals = new Float32Array(Math.ceil(durationSec * SR));
  const backing = new Float32Array(vocals.length);
  const frames = new Array(Math.ceil(durationSec / HOP)).fill(null);
  const notes = [];

  const lines = LINES.map((line, index) => {
    const lineStart = (INTRO_BEATS + LINE_BEATS * index) * BEAT;
    let cursor = lineStart;
    const words = line.words.map(([text, romanized, phonetic, gloss, midi, beats]) => {
      const start = cursor;
      const sounding = beats * BEAT * 0.9;
      addTone(vocals, start, sounding, midi, 0.3);
      notes.push({ start: round3(start), end: round3(start + sounding), midi });
      for (let i = Math.ceil(start / HOP); i * HOP < start + sounding; i++) frames[i] = midi;
      cursor += beats * BEAT;
      return { text, romanized, phonetic, gloss, start: round3(start), end: round3(start + sounding) };
    });
    return {
      index,
      start: round3(lineStart),
      end: round3(lineStart + LINE_BEATS * BEAT),
      original: line.original,
      romanized: line.romanized,
      phonetic: line.phonetic,
      translation: line.translation,
      clipPath: `/media/${SLUG}/clips/line-${String(index).padStart(3, '0')}.wav`,
      words,
    };
  });

  // Backing: bass pluck on every beat, a quiet chord pad per bar.
  for (let b = 0; b < totalBeats - 1; b++) {
    addPluck(backing, b * BEAT, b % 4 === 0 ? 36 : b % 2 === 0 ? 43 : 48, 0.35);
    if (b % 4 === 0) for (const m of [60, 64, 67]) addTone(backing, b * BEAT, BEAT * 4, m - 12, 0.035, [1]);
  }
  return { durationSec, vocals, backing, frames, notes, lines };
}

async function main() {
  const { durationSec, vocals, backing, frames, notes, lines } = build();
  const dir = path.join(config.mediaDir, SLUG);
  await fs.mkdir(path.join(dir, 'clips'), { recursive: true });
  const vocalsPcm = toInt16(vocals);
  await fs.writeFile(path.join(dir, 'vocals.wav'), encodeWav(vocalsPcm, SR));
  await fs.writeFile(path.join(dir, 'instrumental.wav'), encodeWav(toInt16(backing), SR));
  await fs.writeFile(path.join(dir, 'pitch.json'), JSON.stringify({ hopSec: HOP, frames, notes }));
  for (const line of lines) {
    const clip = vocalsPcm.subarray(Math.floor(line.start * SR), Math.floor(line.end * SR));
    await fs.writeFile(path.join(config.mediaDir, line.clipPath.replace(/^\/media\//, '')), encodeWav(clip, SR));
  }

  await mongoose.connect(config.mongoUri);
  await Song.findOneAndUpdate(
    { slug: SLUG },
    {
      slug: SLUG,
      title: 'Machhli Jal Ki Rani Hai (demo)',
      artist: 'Traditional nursery rhyme',
      album: 'Stub audio',
      language: 'hi',
      durationSec: round3(durationSec),
      lyricsSource: { provider: 'manual', offsetMs: 0 },
      difficulty: {
        overall: 2,
        tempo: 2,
        range: 2,
        vocab: 2,
        grammar: 2,
        details: { bpm: 100, syllablesPerSec: 1.6, rangeSemitones: 9, note: 'Hand-written demo values' },
      },
      audio: { instrumental: `/media/${SLUG}/instrumental.wav`, vocals: `/media/${SLUG}/vocals.wav` },
      pitchContour: { path: `/media/${SLUG}/pitch.json`, hopSec: HOP },
      lines,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  console.log(`Seeded song "${SLUG}" (${lines.length} lines, ${durationSec.toFixed(1)} s) -> ${dir}`);

  const email = 'demo@musiglot.test';
  if (!(await User.exists({ email }))) {
    await User.create({ email, passwordHash: await bcrypt.hash('demo1234', 10) });
    console.log(`Seeded user ${email} / demo1234`);
  } else {
    console.log(`User ${email} already exists (password: demo1234)`);
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
