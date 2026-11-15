"""Step 1: lyrics sourcing from LRCLIB (https://lrclib.net/api, no API key)."""
from __future__ import annotations

import json
import re
from pathlib import Path

import requests

from common import DEFAULT_USER_AGENT, env

API = "https://lrclib.net/api"
_TS = re.compile(r"\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]")
# Lines that only mark an instrumental break, e.g. "♪", "(Instrumental)", "[Música]".
_MARKER = re.compile(
    r"^[\s♪♫🎵🎶*~\-–—.]*$|^[\[(]?\s*(instrumental|m[uú]sica|music|intro|outro|interlude|solo|संगीत)\s*[\])]?$",
    re.IGNORECASE,
)


class LyricsNotFound(Exception):
    pass


def _get(path: str, params: dict | None = None):
    headers = {"User-Agent": env("LRCLIB_USER_AGENT", DEFAULT_USER_AGENT)}
    res = requests.get(f"{API}{path}", params=params, headers=headers, timeout=30)
    if res.status_code == 404:
        return None
    res.raise_for_status()
    return res.json()


def fetch(meta: dict, duration_sec: float, cache_path: Path, refresh: bool = False) -> dict | None:
    """Returns the chosen LRCLIB record (or None). Caches the raw response so
    reruns do not hit the API."""
    if cache_path.exists() and not refresh:
        record = json.loads(cache_path.read_text(encoding="utf-8"))
        pinned = meta.get("lrclibId")
        if not pinned or record.get("id") == pinned:
            print(f"[lrclib] using cached response {cache_path.name} (id {record.get('id')})")
            return record
        print(f"[lrclib] cache holds id {record.get('id')} but meta.json pins {pinned}; refetching")

    record = None
    how = ""
    if meta.get("lrclibId"):
        record = _get(f"/get/{meta['lrclibId']}")
        how = "pinned lrclibId"
        if record is None:
            print(f"[lrclib] pinned id {meta['lrclibId']} not found; trying a signature match")
    if record is None:
        params = {"track_name": meta["title"], "artist_name": meta["artist"], "duration": round(duration_sec)}
        if meta.get("album"):
            params["album_name"] = meta["album"]
        record = _get("/get", params)
        how = "exact match on title/artist/album/duration"
    if record is None:
        results = _get("/search", {"track_name": meta["title"], "artist_name": meta["artist"]}) or []
        record = choose_search_result(results, duration_sec)
        how = f"search ({len(results)} results)"
    if record is None:
        return None

    cache_path.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
    delta = (record.get("duration") or 0) - duration_sec
    print(f"[lrclib] chose id {record['id']} via {how}: \"{record.get('trackName')}\" / {record.get('artistName')} "
          f"/ {record.get('albumName')} (duration {record.get('duration')} s, {delta:+.1f} s vs your audio)")
    if not meta.get("lrclibId"):
        print(f"[lrclib] to pin this entry, add  \"lrclibId\": {record['id']}  to meta.json")
    return record


def choose_search_result(results: list[dict], duration_sec: float) -> dict | None:
    """Closest duration wins; entries with syncedLyrics are always preferred."""
    usable = [r for r in results if r.get("syncedLyrics") or r.get("plainLyrics")]
    if not usable:
        return None
    return min(usable, key=lambda r: (not r.get("syncedLyrics"), abs((r.get("duration") or 0) - duration_sec)))


def is_marker(text: str) -> bool:
    return bool(_MARKER.match(text.strip()))


def parse_lrc(lrc: str, song_end: float) -> list[dict]:
    """Parses '[mm:ss.xx] text' into [{start, end, text}]. A line ends where the
    next timestamp begins (including empty/instrumental timestamps, which LRC
    uses to mark the end of singing), or at the end of the song."""
    entries: list[tuple[float, str]] = []
    for raw in lrc.splitlines():
        stamps = list(_TS.finditer(raw))
        if not stamps:
            continue  # metadata like [ar:Artist] or junk
        text = _TS.sub("", raw).strip()
        for m in stamps:
            seconds = int(m.group(1)) * 60 + float(m.group(2).replace(":", "."))
            entries.append((seconds, text))
    entries.sort(key=lambda e: e[0])

    lines = []
    for i, (start, text) in enumerate(entries):
        if not text or is_marker(text):
            continue
        end = entries[i + 1][0] if i + 1 < len(entries) else song_end
        if end <= start:
            end = start + 2.0
        lines.append({"start": round(start, 3), "end": round(min(end, max(song_end, start + 0.5)), 3), "text": text})
    return lines


def parse_plain(text: str) -> list[str]:
    return [ln.strip() for ln in text.splitlines() if ln.strip() and not is_marker(ln)]
