import mongoose from 'mongoose';
import { config } from './config.js';
import { createApp } from './app.js';
import { pickProvider } from './scoring/pronunciation.js';

await mongoose.connect(config.mongoUri);
createApp().listen(config.port, () => {
  console.log(`API on http://localhost:${config.port}`);
  console.log(`  media dir:      ${config.mediaDir}`);
  console.log(`  pronunciation:  ${pickProvider()}${pickProvider() === 'estimate' ? ' (no AZURE_SPEECH_KEY / OPENAI_API_KEY: voicing estimate only)' : ''}`);
  console.log(`  feedback:       ${config.anthropicKey ? `Claude (${config.anthropicModel})` : 'templates (no ANTHROPIC_API_KEY)'}`);
  if (config.jwtSecret === 'dev-only-secret-change-me') console.log('  WARNING: JWT_SECRET is not set, using an insecure dev default');
});
