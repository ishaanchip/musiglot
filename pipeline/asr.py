"""Speech recognition with word timestamps (Whisper).

Used only to find WHEN words are sung. The lyric text itself always comes from
LRCLIB / the manual override and is never replaced by ASR output.

Providers: "openai" (Whisper API, needs OPENAI_API_KEY) or "local"
(faster-whisper, see requirements-optional.txt).

Also a CLI so the Node server can use the local model for pronunciation scoring:
    python pipeline/asr.py recording.wav --language es --provider local
prints a JSON list of {word, start, end}.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from common import env

OPENAI_MAX_BYTES = 25 * 1024 * 1024


def resolve_provider(requested: str | None = None) -> str:
    p = (requested or env("ALIGNER", "auto")).lower()
    if p != "auto":
        return p
    if env("OPENAI_API_KEY"):
        return "openai"
    try:
        import faster_whisper  # noqa: F401

        return "local"
    except ImportError:
        return "heuristic"


def transcribe_openai(path: Path, language: str) -> list[dict]:
    import requests

    if path.stat().st_size > OPENAI_MAX_BYTES:
        raise RuntimeError(f"{path.name} is over the Whisper API's 25 MB limit; re-encode it at a lower bitrate or use ALIGNER=local")
    with path.open("rb") as f:
        res = requests.post(
            "https://api.openai.com/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {env('OPENAI_API_KEY')}"},
            files={"file": (path.name, f)},
            data={
                "model": env("OPENAI_WHISPER_MODEL", "whisper-1"),
                "language": language,
                "response_format": "verbose_json",
                "timestamp_granularities[]": "word",
            },
            timeout=600,
        )
    if not res.ok:
        raise RuntimeError(f"OpenAI transcription failed ({res.status_code}): {res.text[:300]}")
    return [{"word": w["word"].strip(), "start": float(w["start"]), "end": float(w["end"])} for w in res.json().get("words", [])]


def transcribe_local(path: Path, language: str) -> list[dict]:
    from faster_whisper import WhisperModel

    model = WhisperModel(env("WHISPER_LOCAL_MODEL", "small"), device="auto", compute_type="int8")
    segments, _ = model.transcribe(str(path), language=language, word_timestamps=True, vad_filter=False)
    words = []
    for seg in segments:
        for w in seg.words or []:
            words.append({"word": w.word.strip(), "start": float(w.start), "end": float(w.end)})
    return words


def transcribe(path: Path, language: str, provider: str) -> list[dict]:
    if provider == "openai":
        return transcribe_openai(path, language)
    if provider == "local":
        return transcribe_local(path, language)
    raise ValueError(f"Unknown ASR provider: {provider}")


def main() -> None:
    ap = argparse.ArgumentParser(description="Transcribe audio to word timestamps (JSON on stdout)")
    ap.add_argument("audio", type=Path)
    ap.add_argument("--language", required=True, choices=["es", "hi"])
    ap.add_argument("--provider", default=None, help="openai | local (default: ALIGNER env / auto)")
    args = ap.parse_args()
    provider = resolve_provider(args.provider)
    if provider == "heuristic":
        sys.exit("No ASR provider available: set OPENAI_API_KEY or install faster-whisper")
    json.dump(transcribe(args.audio, args.language, provider), sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
