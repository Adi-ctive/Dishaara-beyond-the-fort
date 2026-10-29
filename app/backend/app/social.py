"""Saarthi and shop posts, comments, likes, saves, follows and reports.

Checks: every write needs an account. Only saarthis (and shops) post. One like, save, follow and
report per person, enforced by unique ids. Rate limits stop spam and point farming. Links and
phone numbers are not allowed in comments. Three reports from different people hide a post
or comment and send it to the moderator queue. Moderators can hide, restore and ban.
"""
from __future__ import annotations

import re
import uuid

from bson import Binary
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError

from .auth import current, limit, need
from .db import get_db, now

router = APIRouter()
HIDE_AFTER = 3
LINK = re.compile(r"https?://|www\.|\b[\w.-]+\.(?:com|in|net|org|io|xyz)\b", re.I)
PHONE = re.compile(r"(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}")


def clean(text: str, allow_links: bool) -> str:
    t = re.sub(r"\s+", " ", text).strip()
    if not t:
        raise HTTPException(422, "empty text")
    if not allow_links and LINK.search(t):
        raise HTTPException(422, "links are not allowed here")
    if PHONE.search(t):
        raise HTTPException(422, "phone numbers are not allowed in posts")
    return t


def show(p: dict, me: dict | None) -> dict:
    out = {"id": p["_id"], **{k: p.get(k) for k in ("by", "byName", "byRole", "kind", "text", "place", "city", "community", "status", "likes", "saves", "comments", "at", "biz")}, "media": p.get("media") or [], "videos": p.get("videos") or []}
    out["byRole"] = out["byRole"] or ("business" if p.get("biz") else "saarthi")
    if me:
        db = get_db()
        out["liked"] = bool(db.likes.find_one({"_id": f"{me['_id']}:{p['_id']}"}, {"_id": 1}))
        out["saved"] = bool(db.saves.find_one({"_id": f"{me['_id']}:{p['_id']}"}, {"_id": 1}))
        out["mine"] = p.get("by") == me["_id"]
    return out


COMMUNITIES = {"gwalior": "Gwalior", "indore": "Indore", "mp": "Madhya Pradesh", "india": "India"}
# What each account type may post. Facts are the saarthi's job; offers are the shop's. Everyone can talk.
KINDS = {"raahi": {"post", "question", "blog", "video"}, "saarthi": {"post", "question", "fact", "blog", "video"},
         "business": {"post", "offer", "video"}, "moderator": {"post", "question", "fact", "blog", "video"}}


class PostIn(BaseModel):
    kind: str = Field(pattern="^(post|question|fact|photo|blog|video|offer)$")
    text: str = Field(min_length=1, max_length=1000)
    placeId: str | None = None
    city: str = "gwalior"
    community: str | None = None  # gwalior, indore, mp (state) or india (national); defaults to the city
    as_: str = Field(default="raahi", alias="as")  # the account type the person is using the app as
    media: list[str] = Field(default=[], max_length=4)  # photos from POST /posts/media, shown with the post


@router.post("/posts")
def make_post(body: PostIn, me: dict | None = Depends(current)):
    """Anyone signed in posts in a community. Saarthi and shop posts carry their badge; the role must be held."""
    me = need(me)
    role = body.as_ if body.as_ in me["roles"] or (body.as_ == "raahi") else None
    if not role:
        raise HTTPException(403, f"this account is not a {body.as_}")
    kind = "post" if body.kind == "photo" and role == "raahi" else body.kind
    if kind not in KINDS.get(role, set()):
        raise HTTPException(403, f"a {role} cannot post a {kind}")
    community = body.community or body.city
    if community not in COMMUNITIES:
        raise HTTPException(422, "unknown community")
    limit(me, "post", 10, 24 * 60)
    shop = get_db().business.find_one({"owner": me["_id"], "status": "live"}) if role == "business" else None
    db = get_db()
    own = [db.media.find_one({"_id": m, "by": me["_id"], "post": None}, {"type": 1}) for m in body.media]
    media = [d["_id"] for d in own if d]  # only your own, unused photos and clips
    videos = [d["_id"] for d in own if d and d["type"].startswith("video/")]
    p = {"_id": uuid.uuid4().hex[:12], "media": media, "videos": videos, "by": me["_id"], "byName": shop["name"] if shop else me.get("name", "Raahi"), "byRole": role,
         "biz": shop["_id"] if shop else None, "kind": kind,
         "text": clean(body.text, allow_links=kind == "video"), "place": body.placeId, "city": body.city, "community": community,
         "status": "live", "likes": 0, "saves": 0, "comments": 0, "reports": 0, "at": now()}
    db.posts.insert_one(p)
    if media:
        db.media.update_many({"_id": {"$in": media}}, {"$set": {"post": p["_id"]}})
    return show(p, me)


POST_PHOTO_TYPES = {"image/jpeg", "image/png", "image/webp"}
POST_VIDEO_TYPES = {"video/mp4", "video/webm"}
POST_PHOTO_MAX, POST_VIDEO_MAX = 2_000_000, 4_000_000  # Vercel takes request bodies up to 4.5 MB


def looks_like(kind: str, data: bytes) -> bool:
    """The file starts the way its type says (a renamed script or page is refused)."""
    if kind == "image/jpeg":
        return data[:3] == bytes([0xFF, 0xD8, 0xFF])
    if kind == "image/png":
        return data[:8] == bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
    if kind == "image/webp":
        return data[:4] == b"RIFF" and data[8:12] == b"WEBP"
    if kind in ("video/mp4", "audio/mp4", "audio/x-m4a", "video/quicktime"):
        return data[4:8] == b"ftyp"
    if kind in ("video/webm", "audio/webm"):
        return data[:4] == bytes([0x1A, 0x45, 0xDF, 0xA3])
    if kind == "audio/ogg":
        return data[:4] == b"OggS"
    if kind == "audio/wav":
        return data[:4] == b"RIFF" and data[8:12] == b"WAVE"
    if kind == "audio/mpeg":
        return data[:3] == b"ID3" or (len(data) > 1 and data[0] == 0xFF and data[1] & 0xE0 == 0xE0)
    if kind == "audio/aac":
        return len(data) > 1 and data[0] == 0xFF and data[1] & 0xF0 == 0xF0
    return False  # a type we do not know how to check is refused


@router.post("/posts/media")
async def post_photo(file: UploadFile = File(...), me: dict | None = Depends(current)):
    """A photo or short clip for a post. Public once posted (GET /media/{id}). Photos are shrunk on the phone before upload."""
    me = need(me)
    limit(me, "post-photo", 20, 24 * 60)
    video = file.content_type in POST_VIDEO_TYPES
    if file.content_type not in POST_PHOTO_TYPES | POST_VIDEO_TYPES:
        raise HTTPException(415, "send a JPEG, PNG or WebP photo, or an MP4 or WebM clip")
    cap = POST_VIDEO_MAX if video else POST_PHOTO_MAX
    data = await file.read(cap + 1)
    if len(data) > cap:
        raise HTTPException(413, "clip is over 4 MB" if video else "photo is over 2 MB")
    if not looks_like(file.content_type, data):
        raise HTTPException(415, "the file is not the type it says")
    mid = uuid.uuid4().hex[:12]
    get_db().media.insert_one({"_id": mid, "by": me["_id"], "post": None, "type": file.content_type, "data": Binary(data), "at": now()})
    return {"id": mid}


@router.get("/feed")
def feed(tab: str = "all", city: str | None = None, place: str | None = None, by: str | None = None,
         before: str | None = None, community: str | None = None, sort: str = "new", me: dict | None = Depends(current)):
    db = get_db()
    q: dict = {"status": "live"}
    if city:
        q["city"] = city
    if community:
        # Older posts have no community: they count for their city.
        q["$or"] = [{"community": community}, {"community": {"$exists": False}, "city": community}]
    if place:
        q["place"] = place
    if by:
        q["by"] = by
    if tab == "following":
        me = need(me)
        q["by"] = {"$in": [f["target"] for f in db.follows.find({"user": me["_id"]})]}
    elif tab == "saved":
        me = need(me)
        q["_id"] = {"$in": [s["post"] for s in db.saves.find({"user": me["_id"]})]}
    if before:
        b = db.posts.find_one({"_id": before}, {"at": 1})
        if b:
            q["at"] = {"$lt": b["at"]}
    order = [("likes", -1), ("at", -1)] if sort == "top" else [("at", -1)]
    return [show(p, me) for p in db.posts.find(q).sort(order).limit(30)]


def _post(pid: str) -> dict:
    p = get_db().posts.find_one({"_id": pid})
    if not p or p["status"] == "removed":
        raise HTTPException(404, "no such post")
    return p


def _toggle(coll: str, counter: str, pid: str, on: bool, me: dict) -> dict:
    db = get_db()
    _post(pid)
    key = f"{me['_id']}:{pid}"
    if on:
        try:
            db[coll].insert_one({"_id": key, "user": me["_id"], "post": pid, "at": now()})
            db.posts.update_one({"_id": pid}, {"$inc": {counter: 1}})
        except DuplicateKeyError:
            pass  # already done: nothing to count twice
    elif db[coll].delete_one({"_id": key}).deleted_count:
        db.posts.update_one({"_id": pid}, {"$inc": {counter: -1}})
    return show(db.posts.find_one({"_id": pid}), me)


class On(BaseModel):
    on: bool = True


@router.delete("/posts/{pid}")
def delete_post(pid: str, me: dict | None = Depends(current)):
    """The author takes their own post down (moderators use /mod/content). Its comments go with it."""
    me = need(me)
    p = _post(pid)
    if p.get("by") != me["_id"] and "moderator" not in me.get("roles", []):
        raise HTTPException(403, "only the author can delete this post")
    db = get_db()
    db.posts.update_one({"_id": pid}, {"$set": {"status": "removed", "removedBy": me["_id"], "removedAt": now()}})
    db.comments.update_many({"post": pid}, {"$set": {"status": "removed"}})
    return {"id": pid, "status": "removed"}


@router.delete("/comments/{cid}")
def delete_comment(cid: str, me: dict | None = Depends(current)):
    me = need(me)
    db = get_db()
    c = db.comments.find_one({"_id": cid})
    if not c or c["status"] == "removed":
        raise HTTPException(404, "no such comment")
    if c.get("by") != me["_id"] and "moderator" not in me.get("roles", []):
        raise HTTPException(403, "only the author can delete this comment")
    db.comments.update_one({"_id": cid}, {"$set": {"status": "removed"}})
    if c.get("post"):
        db.posts.update_one({"_id": c["post"]}, {"$inc": {"comments": -1}})
    return {"id": cid, "status": "removed"}


@router.post("/posts/{pid}/like")
def like(pid: str, body: On, me: dict | None = Depends(current)):
    me = need(me)
    limit(me, "like", 200, 60)
    return _toggle("likes", "likes", pid, body.on, me)


@router.post("/posts/{pid}/save")
def save(pid: str, body: On, me: dict | None = Depends(current)):
    me = need(me)
    limit(me, "save", 200, 60)
    return _toggle("saves", "saves", pid, body.on, me)


class CommentIn(BaseModel):
    text: str = Field(min_length=1, max_length=300)


@router.get("/posts/{pid}/comments")
def comments(pid: str):
    _post(pid)
    return [{"id": c["_id"], "by": c["by"], "byName": c["byName"], "text": c["text"], "at": c["at"]}
            for c in get_db().comments.find({"post": pid, "status": "live"}).sort("at", 1).limit(100)]


@router.post("/posts/{pid}/comments")
def comment(pid: str, body: CommentIn, me: dict | None = Depends(current)):
    me = need(me)
    _post(pid)
    limit(me, "comment", 30, 60)
    db = get_db()
    c = {"_id": uuid.uuid4().hex[:12], "post": pid, "by": me["_id"], "byName": me.get("name", "Raahi"),
         "text": clean(body.text, allow_links=False), "status": "live", "reports": 0, "at": now()}
    db.comments.insert_one(c)
    db.posts.update_one({"_id": pid}, {"$inc": {"comments": 1}})
    return {"id": c["_id"], "by": c["by"], "byName": c["byName"], "text": c["text"], "at": c["at"]}


@router.post("/follow/{target}")
def follow(target: str, body: On, me: dict | None = Depends(current)):
    me = need(me)
    if target == me["_id"]:
        raise HTTPException(422, "you cannot follow yourself")
    db = get_db()
    if not db.users.find_one({"_id": target}, {"_id": 1}) and not db.bazaar.find_one({"_id": target}, {"_id": 1}):
        raise HTTPException(404, "no such saarthi or shop")
    limit(me, "follow", 100, 60)
    key = f"{me['_id']}:{target}"
    if body.on:
        try:
            db.follows.insert_one({"_id": key, "user": me["_id"], "target": target, "at": now()})
        except DuplicateKeyError:
            pass
    else:
        db.follows.delete_one({"_id": key})
    return {"following": body.on, "followers": db.follows.count_documents({"target": target})}


class ReportIn(BaseModel):
    kind: str = Field(pattern="^(post|comment)$")
    reason: str = Field(default="", max_length=200)


@router.post("/report/{target}")
def report(target: str, body: ReportIn, me: dict | None = Depends(current)):
    me = need(me)
    limit(me, "report", 20, 24 * 60)
    db = get_db()
    coll = db.posts if body.kind == "post" else db.comments
    item = coll.find_one({"_id": target})
    if not item:
        raise HTTPException(404, f"no such {body.kind}")
    try:
        db.reports.insert_one({"_id": f"{me['_id']}:{target}", "user": me["_id"], "target": target, "kind": body.kind, "reason": body.reason, "at": now()})
    except DuplicateKeyError:
        return {"reported": True}
    n = coll.find_one_and_update({"_id": target}, {"$inc": {"reports": 1}}, return_document=True)["reports"]
    if n >= HIDE_AFTER and item["status"] == "live":
        coll.update_one({"_id": target}, {"$set": {"status": "hidden"}})
        if body.kind == "comment":
            db.posts.update_one({"_id": item["post"]}, {"$inc": {"comments": -1}})
        db.queue.insert_one({"_id": f"m-rep-{target}", "kind": "report", "target": target, "targetKind": body.kind,
                             "title": f"Hidden after {n} reports: {body.kind}", "detail": item["text"][:200], "status": "pending", "at": now()})
    return {"reported": True}


# ---------------- moderators ----------------
class ModAct(BaseModel):
    action: str = Field(pattern="^(hide|restore|remove)$")


@router.post("/mod/content/{kind}/{target}")
def mod_content(kind: str, target: str, body: ModAct, me: dict | None = Depends(current)):
    need(me, "moderator")
    coll = {"post": get_db().posts, "comment": get_db().comments}.get(kind)
    if coll is None or not coll.find_one({"_id": target}):
        raise HTTPException(404, "not found")
    status = {"hide": "hidden", "restore": "live", "remove": "removed"}[body.action]
    coll.update_one({"_id": target}, {"$set": {"status": status, "reports": 0 if status == "live" else coll.find_one({"_id": target})["reports"]}})
    return {"id": target, "status": status}


class BanIn(BaseModel):
    banned: bool = True


@router.post("/mod/users/{uid}/ban")
def ban(uid: str, body: BanIn, me: dict | None = Depends(current)):
    need(me, "moderator")
    u = get_db().users.find_one({"_id": uid})
    if not u:
        raise HTTPException(404, "no such user")
    if "moderator" in u.get("roles", []):
        raise HTTPException(403, "moderators cannot be banned here")
    get_db().users.update_one({"_id": uid}, {"$set": {"banned": body.banned}})
    return {"id": uid, "banned": body.banned}


@router.get("/saarthis/{uid}")
def saarthi_page(uid: str, me: dict | None = Depends(current)):
    db = get_db()
    u = db.users.find_one({"_id": uid, "roles": "saarthi"})
    if not u:
        raise HTTPException(404, "no such saarthi")
    approved = db.verify.count_documents({"byUser": uid, "status": "approved"})
    rank = "Keeper" if approved >= 50 else "Senior saarthi" if approved >= 25 else "Trusted saarthi" if approved >= 10 else "Saarthi"
    return {"id": uid, "rank": rank, "approved": approved, "name": u.get("name"), "avatar": u.get("avatar"), "frame": u.get("frame"), "banner": u.get("banner"),
            "region": u.get("region"), "followers": db.follows.count_documents({"target": uid}),
            "following": bool(me and db.follows.find_one({"_id": f"{me['_id']}:{uid}"})),
            "posts": [show(p, me) for p in db.posts.find({"by": uid, "status": "live"}).sort("at", -1).limit(30)]}
