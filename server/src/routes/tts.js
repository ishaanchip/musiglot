// Optional cloud TTS (Azure). The client uses browser speechSynthesis by default
// and only calls this when VITE_TTS_PROVIDER=azure.
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { config } from '../config.js';

const router = Router();
const VOICES = { es: ['es-MX', 'es-MX-DaliaNeural'], hi: ['hi-IN', 'hi-IN-SwaraNeural'] };
const escapeXml = (s) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);

router.get('/', requireAuth, async (req, res) => {
  if (!config.azureKey) return res.status(501).json({ error: 'Cloud TTS is not configured (set AZURE_SPEECH_KEY)' });
  const text = String(req.query.text || '').slice(0, 500);
  const [locale, voice] = VOICES[req.query.lang] || VOICES.es;
  if (!text) return res.status(400).json({ error: 'text is required' });
  const rate = req.query.slow === '0' ? '0%' : '-35%';
  const ssml = `<speak version="1.0" xml:lang="${locale}"><voice name="${voice}"><prosody rate="${rate}">${escapeXml(text)}</prosody></voice></speak>`;
  const upstream = await fetch(`https://${config.azureRegion}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': config.azureKey,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      'User-Agent': 'musiglot',
    },
    body: ssml,
  });
  if (!upstream.ok) return res.status(502).json({ error: `Azure TTS returned ${upstream.status}` });
  res.set('Content-Type', 'audio/mpeg');
  res.send(Buffer.from(await upstream.arrayBuffer()));
});

export default router;
