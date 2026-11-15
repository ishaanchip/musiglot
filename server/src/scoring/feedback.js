// Turns per-line results into 2-3 "went well" and 2-3 "improve" bullets.
// Uses Claude when ANTHROPIC_API_KEY is set, otherwise deterministic templates.
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

const clean = (list) =>
  (Array.isArray(list) ? list : [])
    .filter((s) => typeof s === 'string' && s.trim())
    .map((s) => s.trim())
    .slice(0, 3);

function summarize(song, result) {
  return result.perLine.map((r) => {
    const line = song.lines.find((l) => l.index === r.index) || {};
    return {
      line: r.index + 1,
      text: line.original,
      romanized: line.romanized || undefined,
      translation: line.translation || undefined,
      pronunciation: r.pronunciation,
      pitch: r.pitch,
      timingOffsetMs: r.timingOffsetMs,
      heard: r.heard || undefined,
      weakWords: (r.words || []).filter((w) => w.score < 6).map((w) => w.text),
    };
  });
}

export function templateFeedback(song, result) {
  const label = (r) => {
    const line = song.lines.find((l) => l.index === r.index);
    const text = line?.romanized || line?.original || '';
    return `line ${r.index + 1} ("${text}")`;
  };
  const total = (r) => (r.pronunciation ?? 0) + (r.pitch ?? 0);
  const sung = result.perLine.filter((r) => (r.pronunciation ?? 0) > 0 || (r.pitch ?? 0) > 0);
  const ranked = [...sung].sort((a, b) => total(b) - total(a));
  const wentWell = [];
  const improve = [];

  if (!sung.length) {
    return {
      wentWell: ['You made it through the whole track. Now try singing along out loud.'],
      improve: ['We could not hear any singing. Check that your microphone is allowed and not muted.', 'Wear headphones and sing a little louder than feels natural.'],
    };
  }
  if (ranked[0]) wentWell.push(`Your strongest moment was ${label(ranked[0])}.`);
  const bestPitch = [...sung].filter((r) => r.pitch != null).sort((a, b) => b.pitch - a.pitch)[0];
  if (bestPitch && bestPitch.pitch >= 6 && bestPitch !== ranked[0]) wentWell.push(`You followed the melody well on ${label(bestPitch)}.`);
  if (result.pitchScore >= 7) wentWell.push('Your pitch tracked the melody closely overall.');
  else if (result.pronunciationScore >= 7 && result.pronunciationMethod !== 'estimate') wentWell.push('Your pronunciation was clear across most of the song.');
  else wentWell.push(`You sang ${sung.length} of ${result.perLine.length} lines. Keep going.`);

  const worst = ranked[ranked.length - 1];
  if (worst && worst !== ranked[0] && total(worst) < 14) {
    const weak = (worst.words || []).filter((w) => w.score < 6).map((w) => `"${w.text}"`).slice(0, 3);
    improve.push(weak.length ? `On ${label(worst)}, slow down and practice ${weak.join(', ')}.` : `Replay ${label(worst)} with "Hear it sung" and try it again.`);
  }
  const offBeat = sung.filter((r) => Math.abs(r.timingOffsetMs ?? 0) >= 200).sort((a, b) => Math.abs(b.timingOffsetMs) - Math.abs(a.timingOffsetMs))[0];
  if (offBeat) improve.push(`You came in ${offBeat.timingOffsetMs > 0 ? 'late' : 'early'} on ${label(offBeat)} (about ${Math.abs(offBeat.timingOffsetMs)} ms).`);
  const missed = result.perLine.filter((r) => !sung.includes(r));
  if (missed.length) improve.push(`You skipped ${missed.length} line${missed.length > 1 ? 's' : ''}, starting with ${label(missed[0])}.`);
  if (!improve.length) improve.push('No weak spots this time. Try a harder song, or sing without looking at the phonetic hints.');
  if (improve.length < 2) improve.push('Use "Hear it spoken (slow)" on the lines you find hardest before your next take.');

  return { wentWell: clean(wentWell), improve: clean(improve) };
}

async function llmFeedback(song, result) {
  const client = new Anthropic({ apiKey: config.anthropicKey });
  const prompt = `A native English speaker is learning ${song.language === 'hi' ? 'Hindi' : 'Spanish'} by singing along to "${song.title}" by ${song.artist}.
Scores are 0-10. Overall pronunciation: ${result.pronunciationScore}. Overall pitch and timing: ${result.pitchScore}.
Pronunciation scoring method: ${result.pronunciationMethod}${result.pronunciationMethod === 'estimate' ? ' (only detects whether they were singing, so do not make claims about specific sounds)' : ''}.
timingOffsetMs is positive when they came in late and negative when early. A null score means the line was not scorable.
They sang ${result.linesAttempted ?? result.perLine.length} of the song's ${result.linesTotal ?? result.perLine.length} lines in this take; only those lines are listed and graded. Practicing a section is normal, so do not criticize them for the lines they did not sing.

Per-line results:
${JSON.stringify(summarize(song, result))}

Write feedback for the learner: 2-3 "wentWell" bullets and 2-3 "improve" bullets. Each bullet is one short sentence, specific and encouraging, and names an actual line number, word, or phrase from the lyrics. For pronunciation tips, say how to make the sound in terms an English speaker understands.
Reply with only a JSON object: {"wentWell": ["..."], "improve": ["..."]}`;

  const response = await client.messages.create({
    model: config.anthropicModel,
    max_tokens: 4000,
    output_config: { effort: 'low' },
    messages: [{ role: 'user', content: prompt }],
  });
  if (response.stop_reason === 'refusal') throw new Error('model declined the request');
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('no JSON in model reply');
  const parsed = JSON.parse(match[0]);
  const feedback = { wentWell: clean(parsed.wentWell), improve: clean(parsed.improve) };
  if (!feedback.wentWell.length || !feedback.improve.length) throw new Error('model reply was missing bullets');
  return feedback;
}

export async function writeFeedback(song, result) {
  if (config.anthropicKey) {
    try {
      return await llmFeedback(song, result);
    } catch (err) {
      console.error('[feedback] LLM feedback failed, using templates:', err.message);
    }
  }
  return templateFeedback(song, result);
}
