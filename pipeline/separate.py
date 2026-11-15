"""OPTIONAL HOOK (not implemented): vocal separation.

Version 1 expects pre-separated `instrumental.mp3` and `vocals.mp3` in the song
folder. To support dropping in a single mixed track later, implement
`separate()` below (for example with Demucs:
`demucs --two-stems=vocals -o <tmp> mix.mp3`, then copy `vocals.wav` and
`no_vocals.wav` into the song folder as `vocals.*` / `instrumental.*`).
process_song.py already calls this when the stems are missing and a
`mix.*` file is present, so no other code needs to change.
"""
from __future__ import annotations

from pathlib import Path


def separate(mix: Path, song_dir: Path) -> None:
    raise NotImplementedError(
        f"Vocal separation is not built yet. Found {mix.name} but no stems: add instrumental.mp3 and vocals.mp3 "
        f"to {song_dir}, or implement pipeline/separate.py (Demucs hook)."
    )
