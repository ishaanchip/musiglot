#!/usr/bin/env python3
"""Process one song folder into a complete Song document + media files.

    python pipeline/process_song.py songs/<slug>

Inputs in songs/<slug>/:
    instrumental.mp3, vocals.mp3   pre-separated stems (wav/m4a/flac/ogg also work)
    full.mp3                       optional: the original full mix (vocals + music), used for
                                   "Listen first" and guide vocals. Must be the same recording
                                   the stems came from, so the timing matches.
    meta.json                      {title, artist, album, language: "es"|"hi", lrclibId?, offsetMs?}
    lyrics.lrc / lyrics.txt        optional manual override, used only if LRCLIB has nothing

Outputs:
    media/<slug>/{instrumental,vocals}.*, clips/line-NNN.mp3, pitch.json, song.json
    MongoDB songs collection (upsert by slug)        [skip with --no-db]
    songs/<slug>/lrclib.json, asr.json, content.json  caches so reruns are cheap
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import align  # noqa: E402
import asr  # noqa: E402
import clips  # noqa: E402
import content  # noqa: E402
import db  # noqa: E402
import difficulty  # noqa: E402
import lrclib  # noqa: E402
import pitch  # noqa: E402
import separate  # noqa: E402
from common import find_audio, media_dir  # noqa: E402

SR = pitch.SR


def fail(msg: str) -> None:
    sys.exit(f"\nERROR: {msg}")


def fmt(t: float) -> str:
    return f"{int(t // 60):02d}:{t % 60:05.2f}"


def load_meta(song_dir: Path) -> dict:
    path = song_dir / "meta.json"
    if not path.exists():
        fail(f"{path} not found. Create it with title, artist, album and language (\"es\" or \"hi\").")
    meta = json.loads(path.read_text(encoding="utf-8"))
    for key in ("title", "artist", "language"):
        if not meta.get(key):
            fail(f"meta.json is missing \"{key}\"")
    if meta["language"] not in ("es", "hi"):
        fail(f"meta.json language must be \"es\" or \"hi\", got \"{meta['language']}\"")
    return meta


def source_lyrics(song_dir: Path, meta: dict, duration: float, refresh: bool) -> dict:
    """Step 1. Returns {provider, lrclibId, syncedLyrics, lines | texts}.
    Order: LRCLIB synced -> LRCLIB plain -> local lyrics.lrc -> local lyrics.txt."""
    record = None
    try:
        record = lrclib.fetch(meta, duration, song_dir / "lrclib.json", refresh=refresh)
    except Exception as err:  # network problem: still allow the manual override
        print(f"[lrclib] request failed: {err}")
    if record and record.get("syncedLyrics"):
        lines = lrclib.parse_lrc(record["syncedLyrics"], duration)
        if lines:
            return {"provider": "lrclib", "lrclibId": record["id"], "syncedLyrics": record["syncedLyrics"], "lines": lines}
    if record and record.get("plainLyrics"):
        texts = lrclib.parse_plain(record["plainLyrics"])
        if texts:
            print("[lrclib] entry has no synced lyrics; using plain lyrics and aligning lines from scratch")
            return {"provider": "lrclib", "lrclibId": record["id"], "syncedLyrics": None, "texts": texts}
    lrc_file, txt_file = song_dir / "lyrics.lrc", song_dir / "lyrics.txt"
    if lrc_file.exists():
        raw = lrc_file.read_text(encoding="utf-8")
        lines = lrclib.parse_lrc(raw, duration)
        if lines:
            print("[lyrics] LRCLIB had nothing usable; using manual lyrics.lrc")
            return {"provider": "manual", "lrclibId": None, "syncedLyrics": raw, "lines": lines}
    if txt_file.exists():
        texts = lrclib.parse_plain(txt_file.read_text(encoding="utf-8"))
        if texts:
            print("[lyrics] LRCLIB had nothing usable; using manual lyrics.txt (lines aligned from scratch)")
            return {"provider": "manual", "lrclibId": None, "syncedLyrics": None, "texts": texts}
    fail(
        f"No lyrics found for \"{meta['title']}\" by {meta['artist']}.\n"
        "  - LRCLIB had no match (or was unreachable). Check title/artist/album in meta.json, or pin \"lrclibId\".\n"
        f"  - No manual override found. Add {lrc_file} (synced) or {txt_file} (one line per row)."
    )


def get_asr_words(song_dir: Path, vocals: Path, language: str, provider: str, refresh: bool) -> list[dict] | None:
    if provider == "heuristic":
        print("[align] no ASR provider (set OPENAI_API_KEY or install faster-whisper): "
              "word times will be estimated from syllable counts inside each line")
        return None
    cache = song_dir / "asr.json"
    if cache.exists() and not refresh:
        data = json.loads(cache.read_text(encoding="utf-8"))
        if data.get("provider") == provider:
            print(f"[align] using cached {provider} word timestamps ({len(data['words'])} words)")
            return data["words"]
    print(f"[align] transcribing vocals with {provider} Whisper for word timestamps...")
    try:
        words = asr.transcribe(vocals, language, provider)
    except Exception as err:
        print(f"[align] {provider} transcription failed ({err}); falling back to syllable-based word times")
        return None
    cache.write_text(json.dumps({"provider": provider, "words": words}, ensure_ascii=False), encoding="utf-8")
    return words


def add_full_only(song_dir: Path, slug: str, no_db: bool) -> None:
    """Fast path: attach full.mp3 to a song that has already been processed."""
    full = find_audio(song_dir, "full")
    if not full:
        fail(f"No full.mp3 (or .wav/.m4a/.flac/.ogg) in {song_dir}")
    out = media_dir() / slug
    song_json = out / "song.json"
    if not song_json.exists():
        fail(f"{slug} has not been processed yet. Run without --full-only first.")
    shutil.copyfile(full, out / f"full{full.suffix}")
    path = f"/media/{slug}/full{full.suffix}"
    doc = json.loads(song_json.read_text(encoding="utf-8"))
    doc["audio"]["full"] = path
    song_json.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    if no_db:
        print(f"[db] --no-db: updated {song_json} only")
    elif db.set_fields(slug, {"audio.full": path}):
        print(f"[db] set audio.full = {path} on songs/{slug}")
    else:
        fail(f"{slug} is not in the database. Run without --full-only first.")
    print("Done. Refresh the app: Listen first and guide vocals now use the full mix.")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("song_dir", type=Path, help="songs/<slug>")
    ap.add_argument("--no-db", action="store_true", help="do not write to MongoDB (still writes media/<slug>/song.json)")
    ap.add_argument("--skip-llm", action="store_true", help="skip the LLM step (rule-based phonetics, no translations)")
    ap.add_argument("--refresh", action="store_true", help="ignore cached LRCLIB / ASR / LLM results")
    ap.add_argument("--full-only", action="store_true",
                    help="only add or replace full.mp3 on a song that is already processed (fast; skips every other step)")
    args = ap.parse_args()

    song_dir = args.song_dir.resolve()
    if not song_dir.is_dir():
        fail(f"{song_dir} is not a folder")
    slug = song_dir.name
    meta = load_meta(song_dir)
    print(f"== {meta['title']} / {meta['artist']} [{meta['language']}] (slug: {slug}) ==")

    if args.full_only:
        add_full_only(song_dir, slug, args.no_db)
        return

    # ---- inputs ----
    full = find_audio(song_dir, "full")
    vocals, instrumental = find_audio(song_dir, "vocals"), find_audio(song_dir, "instrumental")
    if not (vocals and instrumental):
        mix = find_audio(song_dir, "mix") or full
        if mix:
            separate.separate(mix, song_dir)  # OPTIONAL HOOK: vocal separation (see separate.py)
            vocals, instrumental = find_audio(song_dir, "vocals"), find_audio(song_dir, "instrumental")
    if not (vocals and instrumental):
        fail(f"Expected instrumental.mp3 and vocals.mp3 in {song_dir}")

    import librosa

    print("[audio] loading stems...")
    y_voc, _ = librosa.load(vocals, sr=SR, mono=True)
    y_inst, _ = librosa.load(instrumental, sr=SR, mono=True)
    duration = round(len(y_inst) / SR, 3)
    print(f"[audio] instrumental {duration:.1f} s, vocals {len(y_voc) / SR:.1f} s")
    rms, times = align.energy_envelope(y_voc, SR)

    # ---- 1. lyrics ----
    src = source_lyrics(song_dir, meta, duration, args.refresh)

    # ---- 2. alignment ----
    provider = asr.resolve_provider()
    asr_words = get_asr_words(song_dir, vocals, meta["language"], provider, args.refresh)
    offset_ms = 0
    if "lines" in src:
        lines = src["lines"]
        if meta.get("offsetMs") is not None:
            offset_ms = int(meta["offsetMs"])
            print(f"[align] applying manual offsetMs={offset_ms} from meta.json (automatic offset check skipped)")
        else:
            shift, report = align.detect_global_offset(lines, rms, times)
            offset_ms = int(round(shift * 1000))
            print(f"[align] timing check: onset score {report['scoreAtZero']:.2f} as-is, best {report['bestScore']:.2f} "
                  f"at {report['bestShift']:+.2f} s -> " + (f"applying global shift of {offset_ms:+d} ms" if offset_ms else "LRCLIB timing fits, no shift"))
            if report["bestScore"] < 0.1:
                print("[align] WARNING: vocal energy does not rise near the line starts at any offset. "
                      "The lyrics may be for a different version of the song; consider pinning lrclibId or setting offsetMs.")
        if offset_ms:
            for l in lines:
                l["start"] = round(max(0.0, l["start"] + offset_ms / 1000), 3)
                l["end"] = round(min(duration, max(l["start"] + 0.3, l["end"] + offset_ms / 1000)), 3)
        stats = align.align_words(lines, asr_words, rms, times, duration)
    else:
        lines = align.align_lines_from_scratch(src["texts"], asr_words, rms, times, duration)
        stats = {"words": sum(len(l["words"]) for l in lines), "matchedByAsr": None}
        if meta.get("offsetMs"):
            offset_ms = int(meta["offsetMs"])
            for l in lines:
                for item in [l] + l["words"]:
                    item["start"] = round(max(0.0, item["start"] + offset_ms / 1000), 3)
                    item["end"] = round(min(duration, item["end"] + offset_ms / 1000), 3)
    for i, l in enumerate(lines):
        l["index"] = i
    if stats.get("matchedByAsr") is not None and asr_words:
        print(f"[align] {stats['matchedByAsr']}/{stats['words']} words timed directly by ASR, the rest interpolated")

    print(f"\nLyrics source: {src['provider']}" + (f" (LRCLIB id {src['lrclibId']})" if src.get("lrclibId") else ""))
    print(f"Parsed {len(lines)} lines. First lines:")
    for l in lines[:6]:
        print(f"  [{fmt(l['start'])} -> {fmt(l['end'])}] {l['text']}")
        print("      " + "  ".join(f"{w['text']}@{w['start']:.2f}" for w in l["words"][:8]))
    print()

    # ---- 3. language content ----
    cache = song_dir / "content.json"
    texts = [l["text"] for l in lines]
    cached = json.loads(cache.read_text(encoding="utf-8")) if cache.exists() and not args.refresh else None
    if cached and cached.get("texts") == texts and (cached["info"]["source"] == "llm" or args.skip_llm):
        print("[content] using cached content.json")
        line_content, info = cached["lines"], cached["info"]
    else:
        line_content, info = content.generate(meta, texts, skip_llm=args.skip_llm)
        cache.write_text(json.dumps({"texts": texts, "lines": line_content, "info": info}, ensure_ascii=False, indent=1), encoding="utf-8")

    # ---- 4. reference pitch ----
    print("[pitch] extracting pitch contour (pYIN; this is the slow step)...")
    contour = pitch.extract(y_voc, SR)
    voiced = sum(1 for m in contour["frames"] if m is not None)
    print(f"[pitch] {voiced} voiced frames, {len(contour['notes'])} notes")

    # ---- 5. media: stems, clips, pitch file ----
    out = media_dir() / slug
    out.mkdir(parents=True, exist_ok=True)
    url = f"/media/{slug}"
    shutil.copyfile(instrumental, out / f"instrumental{instrumental.suffix}")
    shutil.copyfile(vocals, out / f"vocals{vocals.suffix}")
    audio = {"instrumental": f"{url}/instrumental{instrumental.suffix}", "vocals": f"{url}/vocals{vocals.suffix}"}
    if full:
        shutil.copyfile(full, out / f"full{full.suffix}")
        audio["full"] = f"{url}/full{full.suffix}"
        print(f"[audio] full mix found ({full.name}): used for Listen first and guide vocals")
    else:
        print("[audio] no full.mp3: Listen first and guide vocals will play the two stems together")
    (out / "pitch.json").write_text(json.dumps(contour), encoding="utf-8")
    clip_names = clips.cut_line_clips(vocals, lines, out / "clips", y=y_voc, sr=SR)
    print(f"[clips] wrote {len(clip_names)} line clips")

    doc_lines = []
    for l, c, clip in zip(lines, line_content, clip_names):
        words = [{"text": w["text"], "romanized": cw["romanized"], "phonetic": cw["phonetic"], "gloss": cw["gloss"],
                  "start": w["start"], "end": w["end"]} for w, cw in zip(l["words"], c["words"])]
        doc_lines.append({"index": l["index"], "start": l["start"], "end": l["end"], "original": l["text"],
                          "romanized": c["romanized"], "phonetic": c["phonetic"], "translation": c["translation"],
                          "clipPath": f"{url}/clips/{clip}", "words": words})

    # ---- 6. difficulty ----
    bpm = difficulty.tempo_bpm(y_inst, SR)
    diff = difficulty.compute(doc_lines, contour, bpm, meta["language"], info["grammarComplexity"], info.get("grammarNotes", ""))
    print(f"[difficulty] overall {diff['overall']}/10  (tempo {diff['tempo']}, range {diff['range']}, vocab {diff['vocab']}, grammar {diff['grammar']})")

    doc = {
        "slug": slug, "title": meta["title"], "artist": meta["artist"], "album": meta.get("album", ""),
        "language": meta["language"], "durationSec": duration,
        "lyricsSource": {"provider": src["provider"], "lrclibId": src.get("lrclibId"),
                         "syncedLyrics": src.get("syncedLyrics"), "offsetMs": offset_ms},
        "difficulty": diff,
        "audio": audio,
        "pitchContour": {"path": f"{url}/pitch.json", "hopSec": contour["hopSec"]},
        "lines": doc_lines,
    }
    (out / "song.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    if args.no_db:
        print(f"[db] --no-db: wrote {out / 'song.json'} only")
    else:
        try:
            print(f"[db] upserted {db.upsert_song(doc)}")
        except Exception as err:
            fail(f"Could not write to MongoDB ({err}). The document is saved at {out / 'song.json'}; fix MONGODB_URI and rerun.")
    print(f"\nDone: {len(doc_lines)} lines, {duration:.0f} s. Media in {out}")
    if info["source"] != "llm":
        print("NOTE: translations and glosses are empty because the LLM step did not run. Set ANTHROPIC_API_KEY and rerun.")


if __name__ == "__main__":
    main()
