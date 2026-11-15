"""Step 5: cut one audio clip per line from the vocal stem ("Hear it sung")."""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

PAD = 0.15  # seconds of context on each side


def cut_line_clips(vocals: Path, lines: list[dict], out_dir: Path, y=None, sr: int | None = None) -> list[str]:
    """Writes clips and returns their file names (mp3 via ffmpeg, else wav)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("line-*"):
        old.unlink()
    use_ffmpeg = shutil.which("ffmpeg") is not None
    names = []
    for line in lines:
        start, end = max(0.0, line["start"] - PAD), line["end"] + PAD
        name = f"line-{line['index']:03d}.{'mp3' if use_ffmpeg else 'wav'}"
        if use_ffmpeg:
            subprocess.run(
                ["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{start:.3f}", "-t", f"{end - start:.3f}", "-i", str(vocals),
                 "-ac", "1", "-codec:a", "libmp3lame", "-q:a", "5", str(out_dir / name)],
                check=True,
            )
        else:
            import soundfile as sf

            sf.write(out_dir / name, y[int(start * sr):int(end * sr)], sr)
        names.append(name)
    return names
