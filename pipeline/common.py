"""Shared helpers: env loading, paths, and language-aware text utilities."""
from __future__ import annotations

import os
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

try:
    from dotenv import load_dotenv

    load_dotenv(ROOT / ".env")
except ImportError:  # python-dotenv is optional at import time
    pass

AUDIO_EXTS = (".mp3", ".wav", ".m4a", ".flac", ".ogg")
DEFAULT_USER_AGENT = "musiglot/0.1 (https://github.com/ishaanchip/musiglot)"


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, "").strip() or default


def media_dir() -> Path:
    return (ROOT / env("MEDIA_DIR", "./media")).resolve()


def find_audio(song_dir: Path, stem: str) -> Path | None:
    for ext in AUDIO_EXTS:
        p = song_dir / f"{stem}{ext}"
        if p.exists():
            return p
    return None


def tokenize(line: str) -> list[str]:
    """Whitespace tokens. This tokenization is the contract between alignment
    (word timestamps) and the LLM content step (word glosses)."""
    return line.split()


_PUNCT = re.compile(r"[^\w\s]", re.UNICODE)


def normalize(text: str) -> str:
    """Lowercase, drop punctuation and accents. Devanagari marks are kept."""
    text = unicodedata.normalize("NFD", text.lower())
    text = "".join(c for c in text if not ("̀" <= c <= "ͯ"))
    text = unicodedata.normalize("NFC", text)
    # \w does not cover Devanagari vowel signs, so strip punctuation by category instead.
    text = "".join(c if unicodedata.category(c)[0] in "LMN" or c.isspace() else " " for c in text)
    return " ".join(text.split())


_LATIN_VOWELS = re.compile(r"[aeiouáéíóúüy]+", re.IGNORECASE)


def count_syllables(word: str) -> int:
    """Rough syllable count for Spanish (vowel groups) and Hindi (aksharas)."""
    if any("ऀ" <= c <= "ॿ" for c in word):
        n = 0
        for i, c in enumerate(word):
            if "ऄ" <= c <= "औ":  # independent vowels
                n += 1
            elif "क" <= c <= "ह" or "क़" <= c <= "य़":  # consonants
                nxt = word[i + 1] if i + 1 < len(word) else ""
                if nxt != "्":  # not followed by virama
                    n += 1
        return max(1, n)
    return max(1, len(_LATIN_VOWELS.findall(word)))
