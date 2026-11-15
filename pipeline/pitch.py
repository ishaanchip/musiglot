"""Step 4: reference pitch contour from the vocal stem (librosa pYIN).

Output JSON: { hopSec, frames: [midi | null, ...], notes: [{start, end, midi}] }
frames[i] is the sung pitch at time i * hopSec (null = not singing). `notes`
groups frames into bars for the pitch lane.
"""
from __future__ import annotations

import numpy as np

SR = 22050
HOP = 512


def extract(y: np.ndarray, sr: int = SR) -> dict:
    import librosa
    from scipy.signal import medfilt

    f0, voiced, prob = librosa.pyin(y, fmin=librosa.note_to_hz("C2"), fmax=librosa.note_to_hz("C6"),
                                    sr=sr, frame_length=2048, hop_length=HOP)
    midi = librosa.hz_to_midi(np.where(np.isnan(f0), 1.0, f0))
    ok = voiced & (prob > 0.5) & ~np.isnan(f0)
    smooth = medfilt(np.where(ok, midi, 0.0), kernel_size=5)
    ok &= smooth > 0
    midi = np.where(ok, smooth, np.nan)

    # Drop blips shorter than 3 frames (~70 ms): usually breath or bleed, not notes.
    i, n = 0, len(midi)
    while i < n:
        if np.isnan(midi[i]):
            i += 1
            continue
        j = i
        while j < n and not np.isnan(midi[j]):
            j += 1
        if j - i < 3:
            midi[i:j] = np.nan
        i = j

    hop_sec = HOP / sr
    frames = [None if np.isnan(m) else round(float(m), 2) for m in midi]
    return {"hopSec": round(hop_sec, 6), "frames": frames, "notes": to_notes(midi, hop_sec)}


def to_notes(midi: np.ndarray, hop_sec: float, min_dur: float = 0.09) -> list[dict]:
    notes: list[dict] = []
    cur: dict | None = None
    vals: list[float] = []

    def close():
        if cur and cur["end"] - cur["start"] >= min_dur:
            notes.append({"start": round(cur["start"], 3), "end": round(cur["end"], 3), "midi": int(round(float(np.median(vals))))})

    for i, m in enumerate(midi):
        t = i * hop_sec
        if np.isnan(m):
            close()
            cur, vals = None, []
            continue
        if cur and abs(m - np.median(vals)) <= 0.7:
            cur["end"] = t + hop_sec
            vals.append(float(m))
        else:
            close()
            cur, vals = {"start": t, "end": t + hop_sec}, [float(m)]
    close()
    return notes
