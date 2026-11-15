#!/usr/bin/env python3
"""Remove a song from the app: its database entry, its attempts and its generated media.

    python pipeline/remove_song.py <slug>

Your inputs in songs/<slug>/ are left alone.
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from common import env, media_dir  # noqa: E402


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    slug = sys.argv[1].strip("/").split("/")[-1]
    from pymongo import MongoClient

    client = MongoClient(env("MONGODB_URI", "mongodb://127.0.0.1:27017/musiglot"), serverSelectionTimeoutMS=5000)
    db = client.get_default_database(default="musiglot")
    song = db.songs.find_one({"slug": slug}, {"_id": 1, "title": 1})
    if not song:
        known = ", ".join(sorted(s["slug"] for s in db.songs.find({}, {"slug": 1}))) or "none"
        sys.exit(f"No song with slug \"{slug}\" in the database. Songs there: {known}")
    attempts = db.attempts.delete_many({"songId": song["_id"]}).deleted_count
    db.songs.delete_one({"_id": song["_id"]})
    client.close()
    media = media_dir() / slug
    if media.is_dir():
        shutil.rmtree(media)
    print(f"Removed \"{song.get('title', slug)}\" ({slug}): song entry, {attempts} attempt(s), and {media}")


if __name__ == "__main__":
    main()
