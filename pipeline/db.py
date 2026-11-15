"""Writes the Song document. Shape must match server/src/models/Song.js."""
from __future__ import annotations

from datetime import datetime, timezone

from common import env


def set_fields(slug: str, fields: dict) -> bool:
    """Updates a few fields on an existing song. Returns False if it is not in the database."""
    from pymongo import MongoClient

    client = MongoClient(env("MONGODB_URI", "mongodb://127.0.0.1:27017/musiglot"), serverSelectionTimeoutMS=5000)
    db = client.get_default_database(default="musiglot")
    res = db.songs.update_one({"slug": slug}, {"$set": {**fields, "updatedAt": datetime.now(timezone.utc)}})
    client.close()
    return res.matched_count > 0


def upsert_song(doc: dict) -> str:
    from pymongo import MongoClient

    uri = env("MONGODB_URI", "mongodb://127.0.0.1:27017/musiglot")
    client = MongoClient(uri, serverSelectionTimeoutMS=5000)
    db = client.get_default_database(default="musiglot")
    now = datetime.now(timezone.utc)
    db.songs.update_one({"slug": doc["slug"]}, {"$set": {**doc, "updatedAt": now}, "$setOnInsert": {"createdAt": now}}, upsert=True)
    client.close()
    return f"{uri.rsplit('@', 1)[-1]} -> songs/{doc['slug']}"
