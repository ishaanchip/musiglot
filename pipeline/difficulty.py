"""Step 6: difficulty 1-10 with stored sub-scores so the UI can explain it."""
from __future__ import annotations

import numpy as np

from common import count_syllables, normalize, tokenize


def scale(x: float, lo: float, hi: float) -> float:
    """Maps lo..hi linearly onto 1..10 (clamped)."""
    return float(np.clip(1 + 9 * (x - lo) / (hi - lo), 1, 10))


def tempo_bpm(instrumental_y, sr: int) -> float:
    import librosa

    tempo, _ = librosa.beat.beat_track(y=instrumental_y, sr=sr)
    return float(np.atleast_1d(tempo)[0])


def vocab_rarity(lines: list[str], language: str) -> tuple[float, list[str]]:
    """Mean rarity of the distinct words (0 = very common, ~5+ = very rare)
    and the rarest few. Uses wordfreq Zipf frequencies when installed."""
    words = sorted({w for line in lines for w in normalize(line).split() if w})
    if not words:
        return 0.0, []
    try:
        from wordfreq import zipf_frequency

        rarity = {w: 7.0 - zipf_frequency(w, language) for w in words}
    except Exception as err:  # not installed or language data missing
        print(f"[difficulty] wordfreq unavailable ({err}); estimating rarity from word length")
        rarity = {w: min(6.0, len(w) / 2) for w in words}
    rarest = sorted(rarity, key=rarity.get, reverse=True)[:5]
    return float(np.mean(list(rarity.values()))), rarest


def compute(lines: list[dict], pitch: dict, bpm: float, language: str, grammar: int, grammar_notes: str = "") -> dict:
    sung_time = sum(max(0.0, l["words"][-1]["end"] - l["words"][0]["start"]) if l.get("words") else l["end"] - l["start"] for l in lines)
    syllables = sum(count_syllables(t) for l in lines for t in tokenize(l["original"]))
    sps = syllables / sung_time if sung_time > 0 else 0.0

    voiced = np.array([m for m in pitch["frames"] if m is not None])
    range_semitones = float(np.percentile(voiced, 95) - np.percentile(voiced, 5)) if len(voiced) else 0.0
    notes = pitch["notes"]
    steps = [abs(b["midi"] - a["midi"]) for a, b in zip(notes, notes[1:]) if b["start"] - a["end"] < 0.5]
    jump_rate = float(np.mean([s >= 4 for s in steps])) if steps else 0.0

    rarity, rarest = vocab_rarity([l["original"] for l in lines], language)

    tempo = 0.7 * scale(sps, 1.5, 5.0) + 0.3 * scale(bpm, 70, 170)
    rng = 0.6 * scale(range_semitones, 5, 20) + 0.4 * scale(jump_rate, 0.0, 0.35)
    vocab = scale(rarity, 1.5, 4.0)
    overall = 0.3 * tempo + 0.2 * rng + 0.25 * vocab + 0.25 * grammar
    r1 = lambda x: round(float(x), 1)  # noqa: E731
    return {
        "overall": int(round(overall)), "tempo": r1(tempo), "range": r1(rng), "vocab": r1(vocab), "grammar": int(grammar),
        "details": {
            "bpm": r1(bpm), "syllablesPerSec": round(sps, 2), "rangeSemitones": r1(range_semitones),
            "bigJumpRate": round(jump_rate, 2), "meanWordRarity": round(rarity, 2), "rarestWords": rarest,
            "grammarNotes": grammar_notes,
            "weights": {"tempo": 0.3, "range": 0.2, "vocab": 0.25, "grammar": 0.25},
        },
    }
