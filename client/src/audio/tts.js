// "Hear it spoken (slow)". Default: the browser's speechSynthesis.
// To swap in cloud TTS, set VITE_TTS_PROVIDER=azure (served by GET /api/tts,
// needs AZURE_SPEECH_KEY on the server) or add another provider here.
import { getToken, LANGUAGES } from '../api.js';

let currentAudio = null;

export function stopSpeaking() {
  window.speechSynthesis?.cancel();
  currentAudio?.pause();
  currentAudio = null;
}

function speakBrowser(text, language, slow) {
  const synth = window.speechSynthesis;
  if (!synth) return { ok: false, message: 'This browser has no built-in text-to-speech.' };
  const locale = LANGUAGES[language]?.speech || language;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = locale;
  utterance.rate = slow ? 0.6 : 1;
  const voices = synth.getVoices();
  const voice = voices.find((v) => v.lang === locale) || voices.find((v) => v.lang?.toLowerCase().startsWith(language));
  if (voice) utterance.voice = voice;
  synth.cancel();
  synth.speak(utterance);
  // Voices load lazily, so an empty list is not proof that none exists.
  if (!voice && voices.length) {
    return { ok: true, message: `No ${LANGUAGES[language]?.name} voice is installed in this browser, so this may sound wrong. Chrome ships one.` };
  }
  return { ok: true };
}

async function speakCloud(text, language, slow) {
  const res = await fetch(`/api/tts?lang=${language}&slow=${slow ? 1 : 0}&text=${encodeURIComponent(text)}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error(`Cloud TTS failed (${res.status})`);
  currentAudio = new Audio(URL.createObjectURL(await res.blob()));
  await currentAudio.play();
  return { ok: true };
}

/** @returns {Promise<{ok: boolean, message?: string}>} */
export async function speak(text, language, { slow = true } = {}) {
  stopSpeaking();
  if (import.meta.env.VITE_TTS_PROVIDER === 'azure') {
    try {
      return await speakCloud(text, language, slow);
    } catch (err) {
      const result = speakBrowser(text, language, slow);
      return { ...result, message: `${err.message}; used the browser voice instead.` };
    }
  }
  return speakBrowser(text, language, slow);
}
