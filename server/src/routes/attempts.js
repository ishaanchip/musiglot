import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import multer from 'multer';
import Song from '../models/Song.js';
import Attempt from '../models/Attempt.js';
import { requireAuth } from '../middleware/auth.js';
import { config } from '../config.js';
import { parseWav } from '../scoring/wav.js';
import { scorePitch } from '../scoring/pitch.js';
import { scorePronunciation } from '../scoring/pronunciation.js';
import { writeFeedback } from '../scoring/feedback.js';

const router = Router();
router.use(requireAuth);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 80 * 1024 * 1024 } });

async function loadReferencePitch(song) {
  if (!song.pitchContour?.path) return null;
  // pitchContour.path is a URL path like /media/<slug>/pitch.json
  const rel = song.pitchContour.path.replace(/^\/media\//, '');
  const file = path.resolve(config.mediaDir, rel);
  if (!file.startsWith(config.mediaDir)) return null;
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

// multipart/form-data: songId, pitchTrack (JSON [[t, midi], ...]), recording (16 kHz mono WAV)
router.post('/', upload.single('recording'), async (req, res) => {
  const { songId } = req.body;
  if (!mongoose.isValidObjectId(songId)) return res.status(400).json({ error: 'songId is required' });
  const song = await Song.findById(songId).lean();
  if (!song) return res.status(404).json({ error: 'Song not found' });
  if (!req.file) return res.status(400).json({ error: 'recording is required' });

  let wav;
  let userTrack;
  try {
    wav = parseWav(req.file.buffer);
    userTrack = JSON.parse(req.body.pitchTrack || '[]');
    if (!Array.isArray(userTrack)) throw new Error('pitchTrack must be an array');
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const attemptId = new mongoose.Types.ObjectId();
  const recordingsDir = path.join(config.mediaDir, 'recordings');
  await fs.mkdir(recordingsDir, { recursive: true });
  const wavPath = path.join(recordingsDir, `${attemptId}.wav`);
  await fs.writeFile(wavPath, req.file.buffer);

  const reference = await loadReferencePitch(song);
  const pitch = scorePitch({ reference, userTrack, lines: song.lines });
  const pron = await scorePronunciation({ wav, wavBuffer: req.file.buffer, wavPath, song });

  const perLine = song.lines.map((line) => {
    const p = pitch.perLine.find((x) => x.index === line.index) || {};
    const q = pron.perLine.find((x) => x.index === line.index) || {};
    return {
      index: line.index,
      pronunciation: q.pronunciation ?? null,
      pitch: p.pitch ?? null,
      timingOffsetMs: p.timingOffsetMs ?? null,
      heard: q.heard || '',
      words: q.words || [],
    };
  });
  const result = {
    pronunciationScore: pron.score,
    pitchScore: pitch.score,
    pronunciationMethod: pron.method,
    transposition: pitch.transposition,
    perLine,
  };
  const feedback = await writeFeedback(song, result);

  const attempt = await Attempt.create({
    _id: attemptId,
    userId: req.userId,
    songId: song._id,
    ...result,
    feedback,
    recordingPath: `/media/recordings/${attemptId}.wav`,
  });
  res.status(201).json({ attempt, warning: pron.warning });
});

router.get('/', async (req, res) => {
  const filter = { userId: req.userId };
  if (mongoose.isValidObjectId(req.query.songId)) filter.songId = req.query.songId;
  const attempts = await Attempt.find(filter).select('-perLine').sort({ createdAt: -1 }).limit(50).lean();
  res.json({ attempts });
});

router.get('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Attempt not found' });
  const attempt = await Attempt.findOne({ _id: req.params.id, userId: req.userId }).lean();
  if (!attempt) return res.status(404).json({ error: 'Attempt not found' });
  const song = await Song.findById(attempt.songId).select('slug title artist language lines').lean();
  res.json({ attempt, song });
});

export default router;
