import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import authRoutes from './routes/auth.js';
import songRoutes from './routes/songs.js';
import attemptRoutes from './routes/attempts.js';
import ttsRoutes from './routes/tts.js';
import { pickProvider } from './scoring/pronunciation.js';

// Express 4 does not catch rejected promises from async handlers.
const wrapAsync = (router) => {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    for (const l of layer.route.stack) {
      const fn = l.handle;
      l.handle = (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
    }
  }
  return router;
};

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));
  app.use('/media', express.static(config.mediaDir, { maxAge: '1h' }));

  app.get('/api/health', (req, res) =>
    res.json({ ok: true, pronunciationProvider: pickProvider(), llmFeedback: Boolean(config.anthropicKey), cloudTts: Boolean(config.azureKey) })
  );
  app.use('/api/auth', wrapAsync(authRoutes));
  app.use('/api/songs', wrapAsync(songRoutes));
  app.use('/api/attempts', wrapAsync(attemptRoutes));
  app.use('/api/tts', wrapAsync(ttsRoutes));

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : err.status || 500;
    res.status(status).json({ error: status === 500 ? 'Something went wrong on the server' : err.message });
  });
  return app;
}
