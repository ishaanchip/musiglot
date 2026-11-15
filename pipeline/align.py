"""Step 2: alignment.

LRCLIB gives line-level timing. This module
  1. checks that timing against the actual vocal stem and applies a global shift
     if it is consistently off,
  2. produces word-level timestamps inside each line's window, and
  3. aligns whole lines from scratch when there are no synced lyrics.

Word timing comes from Whisper word timestamps matched to the lyric tokens
(ASR text is only used to locate words, never to replace them). Without an ASR
provider it falls back to spreading words across the sung part of the line by
syllable count.
"""
from __future__ import annotations

from difflib import SequenceMatcher

import numpy as np

from common import count_syllables, normalize, tokenize

WINDOW_PAD = 1.0  # seconds of slack around a line's LRCLIB window
MATCH_THRESHOLD = 0.5


# ---------- energy envelope ----------

def energy_envelope(y: np.ndarray, sr: int, hop: int = 512) -> tuple[np.ndarray, np.ndarray]:
    import librosa

    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=hop)[0]
    times = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=hop)
    return rms, times


def _mean_between(rms, times, a, b):
    i, j = np.searchsorted(times, [a, b])
    return float(rms[i:j].mean()) if j > i else 0.0


def onset_score(starts, rms, times, shift: float) -> float:
    """How much vocal energy rises right at the (shifted) line starts."""
    span = 0.4
    scores = [_mean_between(rms, times, s + shift, s + shift + span) - _mean_between(rms, times, s + shift - span, s + shift) for s in starts]
    return float(np.mean(scores)) if scores else 0.0


def detect_global_offset(lines: list[dict], rms, times, max_shift: float = 3.0) -> tuple[float, dict]:
    """Returns (shift_seconds, report). The shift is 0 unless a different
    alignment explains the vocal onsets clearly better than the LRCLIB timing."""
    starts = [l["start"] for l in lines]
    shifts = np.round(np.arange(-max_shift, max_shift + 1e-9, 0.05), 2)
    scores = np.array([onset_score(starts, rms, times, s) for s in shifts])
    best = int(scores.argmax())
    at_zero = float(scores[np.abs(shifts).argmin()])
    scale = float(rms.mean()) or 1e-9
    report = {"bestShift": float(shifts[best]), "bestScore": float(scores[best]) / scale, "scoreAtZero": at_zero / scale}
    clearly_better = scores[best] - at_zero > 0.15 * scale and scores[best] > 1.25 * max(at_zero, 0)
    shift = float(shifts[best]) if abs(shifts[best]) >= 0.15 and clearly_better else 0.0
    return shift, report


def voiced_bounds(rms, times, start: float, end: float) -> tuple[float, float]:
    """First/last moment inside [start, end] where the vocal is clearly present."""
    i, j = np.searchsorted(times, [start, end])
    if j <= i:
        return start, end
    seg = rms[i:j]
    thresh = max(0.25 * float(seg.max()), 0.1 * float(rms.mean()))
    idx = np.nonzero(seg >= thresh)[0]
    if len(idx) == 0:
        return start, end
    return float(times[i + idx[0]]), float(min(end, times[i + idx[-1]] + 0.05))


def voiced_segments(rms, times, min_gap: float = 0.35, min_len: float = 0.3) -> list[tuple[float, float]]:
    thresh = 0.35 * float(np.median(rms[rms > 0.1 * rms.max()])) if rms.max() > 0 else 0
    on = rms >= thresh
    segs: list[list[float]] = []
    for t, v in zip(times, on):
        if not v:
            continue
        if segs and t - segs[-1][1] <= min_gap:
            segs[-1][1] = float(t)
        else:
            segs.append([float(t), float(t)])
    return [(a, b) for a, b in segs if b - a >= min_len]


# ---------- token matching ----------

def _sim(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio()


def match_tokens(tokens: list[str], asr: list[dict]) -> list[int | None]:
    """Monotonic alignment of lyric tokens to ASR words (weighted LCS).
    Returns, per token, the index of the matching ASR word or None."""
    a = [normalize(t) for t in tokens]
    b = [normalize(w["word"]) for w in asr]
    n, m = len(a), len(b)
    if not n or not m:
        return [None] * n
    score = np.zeros((n + 1, m + 1))
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            s = _sim(a[i - 1], b[j - 1]) if a[i - 1] and b[j - 1] else 0.0
            diag = score[i - 1, j - 1] + (s - MATCH_THRESHOLD + 0.01 if s >= MATCH_THRESHOLD else -1.0)
            score[i, j] = max(diag, score[i - 1, j], score[i, j - 1])
    out: list[int | None] = [None] * n
    i, j = n, m
    while i > 0 and j > 0:
        if score[i, j] == score[i - 1, j]:
            i -= 1
        elif score[i, j] == score[i, j - 1]:
            j -= 1
        else:
            out[i - 1] = j - 1
            i -= 1
            j -= 1
    return out


def fill_times(tokens: list[str], known: list[tuple[float, float] | None], lo: float, hi: float) -> list[tuple[float, float]]:
    """Gives every token a (start, end): keeps known times, spreads runs of
    unknown tokens across the gap between their neighbours by syllable count,
    and forces the result to be monotonic inside [lo, hi]."""
    n = len(tokens)
    out: list[tuple[float, float] | None] = list(known)
    i = 0
    while i < n:
        if out[i] is not None:
            i += 1
            continue
        j = i
        while j < n and out[j] is None:
            j += 1
        left = out[i - 1][1] if i > 0 else lo
        right = out[j][0] if j < n else hi
        right = max(right, left)
        weights = [count_syllables(t) for t in tokens[i:j]]
        total = sum(weights)
        t = left
        for k, w in enumerate(weights):
            dur = (right - left) * w / total
            out[i + k] = (t, t + dur)
            t += dur
        i = j
    fixed = []
    prev = lo
    for s, e in out:  # type: ignore[misc]
        s = min(max(s, prev, lo), hi)
        e = min(max(e, s), hi)
        fixed.append((round(s, 3), round(e, 3)))
        prev = s
    return fixed


# ---------- public API ----------

def align_words(lines: list[dict], asr: list[dict] | None, rms, times, duration: float) -> dict:
    """Adds line['words'] = [{text, start, end}] to each line. Returns stats."""
    matched = total = 0
    for line in lines:
        tokens = tokenize(line["text"])
        lo, hi = voiced_bounds(rms, times, line["start"], line["end"])
        known: list[tuple[float, float] | None] = [None] * len(tokens)
        if asr:
            w_lo, w_hi = max(0.0, line["start"] - WINDOW_PAD), min(duration, line["end"] + WINDOW_PAD)
            cands = [w for w in asr if w_lo <= (w["start"] + w["end"]) / 2 <= w_hi]
            for ti, ci in enumerate(match_tokens(tokens, cands)):
                if ci is not None:
                    known[ti] = (cands[ci]["start"], cands[ci]["end"])
                    matched += 1
            hits = [k for k in known if k]
            if hits:  # let confident ASR times stretch the window (within the pad)
                lo, hi = min(lo, hits[0][0]), max(hi, hits[-1][1])
        total += len(tokens)
        spans = fill_times(tokens, known, lo, hi)
        line["words"] = [{"text": t, "start": s, "end": e} for t, (s, e) in zip(tokens, spans)]
    return {"words": total, "matchedByAsr": matched}


def align_lines_from_scratch(texts: list[str], asr: list[dict] | None, rms, times, duration: float) -> list[dict]:
    """No synced lyrics: place whole lines on the timeline."""
    line_tokens = [tokenize(t) for t in texts]
    flat = [tok for toks in line_tokens for tok in toks]
    segs = voiced_segments(rms, times) or [(0.0, duration)]
    lo, hi = segs[0][0], segs[-1][1]

    if asr:
        idx = match_tokens(flat, asr)
        known = [(asr[i]["start"], asr[i]["end"]) if i is not None else None for i in idx]
        spans = fill_times(flat, known, lo, hi)
    else:
        # Map cumulative syllables onto cumulative voiced time.
        seg_len = np.array([b - a for a, b in segs])
        cum = np.concatenate([[0.0], np.cumsum(seg_len)])

        def at(frac: float) -> float:
            target = frac * cum[-1]
            k = min(int(np.searchsorted(cum, target, side="right")) - 1, len(segs) - 1)
            return float(segs[k][0] + (target - cum[k]))

        weights = np.array([count_syllables(t) for t in flat], dtype=float)
        edges = np.concatenate([[0.0], np.cumsum(weights)]) / weights.sum()
        spans = [(round(at(edges[i]), 3), round(at(edges[i + 1]), 3)) for i in range(len(flat))]

    lines, k = [], 0
    for text, toks in zip(texts, line_tokens):
        w = spans[k:k + len(toks)]
        k += len(toks)
        lines.append({"start": w[0][0], "end": w[-1][1], "text": text,
                      "words": [{"text": t, "start": s, "end": e} for t, (s, e) in zip(toks, w)]})
    for i, line in enumerate(lines):  # a line runs until the next one starts
        line["end"] = lines[i + 1]["start"] if i + 1 < len(lines) else min(duration, line["end"] + 1.0)
        if line["end"] <= line["start"]:
            line["end"] = round(line["start"] + 0.5, 3)
    return lines
