import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '../..');
dotenv.config({ path: path.join(ROOT, '.env') });

const env = process.env;
export const config = {
  port: Number(env.PORT || 4000),
  mongoUri: env.MONGODB_URI || 'mongodb://127.0.0.1:27017/musiglot',
  jwtSecret: env.JWT_SECRET || 'dev-only-secret-change-me',
  mediaDir: path.resolve(ROOT, env.MEDIA_DIR || './media'),
  anthropicKey: env.ANTHROPIC_API_KEY || '',
  anthropicModel: env.ANTHROPIC_MODEL || 'claude-opus-5-5',
  azureKey: env.AZURE_SPEECH_KEY || '',
  azureRegion: env.AZURE_SPEECH_REGION || 'eastus',
  azureLocales: { es: env.AZURE_LOCALE_ES || 'es-MX', hi: env.AZURE_LOCALE_HI || 'hi-IN' },
  openaiKey: env.OPENAI_API_KEY || '',
  whisperModel: env.OPENAI_WHISPER_MODEL || 'whisper-1',
  pronunciationProvider: env.PRONUNCIATION_PROVIDER || 'auto',
  pythonBin: env.PYTHON_BIN || 'python3',
};
