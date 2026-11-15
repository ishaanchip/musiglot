// Pitch + timing scoring.
//
// reference: { hopSec, frames: [midi|null, ...] }  (frame i is at time i*hopSec)
// userTrack: [[timeSec, midi], ...]                 (voiced frames only, from the browser)
//
// - Octave/key: users rarely sing in the original octave or key, so we find the
//   single transposition (mod 12) that best explains the whole take and compare
//   pitch classes after removing it.
// - Timing: a global lag absorbs device latency; each reference frame is then
//   matched against user frames within +/- TOLERANCE_SEC.

const TOLERANCE_SEC = 0.2;
const FULL_CREDIT_SEMITONES = 1.0; // within this error: full credit
const ZERO_CREDIT_SEMITONES = 3.0; // beyond this error: none
const MIN_REF_FRAMES = 5;

const mod12 = (x) => ((x % 12) + 12) % 12;
const circDist = (x) => {
  const m = mod12(x);
  return Math.min(m, 12 - m);
};

function lowerBound(track, t) {
  let lo = 0;
  let hi = track.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (track[mid][0] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function hasVoiceNear(track, t, tol) {
  const i = lowerBound(track, t - tol);
  return i < track.length && track[i][0] <= t + tol;
}

function nearest(track, t, tol) {
  const i = lowerBound(track, t);
  let best = null;
  for (const j of [i - 1, i]) {
    if (j < 0 || j >= track.length) continue;
    const d = Math.abs(track[j][0] - t);
    if (d <= tol && (!best || d < best.d)) best = { d, midi: track[j][1] };
  }
  return best;
}

/** Lag (seconds, user minus reference) that maximises voiced overlap. */
function bestLag(refFrames, track, maxLag, step = 0.025) {
  let best = { lag: 0, hits: -1 };
  for (let k = -Math.round(maxLag / step); k <= Math.round(maxLag / step); k++) {
    const lag = k * step;
    let hits = 0;
    for (const f of refFrames) if (hasVoiceNear(track, f.t + lag, 0.03)) hits++;
    // Prefer the smallest |lag| on ties so silence never produces a random lag.
    if (hits > best.hits || (hits === best.hits && Math.abs(lag) < Math.abs(best.lag))) best = { lag, hits };
  }
  return best.hits > 0 ? best.lag : 0;
}

/** Most common (user - reference) pitch-class offset, 0..12 semitones. */
function estimateTransposition(refFrames, track, lag) {
  const BINS = 48; // quarter-semitone bins
  const hist = new Float64Array(BINS);
  for (const f of refFrames) {
    const u = nearest(track, f.t + lag, 0.1);
    if (u) hist[Math.floor((mod12(u.midi - f.midi) / 12) * BINS) % BINS] += 1;
  }
  let best = 0;
  let bestVal = -1;
  for (let i = 0; i < BINS; i++) {
    // Smooth over +/- half a semitone.
    const v = hist[(i + BINS - 2) % BINS] * 0.5 + hist[(i + BINS - 1) % BINS] + hist[i] * 1.5 + hist[(i + 1) % BINS] + hist[(i + 2) % BINS] * 0.5;
    if (v > bestVal) {
      bestVal = v;
      best = i;
    }
  }
  return bestVal > 0 ? ((best + 0.5) / BINS) * 12 : 0;
}

function frameScore(track, t, refMidi, transposition) {
  let i = lowerBound(track, t - TOLERANCE_SEC);
  let bestErr = Infinity;
  for (; i < track.length && track[i][0] <= t + TOLERANCE_SEC; i++) {
    const err = circDist(track[i][1] - refMidi - transposition);
    if (err < bestErr) bestErr = err;
  }
  if (bestErr === Infinity) return 0; // nothing sung near this note
  if (bestErr <= FULL_CREDIT_SEMITONES) return 1;
  if (bestErr >= ZERO_CREDIT_SEMITONES) return 0;
  return 1 - (bestErr - FULL_CREDIT_SEMITONES) / (ZERO_CREDIT_SEMITONES - FULL_CREDIT_SEMITONES);
}

export function scorePitch({ reference, userTrack, lines }) {
  const hop = reference?.hopSec || 0.025;
  const track = (userTrack || [])
    .filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
    .sort((a, b) => a[0] - b[0]);
  const refFrames = [];
  (reference?.frames || []).forEach((midi, i) => {
    if (midi != null) refFrames.push({ t: i * hop, midi });
  });

  const globalLag = bestLag(refFrames, track, 0.3);
  const transposition = estimateTransposition(refFrames, track, globalLag);

  const perLine = lines.map((line) => {
    const frames = refFrames.filter((f) => f.t >= line.start && f.t < line.end);
    if (frames.length < MIN_REF_FRAMES) return { index: line.index, pitch: null, timingOffsetMs: null };
    let sum = 0;
    for (const f of frames) sum += frameScore(track, f.t + globalLag, f.midi, transposition);
    const sung = frames.some((f) => hasVoiceNear(track, f.t + globalLag, 0.5));
    const lineLag = sung ? bestLag(frames, track, 0.5) - globalLag : null;
    return {
      index: line.index,
      pitch: Math.round((sum / frames.length) * 100) / 10,
      timingOffsetMs: lineLag == null ? null : Math.round(lineLag * 1000),
    };
  });

  const scored = perLine.filter((l) => l.pitch != null);
  const overall = scored.length ? scored.reduce((s, l) => s + l.pitch, 0) / scored.length : 0;
  return {
    score: Math.round(overall * 10) / 10,
    transposition: Math.round(transposition * 10) / 10,
    globalLagMs: Math.round(globalLag * 1000),
    perLine,
  };
}
