import mongoose from 'mongoose';

// NOTE: pipeline/db.py writes documents of this shape directly with pymongo.
// Keep the two in sync when changing fields.
const wordSchema = new mongoose.Schema(
  {
    text: String,
    romanized: { type: String, default: '' },
    phonetic: { type: String, default: '' },
    gloss: { type: String, default: '' },
    start: Number, // seconds; may be null if alignment failed
    end: Number,
  },
  { _id: false }
);

const lineSchema = new mongoose.Schema(
  {
    index: Number,
    start: Number,
    end: Number,
    original: String,
    romanized: { type: String, default: '' },
    phonetic: { type: String, default: '' },
    translation: { type: String, default: '' },
    clipPath: String,
    words: [wordSchema],
  },
  { _id: false }
);

const songSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true },
    title: String,
    artist: String,
    album: String,
    language: { type: String, enum: ['es', 'hi'], required: true, index: true },
    durationSec: Number,
    lyricsSource: {
      provider: { type: String, enum: ['lrclib', 'manual'] },
      lrclibId: Number,
      syncedLyrics: String,
      offsetMs: { type: Number, default: 0 },
    },
    difficulty: {
      overall: Number,
      tempo: Number,
      range: Number,
      vocab: Number,
      grammar: Number,
      details: mongoose.Schema.Types.Mixed, // raw measurements (bpm, syllables/sec, ...)
    },
    audio: { instrumental: String, vocals: String }, // URL paths under /media
    pitchContour: { path: String, hopSec: Number }, // JSON file: { hopSec, frames[], notes[] }
    lines: [lineSchema],
  },
  { timestamps: true }
);

export default mongoose.model('Song', songSchema);
