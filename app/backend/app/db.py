"""MongoDB access. MONGODB_URI points at Atlas. Without it (laptop dev, tests) an in-memory
mongomock database is used, so everything runs with no setup.

Collections (one line each, see also docs/API.md):
  cities, places        checked city data, imported from src/data/<city>.json by admin.py
  chunks                one fact sentence per document, searched by the chat (RAG)
  users                 google and staff accounts, roles, profile, points
  plans, stamps, awards trip plans, stamps (one per user and place), points given once per key
  posts, comments, likes, saves, follows, reports   social, with counters on posts
  tickets, verify, queue, news, alerts, sos, bazaar, business, sponsor   saarthi, shop and moderator work
  twists                single document with event twists
  hits                  rate limit log, expires after a day
  tts                   read-aloud audio, made once per text
"""
from __future__ import annotations

import os
from datetime import datetime, timezone

import pymongo

_db = None


def now() -> datetime:
    return datetime.now(timezone.utc)


def get_db():
    global _db
    if _db is None:
        uri = os.getenv("MONGODB_URI")
        if uri:
            # One client per process: serverless functions reuse it between calls.
            client = pymongo.MongoClient(uri, appname="dishaara", serverSelectionTimeoutMS=8000, maxPoolSize=10)
        else:
            import mongomock

            client = mongomock.MongoClient()
        _db = client[os.getenv("MONGODB_DB", "dishaara")]
        ensure_indexes(_db)
    return _db


def use(db) -> None:
    """Tests swap in a fresh database."""
    global _db
    _db = db
    ensure_indexes(db)


def ensure_indexes(db) -> None:
    db.users.create_index("googleSub", unique=True, sparse=True)
    db.users.create_index("username", unique=True, sparse=True)
    db.places.create_index("city")
    db.chunks.create_index([("city", 1), ("lang", 1)])
    db.stamps.create_index("user")
    db.posts.create_index([("status", 1), ("at", -1)])
    db.posts.create_index("by")
    db.comments.create_index([("post", 1), ("at", 1)])
    db.likes.create_index("user")
    db.saves.create_index("user")
    db.follows.create_index("user")
    db.follows.create_index("target")
    db.reports.create_index("target")
    db.hits.create_index([("user", 1), ("action", 1), ("at", -1)])
    db.hits.create_index("at", expireAfterSeconds=86400)
    db.queue.create_index("status")
