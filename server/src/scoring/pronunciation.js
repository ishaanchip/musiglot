// Per-line pronunciation scoring.
//
// Providers (PRONUNCIATION_PROVIDER, default "auto"):
//   azure    - Azure Speech Pronunciation Assessment against the reference text (best)
//   openai   - Whisper API transcription + text similarity to the reference
//   local    - same, but with local faster-whisper via pipeline/asr.py
//   estimate - no recognizer: only checks that the user was vocalizing during
//              the line. NOT real pronunciation scoring; the UI labels it.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { config, ROOT } from '../config.js';
import { encodeWav, rms, sliceSamples } from './wav.js';
import { fold, normalize, similarity } from './text.js';

const PAD_SEC = 0.3;
const SILENCE_RMS = 0.004;
const round1 = (x) => Math.round(x * 10) / 10;

export function pickProvider() {
  const p = config.pronunciationProvider;
  if (p && p !== 'auto') return p;
  if (config.azureKey) return 'azure';
  if (config.openaiKey) return 'openai';
  return 'estimate';
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    })
  );
  return out;
}

const notSung = (line) => ({ index: line.index, pronunciation: 0, heard: '', words: [] });

// ---------- Azure ----------

async function azureLine(line, samples, sampleRate, locale) {
  const params = Buffer.from(
    JSON.stringify({ ReferenceText: line.original, GradingSystem: 'HundredMark', Granularity: 'Word', Dimension: 'Comprehensive' })
  ).toString('base64');
  const url = `https://${config.azureRegion}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${locale}&format=detailed`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': config.azureKey,
      'Content-Type': `audio/wav; codecs=audio/pcm; samplerate=${sampleRate}`,
      Accept: 'application/json',
      'Pronunciation-Assessment': params,
    },
    body: encodeWav(samples, sampleRate),
  });
  if (!res.ok) throw new Error(`Azure Speech returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  const best = json.NBest?.[0];
  if (json.RecognitionStatus !== 'Success' || !best) return notSung(line);
  // The REST API returns scores either flat or under PronunciationAssessment.
  const pa = best.PronunciationAssessment || best;
  return {
    index: line.index,
    pronunciation: round1((pa.PronScore ?? pa.AccuracyScore ?? 0) / 10),
    heard: best.Display || best.Lexical || '',
    words: (best.Words || []).map((w) => {
      const wpa = w.PronunciationAssessment || w;
      return { text: w.Word, score: round1((wpa.AccuracyScore ?? 0) / 10), errorType: wpa.ErrorType || 'None' };
    }),
  };
}

async function scoreAzure(wav, song) {
  const locale = config.azureLocales[song.language] || 'es-MX';
  return mapLimit(song.lines, 4, async (line) => {
    // The short-audio REST endpoint accepts up to 30 s per request.
    const end = Math.min(line.end + PAD_SEC, line.start + 29);
    const samples = sliceSamples(wav, line.start - PAD_SEC, end);
    if (rms(samples) < SILENCE_RMS) return notSung(line);
    return azureLine(line, samples, wav.sampleRate, locale);
  });
}

// ---------- Whisper (OpenAI API or local) + text similarity ----------

async function transcribeOpenAI(wavBuffer, language) {
  const form = new FormData();
  form.append('file', new Blob([wavBuffer], { type: 'audio/wav' }), 'recording.wav');
  form.append('model', config.whisperModel);
  form.append('language', language);
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.openaiKey}` },
    body: form,
  });
  if (!res.ok) throw new Error(`OpenAI transcription returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  return (json.words || []).map((w) => ({ word: w.word, start: w.start, end: w.end }));
}

function transcribeLocal(wavPath, language) {
  return new Promise((resolve, reject) => {
    const script = path.join(ROOT, 'pipeline', 'asr.py');
    const child = spawn(config.pythonBin, [script, wavPath, '--language', language, '--provider', 'local']);
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`pipeline/asr.py failed: ${err.slice(-300)}`));
      try {
        resolve(JSON.parse(out));
      } catch {
        reject(new Error('pipeline/asr.py did not print JSON'));
      }
    });
  });
}

/** Compare what the recognizer heard in each line's window to the reference text. */
export function scoreFromTranscript(asrWords, song) {
  return song.lines.map((line) => {
    const heardWords = asrWords.filter((w) => {
      const mid = (w.start + w.end) / 2;
      return mid >= line.start - PAD_SEC && mid < line.end + PAD_SEC;
    });
    if (!heardWords.length) return notSung(line);
    const heard = heardWords.map((w) => w.word.trim()).join(' ');
    const heardTokens = fold(heard).split(' ').filter(Boolean);
    const refTokens = normalize(line.original).split(' ').filter(Boolean);
    const words = refTokens.map((text) => {
      const best = heardTokens.reduce((m, h) => Math.max(m, similarity(text, h)), 0);
      return { text, score: round1(best * 10), errorType: best >= 0.8 ? 'None' : best >= 0.5 ? 'Mispronunciation' : 'Omission' };
    });
    // Blend whole-line similarity (order matters) with per-word matches.
    const lineSim = similarity(line.original, heard);
    const wordSim = words.length ? words.reduce((s, w) => s + w.score, 0) / (10 * words.length) : lineSim;
    return { index: line.index, pronunciation: round1(10 * (0.5 * lineSim + 0.5 * wordSim)), heard, words };
  });
}

// ---------- Estimate (no recognizer available) ----------

function scoreEstimate(wav, song) {
  const frame = Math.round(wav.sampleRate * 0.05);
  return song.lines.map((line) => {
    const samples = sliceSamples(wav, line.start, line.end);
    if (samples.length < frame) return notSung(line);
    let voiced = 0;
    let total = 0;
    for (let i = 0; i + frame <= samples.length; i += frame, total++) {
      if (rms(samples.subarray(i, i + frame)) > SILENCE_RMS * 2) voiced++;
    }
    // Lines are rarely voiced edge to edge; ~60% coverage counts as fully sung.
    return { index: line.index, pronunciation: round1(10 * Math.min(1, voiced / total / 0.6)), heard: '', words: [] };
  });
}

// ---------- Entry point ----------

/**
 * @returns {{ method: string, score: number, perLine: object[], warning?: string }}
 */
export async function scorePronunciation({ wav, wavBuffer, wavPath, song }) {
  let method = pickProvider();
  let perLine;
  let warning;
  try {
    if (method === 'azure') perLine = await scoreAzure(wav, song);
    else if (method === 'openai') perLine = scoreFromTranscript(await transcribeOpenAI(wavBuffer, song.language), song);
    else if (method === 'local') perLine = scoreFromTranscript(await transcribeLocal(wavPath, song.language), song);
  } catch (err) {
    // Never lose an attempt because a cloud call failed: fall back and say so.
    console.error(`[pronunciation] ${method} failed, falling back to estimate:`, err.message);
    warning = `${method} scoring failed (${err.message}); showing a rough estimate instead.`;
    perLine = null;
  }
  if (!perLine) {
    method = 'estimate';
    perLine = scoreEstimate(wav, song);
  }
  const score = perLine.length ? perLine.reduce((s, l) => s + (l.pronunciation ?? 0), 0) / perLine.length : 0;
  return { method, score: round1(score), perLine, warning };
}
