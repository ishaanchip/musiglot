"""Writes the Song document. Shape must match server/src/models/Song.js."""
from __future__ import annotations

from datetime import datetime, timezone

from common import env


def upsert_song(doc: dict) -> str:
    from pymongo import MongoClient

    uri = env("MONGODB_URI", "mongodb://127.0.0.1:27017/musiglot")
    client = MongoClient(uri, serverSelectionTimeoutMS=5000)
    db = client.get_default_database(default="musiglot")
    now = datetime.now(timezone.utc)
    db.songs.update_one({"slug": doc["slug"]}, {"$set": {**doc, "updatedAt": now}, "$setOnInsert": {"createdAt": now}}, upsert=True)
    client.close()
    return f"{uri.rsplit('@', 1)[-1]} -> songs/{doc['slug']}"
