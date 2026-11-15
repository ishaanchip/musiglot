import { Router } from 'express';
import mongoose from 'mongoose';
import Song from '../models/Song.js';
import Attempt from '../models/Attempt.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const grades = (a) =>
  a && { attemptId: a._id, pronunciation: a.pronunciationScore, pitch: a.pitchScore, createdAt: a.createdAt };

// Catalog cards: song summary + this user's best and most recent grades.
router.get('/', async (req, res) => {
  const filter = ['es', 'hi'].includes(req.query.language) ? { language: req.query.language } : {};
  const songs = await Song.find(filter)
    .select('slug title artist album language durationSec difficulty')
    .sort({ 'difficulty.overall': 1, title: 1 })
    .lean();
  const attempts = await Attempt.find({
    userId: new mongoose.Types.ObjectId(req.userId),
    songId: { $in: songs.map((s) => s._id) },
  })
    .select('songId pronunciationScore pitchScore createdAt')
    .sort({ createdAt: -1 })
    .lean();

  const bySong = new Map();
  for (const a of attempts) {
    const key = a.songId.toString();
    const entry = bySong.get(key) || { recent: a, best: a, count: 0 };
    const total = (x) => (x.pronunciationScore ?? 0) + (x.pitchScore ?? 0);
    if (total(a) > total(entry.best)) entry.best = a;
    entry.count += 1;
    bySong.set(key, entry);
  }
  res.json({
    songs: songs.map((s) => {
      const e = bySong.get(s._id.toString());
      return { ...s, attempts: e?.count || 0, best: grades(e?.best) || null, recent: grades(e?.recent) || null };
    }),
  });
});

router.get('/:slug', async (req, res) => {
  const song = await Song.findOne({ slug: req.params.slug }).select('-lyricsSource.syncedLyrics').lean();
  if (!song) return res.status(404).json({ error: 'Song not found' });
  res.json({ song });
});

export default router;
