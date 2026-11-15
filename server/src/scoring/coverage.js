// Which lyric lines did the singer actually get to?
//
// The browser reports the stretches of the song it recorded ([[startSec, endSec], ...]).
// A take can start late, stop early, skip around or cover only a chosen section,
// so lines outside those stretches are left out of the grade instead of counting as zeros.
const MIN_FRACTION = 0.5; // at least half of a line must have been recorded

export function normalizeCoverage(raw, fallbackEndSec) {
  const ranges = (Array.isArray(raw) ? raw : [])
    .filter((r) => Array.isArray(r) && Number.isFinite(r[0]) && Number.isFinite(r[1]) && r[1] > r[0])
    .map(([a, b]) => [Math.max(0, a), b])
    .sort((x, y) => x[0] - y[0]);
  if (!ranges.length) return fallbackEndSec > 0 ? [[0, fallbackEndSec]] : [];
  const merged = [ranges[0].slice()];
  for (const [a, b] of ranges.slice(1)) {
    const last = merged[merged.length - 1];
    if (a <= last[1]) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  return merged;
}

export function attemptedLines(lines, coverage) {
  return lines.filter((line) => {
    const length = line.end - line.start;
    if (length <= 0) return false;
    const recorded = coverage.reduce((sum, [a, b]) => sum + Math.max(0, Math.min(b, line.end) - Math.max(a, line.start)), 0);
    return recorded / length >= MIN_FRACTION;
  });
}
