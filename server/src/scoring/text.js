// Text helpers shared by the pronunciation fallbacks.

/** Lowercase, strip punctuation, keep letters/marks/digits (works for Devanagari too). */
export function normalize(text) {
  return (text || '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Like normalize, but also folds accents so "corazón" matches "corazon". */
export function fold(text) {
  return normalize(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC');
}

export function levenshtein(a, b) {
  const s = Array.from(a);
  const t = Array.from(b);
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  let prev = Array.from({ length: t.length + 1 }, (_, i) => i);
  for (let i = 1; i <= s.length; i++) {
    const cur = [i];
    for (let j = 1; j <= t.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[t.length];
}

/** 0..1 similarity between two strings (accent- and punctuation-insensitive). */
export function similarity(a, b) {
  const x = fold(a);
  const y = fold(b);
  const len = Math.max(Array.from(x).length, Array.from(y).length);
  return len ? 1 - levenshtein(x, y) / len : 1;
}
