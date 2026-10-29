"""Dishaara backend: FastAPI on MongoDB. Every endpoint is listed in app/docs/API.md.

Runs on the laptop (in-memory mongomock when MONGODB_URI is unset) and on Vercel with MongoDB Atlas.
Facts come only from the checked city data (cities.py). Verdicts and plan timings are rules code.
The chatbot never reads the database: retrieve() builds a facts pack, the model sees only that pack.
"""
from __future__ import annotations

import hashlib
import html
from email.utils import parsedate_to_datetime
import json
import math
import os
import re
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
from bson.binary import Binary
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Query, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError

from . import auth, cities, grounding, rag, rules, social
from .auth import current, limit, need
from .db import get_db, now

app = FastAPI(title="Dishaara backend")
# Only the app's own pages call the API from a browser (the phone app and Vercel share one origin).
ORIGINS = os.getenv("CORS_ORIGINS", "https://dishaara.vercel.app,http://localhost:5174,http://localhost:5175,http://localhost:4174").split(",")
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["GET", "POST", "PUT", "DELETE"], allow_headers=["Authorization", "Content-Type"])
app.include_router(social.router)

IST = timezone(timedelta(hours=5, minutes=30))
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "openai/gpt-oss-120b"
GEOFENCE_KM = 0.25
MIN_ACCURACY_M = 50
MAX_SPEED_KMH = 60
DWELL_S = int(os.getenv("DWELL_SECONDS", "60"))  # time the readings must span; lower it for laptop demos
COUNTER_CODE = os.getenv("COUNTER_CODE", "DEMO-QR")  # real codes rotate at the counter (Decision 24)
SEEDS = json.loads((Path(__file__).parent / "seeds.json").read_text(encoding="utf-8"))
TWISTS = {"closed": [], "crowded": [], "budgetHalf": False, "rain": False, "festival": False, "testMode": False}


def today() -> str:
    return datetime.now(IST).date().isoformat()


km = cities.km


def demo_login_on() -> bool:
    """Name-only sign-in, for the laptop and for testing before Google is set up. Off once GOOGLE_CLIENT_ID is set."""
    return os.getenv("DEMO_LOGIN", "1" if not os.getenv("GOOGLE_CLIENT_ID") else "0") == "1"


def seed_demo() -> None:
    """No sample content any more: every screen shows real data from the database.
    Removes the samples earlier versions seeded (their ids are in seeds.json), then sets the twist switches."""
    db = get_db()
    for coll, rows in (("tickets", SEEDS["tickets"]), ("verify", SEEDS["verify"]), ("queue", SEEDS["queue"]),
                       ("alerts", SEEDS["alerts"]), ("news", SEEDS["alerts"]), ("bazaar", SEEDS["bazaar"])):
        db[coll].delete_many({"_id": {"$in": [r["id"] for r in rows]}})
    db.business.delete_many({"owner": None})
    if not db.twists.find_one({"_id": "twists"}):
        db.twists.insert_one({"_id": "twists", **TWISTS})


_booted = False


def boot() -> None:
    global _booted
    if not _booted:
        seed_demo()
        seed_testers()
        _booted = True


def seed_testers() -> None:
    """Each test account starts with its own data (a saved chat, a shop for the business one), different per
    account, so a scan signed in as two of them can tell whether one can reach the other's records."""
    db = get_db()
    for u in auth.sync_testers():
        tag = u["name"]
        if not db.chats.find_one({"user": u["_id"]}):
            db.chats.insert_one({"_id": f"test-{u['_id'][:12]}", "user": u["_id"], "title": f"{tag}: what is open today", "city": "gwalior",
                                 "summary": f"Asked: what is open today ({tag})", "count": 1, "updated": now(),
                                 "msgs": [{"id": 1, "role": "user", "text": f"What is open today? ({tag})", "at": None, "cards": [], "chips": []}]})
        if "business" in u["roles"] and not db.business.find_one({"owner": u["_id"]}):
            # status "test": the owner can edit it, it never shows in the Bazaar.
            db.business.insert_one({"_id": f"btest{u['_id'][:6]}", "owner": u["_id"], "ownerName": tag, "name": f"{tag} shop", "kind": "food",
                                    "city": "gwalior", "near": "", "details": "Test shop for outside security testing. Not listed.", "status": "test", "at": now()})


@app.middleware("http")
async def seed_first(request, call_next):
    boot()
    return await call_next(request)


TAG = re.compile(r"<\s*/?\s*[a-zA-Z!][^>]*>")


def untag(v):
    """Strings lose anything shaped like an HTML tag; lists and objects are walked."""
    if isinstance(v, str):
        return TAG.sub("", v)
    if isinstance(v, list):
        return [untag(x) for x in v]
    if isinstance(v, dict):
        return {k: untag(x) for k, x in v.items()}
    return v


@app.middleware("http")
async def no_html_in(request, call_next):
    """Nothing users type is ever HTML (posts, comments, entries, shop and profile names, chats): tags are removed
    before any route sees the body, so stored text can never carry markup even where a screen might render it."""
    if request.method in ("POST", "PUT", "PATCH") and "application/json" in request.headers.get("content-type", ""):
        raw = await request.body()
        try:
            data = json.loads(raw or b"null")
        except ValueError:
            data = None
        if data is not None:
            fixed = json.dumps(untag(data)).encode()
            if fixed != json.dumps(data).encode():
                # Starlette replays the body it cached on this request to the route, so swap the cache.
                request._body = fixed
    return await call_next(request)


def data(city: str = "gwalior") -> dict:
    try:
        return cities.city(city, today())
    except KeyError:
        raise HTTPException(404, "city not covered")


def place(pid: str) -> tuple[str, dict]:
    hit = cities.find_place(pid, today())
    if not hit:
        raise HTTPException(404, f"unknown place {pid}")
    return hit


def twists() -> dict:
    boot()
    t = get_db().twists.find_one({"_id": "twists"}) or {}
    return {k: t.get(k, v) for k, v in TWISTS.items()}


EVERYONE = {"_id": "all"}  # app-wide caps on calls that cost money


def by_ip(request: Request) -> dict:
    """Guests have no account, so their rate limits go by network address (Vercel puts it in x-forwarded-for)."""
    ip = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip() or (request.client.host if request.client else "?")
    return {"_id": f"ip:{ip}"}


def strip(doc: dict) -> dict:
    """Mongo document out to the app: _id becomes id, dates become text."""
    out = {("id" if k == "_id" else k): (v.isoformat() if isinstance(v, datetime) else v) for k, v in doc.items()}
    return out


# ---------------- health and data ----------------
@app.get("/health")
def health():
    try:
        get_db().command("ping")
        db_ok = True
    except Exception:
        db_ok = False
    return {"ok": True, "db": db_ok, "dbKind": "atlas" if os.getenv("MONGODB_URI") else "memory",
            "ai": bool(os.getenv("GROQ_KEY") or os.getenv("ADAPTION_API_KEY")), "aiEngine": f"Adaption · {ADAPTION_MODEL}" if os.getenv("ADAPTION_API_KEY") else "Groq · gpt-oss-120b", "tts": bool(os.getenv("ELEVENLABS_KEY")), "stt": bool(os.getenv("GROQ_KEY")),
            "google": os.getenv("GOOGLE_CLIENT_ID"), "demoLogin": demo_login_on(), "today": today(), "dwellSeconds": DWELL_S}


@app.post("/reset")
def reset(me: dict | None = Depends(current)):
    """Back to the seed state. Only on the laptop's in-memory database, never on Atlas."""
    if os.getenv("MONGODB_URI"):
        raise HTTPException(403, "reset is off on a real database")
    db = get_db()
    for name in db.list_collection_names():
        db.drop_collection(name)
    get_db.__globals__["_db"] = None
    cities._cache.clear()
    global _booted
    _booted = False
    get_db()
    return {"ok": True}


@app.get("/cities")
def list_cities():
    out = []
    for c in cities.available():
        d = data(c)
        out.append({"id": c, "name": d["city"]["name"], "center": d["city"]["center"], "places": len(d["places"]), "checked": bool(d["places"])})
    return out


@app.get("/cities/nearest")
def nearest_city(lat: float, lng: float):
    """Which covered city the raahi is in, from their live location. null when far from all."""
    return cities.nearest(lat, lng, today())


@app.get("/cities/{city}/data")
def city_data(city: str):
    return data(city)


# ---------------- accounts ----------------
class GoogleIn(BaseModel):
    credential: str | None = None
    name: str | None = Field(default=None, max_length=40)  # demo sign-in only


@app.post("/auth/google")
def sign_in_google(body: GoogleIn):
    if body.credential:
        u = auth.google_user(auth.verify_google(body.credential))
    elif demo_login_on():
        u = auth.new_user(kind="demo", name=(body.name or "Raahi").strip()[:40] or "Raahi")
    else:
        raise HTTPException(422, "Google credential needed")
    return {"token": auth.issue(u["_id"]), "user": auth.public(u)}


class StaffIn(BaseModel):
    username: str = Field(min_length=2, max_length=40)
    password: str = Field(min_length=1, max_length=200)


@app.post("/auth/staff")
def sign_in_staff(body: StaffIn):
    """Direct sign-in for the moderators. Accounts are made with admin.py, never through the API."""
    u = auth.staff_login(body.username, body.password)
    return {"token": auth.issue(u["_id"]), "user": auth.public(u)}


class EmailIn(BaseModel):
    email: str = Field(min_length=5, max_length=120)
    password: str = Field(min_length=1, max_length=200)


@app.post("/auth/email")
def sign_in_email(body: EmailIn):
    """Email and password sign-in, only for the test accounts in TEST_LOGINS (raahis use Google)."""
    u = auth.staff_login(body.email.strip(), body.password, kind="test")
    if not u.get("roles"):
        raise HTTPException(403, "this test account is closed")
    return {"token": auth.issue(u["_id"]), "user": auth.public(u)}


@app.get("/me")
def me_get(me: dict | None = Depends(current)):
    return auth.public(need(me))


class ProfileIn(BaseModel):
    name: str | None = Field(default=None, max_length=40)
    interests: list[str] | None = None
    prefs: dict | None = None
    prompt: list[str] | None = None
    avatar: str | None = Field(default=None, max_length=30)
    frame: str | None = Field(default=None, max_length=30)
    banner: str | None = Field(default=None, max_length=30)
    city: str | None = Field(default=None, max_length=30)


@app.get("/me/profile")
def get_profile(me: dict | None = Depends(current)):
    if not me:
        return {"id": "guest", "interests": [], "prefs": {}, "prompt": []}
    return auth.public(me)


@app.put("/me/profile")
def put_profile(body: ProfileIn, me: dict | None = Depends(current)):
    me = need(me)
    upd = {k: v for k, v in body.model_dump().items() if v is not None}
    if "prompt" in upd:
        # Never store religion: the prompt is free text, so drop lines that state one.
        upd["prompt"] = [l[:200] for l in upd["prompt"][:10] if not re.search(r"\b(is|am)\s+(hindu|muslim|sikh|christian|jain|buddhist)\b", l, re.I)]
    # Role-only looks need the role (and the senior saarthi frame 25 approved entries).
    for key in ("frame", "banner"):
        need_role = ROLE_LOOKS.get(upd.get(key, ""))
        if need_role:
            role, work = need_role
            ok = role in me["roles"] and (not work or get_db().verify.count_documents({"byUser": me["_id"], "status": "approved"}) >= work)
            if not ok:
                raise HTTPException(403, f"that {key} is for {role}s only")
    if upd:
        get_db().users.update_one({"_id": me["_id"]}, {"$set": upd})
    return auth.public(get_db().users.find_one({"_id": me["_id"]}))


ROLE_LOOKS = {"saarthi": ("saarthi", 0), "saarthi-senior": ("saarthi", 25), "bazaar": ("business", 0), "team": ("moderator", 0),
              "fieldnotes": ("saarthi", 0), "market": ("business", 0), "control": ("moderator", 0)}


class ApplyIn(BaseModel):
    region: str = Field(min_length=2, max_length=80)
    note: str = Field(default="", max_length=500)


@app.post("/me/apply-saarthi")
def apply_saarthi(body: ApplyIn, me: dict | None = Depends(current)):
    me = need(me)
    if "saarthi" in me["roles"]:
        return {"status": "already a saarthi"}
    limit(me, "apply", 3, 24 * 60)
    get_db().queue.replace_one({"_id": f"m-apply-{me['_id']}"}, {
        "_id": f"m-apply-{me['_id']}", "kind": "application", "user": me["_id"], "region": body.region,
        "title": f"Saarthi application: {me.get('name', 'Raahi')}", "detail": f"{body.region}. {body.note}".strip(), "status": "pending", "at": now()}, upsert=True)
    return {"status": "pending"}


def award(uid: str, key: str, points: int) -> int:
    """Points for an action, given once per key (no farming by repeating it)."""
    try:
        get_db().awards.insert_one({"_id": f"{uid}:{key}", "user": uid, "points": points, "at": now()})
    except DuplicateKeyError:
        return 0
    get_db().users.update_one({"_id": uid}, {"$inc": {"points": points}})
    return points


# ---------------- plans ----------------
class PlanIn(BaseModel):
    input: dict
    order: list[str] | None = None
    done: list[str] = []
    added: list[str] = []
    city: str = "gwalior"


@app.post("/plans")
def create_plan(body: PlanIn, me: dict | None = Depends(current)):
    p = {"_id": uuid.uuid4().hex[:10], "user": me["_id"] if me else None, **body.model_dump(), "at": now()}
    get_db().plans.insert_one(p)
    return strip(p)


@app.put("/plans/{pid}")
def update_plan(pid: str, body: PlanIn, me: dict | None = Depends(current)):
    p = get_db().plans.find_one({"_id": pid})
    if not p:
        raise HTTPException(404, "no such plan")
    if p.get("user") and (not me or me["_id"] != p["user"]):
        raise HTTPException(403, "not your plan")
    get_db().plans.update_one({"_id": pid}, {"$set": {**body.model_dump(), "at": now()}})
    return strip(get_db().plans.find_one({"_id": pid}))


@app.get("/plans/{pid}")
def get_plan(pid: str):
    """Shared plans are readable by link."""
    p = get_db().plans.find_one({"_id": pid})
    if not p:
        raise HTTPException(404, "no such plan")
    return strip(p)


@app.get("/me/plans")
def my_plans(me: dict | None = Depends(current)):
    me = need(me)
    return [strip(p) for p in get_db().plans.find({"user": me["_id"]}).sort("at", -1).limit(10)]


# ---------------- stamps (server-side location check) ----------------
class Reading(BaseModel):
    lat: float
    lng: float
    accuracy: float
    t: float  # epoch seconds


class StampIn(BaseModel):
    placeId: str
    readings: list[Reading] = []
    code: str | None = None
    ipCity: str | None = None


def rarity(p: dict) -> str:
    if p.get("sensitive") or p["guardrail"]["status"] in ("notEligible", "withdrawn"):
        return "plain"
    return "rare" if p.get("lesserKnown") else "common"


@app.post("/stamps")
def stamp(body: StampIn, me: dict | None = Depends(current)):
    me = need(me)
    limit(me, "stamp", 30, 60)
    city, p = place(body.placeId)
    at = p["units"][0]["coord"]
    checks: list[dict] = []
    test = twists()["testMode"]
    rs = body.readings[:20]
    if test:
        rs = [Reading(lat=at[0], lng=at[1], accuracy=10, t=time.time() - 120 + i * 60) for i in range(3)]
    inside = bool(rs) and all(km([r.lat, r.lng], at) <= GEOFENCE_KM for r in rs)
    checks.append({"check": "geofence", "ok": inside})
    good_acc = bool(rs) and all(r.accuracy <= MIN_ACCURACY_M for r in rs)
    checks.append({"check": "accuracy", "ok": good_acc, "soft": True})
    dwell = len(rs) >= 3 and (max(r.t for r in rs) - min(r.t for r in rs)) >= DWELL_S
    checks.append({"check": "dwell", "ok": dwell})
    db = get_db()
    fast = False
    last = db.stamps.find_one({"user": me["_id"], "status": {"$ne": "rejected"}}, sort=[("t", -1)])
    if last and rs and last["place"] != body.placeId:
        lp = cities.find_place(last["place"], today())
        hrs = max((rs[0].t - last["t"]) / 3600, 1e-6)
        fast = bool(lp) and km([rs[0].lat, rs[0].lng], lp[1]["units"][0]["coord"]) / hrs > MAX_SPEED_KMH
    checks.append({"check": "impossibleTravel", "ok": not fast})
    names = {city, data(city)["city"]["name"]["hi"]}
    ip_ok = not body.ipCity or body.ipCity.lower() in names
    checks.append({"check": "ipCity", "ok": ip_ok, "soft": True})
    code_ok = bool(body.code) and body.code.strip().upper() == COUNTER_CODE
    if code_ok:
        checks.append({"check": "counterCode", "ok": True})

    hard_fail = not (inside and dwell and not fast)
    soft_fail = not (good_acc and ip_ok)
    if code_ok and not fast:
        status = "confirmed"
    elif hard_fail:
        status = "rejected"
    elif soft_fail:
        status = "pending"
    else:
        status = "confirmed"
    r = rarity(p)
    quiet = datetime.now(IST).hour < 10
    pts = 0
    if status == "confirmed":
        pts = award(me["_id"], f"stamp:{body.placeId}", {"rare": 50, "common": 20, "plain": 10}[r] + (10 if quiet and r != "plain" else 0))
    if status != "rejected":
        db.stamps.update_one({"_id": f"{me['_id']}:{body.placeId}"}, {"$set": {
            "user": me["_id"], "place": body.placeId, "city": city, "status": status, "rarity": r, "quiet": quiet,
            "t": rs[-1].t if rs else time.time(), "date": today()}}, upsert=True)
    return {"status": status, "rarity": r, "points": pts, "checks": checks, "testMode": test}


@app.get("/me/stamps")
def my_stamps(me: dict | None = Depends(current)):
    me = need(me)
    return {s["place"]: {k: s[k] for k in ("status", "rarity", "quiet", "t", "date", "city")} for s in get_db().stamps.find({"user": me["_id"]})}


def tier(got: int, total: int) -> str | None:
    if not total:
        return None
    return "gold" if got >= total else "silver" if got >= math.ceil(total / 2) else "bronze" if got >= 3 else None


@app.get("/me/progress")
def progress(me: dict | None = Depends(current)):
    me = need(me)
    mine = {s["place"]: s for s in get_db().stamps.find({"user": me["_id"]})}
    st = [s for s in mine.values() if s["status"] == "confirmed"]
    pts = get_db().users.find_one({"_id": me["_id"]}).get("points", 0)
    out = {"points": pts, "level": 1 + pts // 100, "stamps": len(st), "rare": sum(s["rarity"] == "rare" for s in st), "quiet": sum(s["quiet"] for s in st)}
    for c in cities.available():
        counted = [p for p in data(c)["places"] if rarity(p) != "plain"]
        got = sum(1 for p in counted if mine.get(p["id"], {}).get("status") == "confirmed")
        out[c] = {"got": got, "total": len(counted), "tier": tier(got, len(counted))}
    out["streak"] = streak(me["_id"])
    # Badge counts, all from recorded events.
    db = get_db()
    food_shops = {b["_id"] for b in db.business.find({"kind": "food"}, {"_id": 1})}
    out["feedback"] = len(db.tickets.distinct("place", {"user": me["_id"]}))
    out["food"] = len({a["_id"].split(":")[2] for a in db.awards.find({"user": me["_id"], "_id": {"$regex": ":visit:"}}) if a["_id"].split(":")[2] in food_shops})
    out["night"] = sum(1 for s in st if datetime.fromtimestamp(s.get("t", 0), IST).hour >= 19)
    out["cities"] = len({s.get("city") for s in st})
    out["indoreStamps"] = sum(1 for s in st if s.get("city") == "indore")
    return out


def streak(uid: str) -> int:
    """Days in a row, ending today or yesterday, on which the raahi earned points."""
    days = {datetime.fromisoformat(str(a["at"])[:19]).replace(tzinfo=timezone.utc).astimezone(IST).date()
            for a in get_db().awards.find({"user": uid}, {"at": 1})}
    day = datetime.now(IST).date()
    if day not in days:
        day -= timedelta(days=1)
    n = 0
    while day in days:
        n += 1
        day -= timedelta(days=1)
    return n


@app.get("/leaderboard")
def leaderboard(period: str = "week", city: str | None = None, me: dict | None = Depends(current)):
    """Top raahis by points, this week (from the points log) or all time. Moderators are left out."""
    db = get_db()
    if period == "week":
        since = now() - timedelta(days=7)
        q: dict = {"at": {"$gte": since}}
        totals: dict[str, int] = {}
        for a in db.awards.find(q, {"user": 1, "points": 1}):
            totals[a["user"]] = totals.get(a["user"], 0) + a.get("points", 0)
    else:
        totals = {u["_id"]: u.get("points", 0) for u in db.users.find({"points": {"$gt": 0}}, {"points": 1})}
    users = {u["_id"]: u for u in db.users.find({"_id": {"$in": list(totals)}, "roles": {"$ne": "moderator"}, "banned": {"$ne": True}})}
    ranked = sorted(((uid, pts) for uid, pts in totals.items() if uid in users and pts > 0), key=lambda x: -x[1])
    rows = []
    for i, (uid, pts) in enumerate(ranked[:20]):
        u = users[uid]
        rows.append({"rank": i + 1, "id": uid, "name": u.get("name", "Raahi"), "avatar": u.get("avatar"), "frame": u.get("frame"),
                     "points": pts, "level": 1 + u.get("points", 0) // 100, "stamps": db.stamps.count_documents({"user": uid, "status": "confirmed"}),
                     "me": bool(me and me["_id"] == uid)})
    mine = next((i + 1 for i, (uid, _) in enumerate(ranked) if me and uid == me["_id"]), None)
    return {"period": period, "rows": rows, "myRank": mine, "players": len(ranked)}


# ---------------- feedback, still true, tickets ----------------
class FeedbackIn(BaseModel):
    placeId: str
    answers: dict = {}
    note: str = Field(default="", max_length=500)
    proof: str | None = None


@app.post("/feedback")
def feedback(body: FeedbackIn, me: dict | None = Depends(current)):
    me = need(me)
    city, _ = place(body.placeId)
    if not body.answers and not body.note.strip():
        raise HTTPException(422, "nothing to send")
    limit(me, "feedback", 10, 24 * 60)
    t = {"_id": f"t{uuid.uuid4().hex[:6]}", "place": body.placeId, "city": city, "user": me["_id"], "from": me.get("name", "Raahi"),
         "text": "; ".join(f"{k}: {v}" for k, v in list(body.answers.items())[:10]) + (f"; {body.note}" if body.note else ""),
         "status": "open", "proof": body.proof, "at": now()}
    get_db().tickets.insert_one(t)
    return {"ticket": t["_id"], "points": award(me["_id"], f"feedback:{body.placeId}:{today()}", 15)}


class StillIn(BaseModel):
    placeId: str
    yes: bool


@app.post("/still-true")
def still_true(body: StillIn, me: dict | None = Depends(current)):
    me = need(me)
    city, _ = place(body.placeId)
    db = get_db()
    db.still.update_one({"_id": f"{me['_id']}:{body.placeId}:{today()}"}, {"$set": {"place": body.placeId, "yes": body.yes, "at": now()}}, upsert=True)
    yes = db.still.count_documents({"place": body.placeId, "yes": True})
    no = db.still.count_documents({"place": body.placeId, "yes": False})
    if not body.yes and no in (1, 3):  # disagreement makes a saarthi task
        db.tickets.insert_one({"_id": f"t{uuid.uuid4().hex[:6]}", "place": body.placeId, "city": city, "from": "Still-true taps",
                               "text": f"{no} raahi(s) say something differs", "status": "open", "at": now()})
    return {"yes": yes, "no": no}


# ---------------- side quests ----------------
# Every quest counts events the server recorded for this account, and pays its points once when done.
QUEST_LIST = [
    {"id": "q1", "en": "See a place before 10 AM", "hi": "सुबह 10 बजे से पहले कोई जगह देखें", "pts": 30, "need": 1},
    {"id": "q2", "en": "Collect a stamp at a lesser-known place", "hi": "कम जानी-पहचानी जगह पर स्टैम्प लें", "pts": 50, "need": 1},
    {"id": "q3", "en": "Read 3 place pages", "hi": "3 जगहों के पेज पढ़ें", "pts": 20, "need": 3},
    {"id": "q4", "en": "Send feedback on 2 places", "hi": "2 जगहों पर फ़ीडबैक भेजें", "pts": 40, "need": 2},
    {"id": "q5", "en": "Go beyond the fort: a stamp at a park, lake, market or mall", "hi": "किले से आगे: पार्क, झील, बाज़ार या मॉल पर स्टैम्प", "pts": 30, "need": 1},
    {"id": "q6", "en": "Collect stamps in both Gwalior and Indore", "hi": "ग्वालियर और इंदौर दोनों में स्टैम्प लें", "pts": 80, "need": 2},
]
BEYOND = {"nature", "markets", "modern", "food", "activities"}


@app.post("/me/read/{pid}")
def read_place(pid: str, me: dict | None = Depends(current)):
    """A raahi opened a place page. Counted once per place."""
    me = need(me)
    place(pid)
    get_db().reads.update_one({"_id": f"{me['_id']}:{pid}"}, {"$setOnInsert": {"user": me["_id"], "place": pid, "at": now()}}, upsert=True)
    return {"ok": True}


@app.get("/me/quests")
def my_quests(me: dict | None = Depends(current)):
    me = need(me)
    db = get_db()
    st = [s for s in db.stamps.find({"user": me["_id"], "status": "confirmed"})]
    tags = {}
    for s in st:
        hit = cities.find_place(s["place"], today())
        tags[s["place"]] = set(hit[1].get("tags", [])) if hit else set()
    have = {
        "q1": sum(1 for s in st if s.get("quiet")),
        "q2": sum(1 for s in st if s.get("rarity") == "rare"),
        "q3": db.reads.count_documents({"user": me["_id"]}),
        "q4": len(db.tickets.distinct("place", {"user": me["_id"]})),
        "q5": sum(1 for s in st if tags.get(s["place"], set()) & BEYOND),
        "q6": len({s.get("city") for s in st}),
    }
    out = []
    for q in QUEST_LIST:
        n = min(have[q["id"]], q["need"])
        paid = award(me["_id"], f"quest:{q['id']}", q["pts"]) if n >= q["need"] else 0
        out.append({**q, "have": n, "done": n >= q["need"], "paidNow": paid})
    return out


@app.get("/tickets")
def tickets(city: str | None = None, me: dict | None = Depends(current)):
    need(me, "saarthi")
    boot()
    q = {"city": city} if city else {}
    return [strip(t) for t in get_db().tickets.find(q).sort("at", -1).limit(100)]


class AnswerIn(BaseModel):
    answer: str = Field(default="", max_length=500)
    escalate: bool = False


@app.post("/tickets/{tid}/answer")
def answer_ticket(tid: str, body: AnswerIn, me: dict | None = Depends(current)):
    me = need(me, "saarthi")
    db = get_db()
    t = db.tickets.find_one({"_id": tid})
    if not t:
        raise HTTPException(404, "no such ticket")
    if body.escalate:
        db.tickets.update_one({"_id": tid}, {"$set": {"status": "escalated"}})
        db.queue.replace_one({"_id": f"m-{tid}"}, {"_id": f"m-{tid}", "kind": "ticket", "title": f"Escalated ticket: {t['place']}", "detail": t["text"], "status": "pending", "at": now()}, upsert=True)
    else:
        db.tickets.update_one({"_id": tid}, {"$set": {"status": "answered", "answer": body.answer or "Checked on site.", "answeredBy": me["_id"]}})
    return strip(db.tickets.find_one({"_id": tid}))


# ---------------- alerts, bazaar, sos ----------------
WEATHER_TTL_S = 4 * 3600  # weather refreshes at most every 4 hours
WMO = {0: ("Clear", "साफ़"), 1: ("Mostly clear", "ज़्यादातर साफ़"), 2: ("Partly cloudy", "आंशिक बादल"), 3: ("Cloudy", "बादल"),
       45: ("Fog", "कोहरा"), 48: ("Fog", "कोहरा"), 51: ("Light drizzle", "हल्की बूंदाबांदी"), 53: ("Drizzle", "बूंदाबांदी"), 55: ("Heavy drizzle", "तेज़ बूंदाबांदी"),
       61: ("Light rain", "हल्की बारिश"), 63: ("Rain", "बारिश"), 65: ("Heavy rain", "तेज़ बारिश"), 80: ("Rain showers", "बौछारें"), 81: ("Rain showers", "बौछारें"),
       82: ("Heavy showers", "तेज़ बौछारें"), 95: ("Thunderstorm", "आंधी-तूफ़ान"), 96: ("Thunderstorm with hail", "ओलों के साथ तूफ़ान"), 99: ("Thunderstorm with hail", "ओलों के साथ तूफ़ान")}


def weather(city: str) -> dict | None:
    """Current weather and today's outlook from Open-Meteo (free, no key), cached in the database for 4 hours."""
    db = get_db()
    hit = db.weather.find_one({"_id": city})
    if hit and time.time() - hit.get("t", 0) < WEATHER_TTL_S:
        return hit
    lat, lng = data(city)["city"]["center"]
    try:
        r = httpx.get("https://api.open-meteo.com/v1/forecast", timeout=6, params={
            "latitude": lat, "longitude": lng, "timezone": "Asia/Kolkata", "forecast_days": 1,
            "current": "temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m",
            "daily": "temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,sunrise,sunset"})
        r.raise_for_status()
        j = r.json()
    except Exception as e:
        print(f"weather error {city}: {e}", flush=True)
        return hit  # keep the last good reading
    w = {"_id": city, "t": time.time(), "at": now(), "current": j.get("current", {}), "daily": {k: (v[0] if v else None) for k, v in j.get("daily", {}).items()}}
    db.weather.replace_one({"_id": city}, w, upsert=True)
    return w


def weather_alert(city: str) -> dict | None:
    w = weather(city)
    if not w:
        return None
    c, d = w["current"], w["daily"]
    sky = WMO.get(c.get("weather_code"), ("", ""))
    en = f"{sky[0]}, {round(c.get('temperature_2m', 0))}°C now (feels {round(c.get('apparent_temperature', 0))}°C). Today {round(d.get('temperature_2m_min') or 0)} to {round(d.get('temperature_2m_max') or 0)}°C, rain chance {d.get('precipitation_probability_max') or 0}%."
    hi = f"{sky[1]}, अभी {round(c.get('temperature_2m', 0))}°C (महसूस {round(c.get('apparent_temperature', 0))}°C)। आज {round(d.get('temperature_2m_min') or 0)} से {round(d.get('temperature_2m_max') or 0)}°C, बारिश की संभावना {d.get('precipitation_probability_max') or 0}%।"
    tips = []
    if (d.get("temperature_2m_max") or 0) >= 36:
        tips.append(("Hot day: carry water and plan open-air places for the morning.", "गर्म दिन: पानी साथ रखें, खुली जगहें सुबह देखें।"))
    if (d.get("precipitation_probability_max") or 0) >= 60:
        tips.append(("Rain likely: carry an umbrella. Waterfalls and dam edges get slippery.", "बारिश की संभावना: छाता रखें। झरने और बाँध के किनारे फिसलन भरे होते हैं।"))
    if (d.get("uv_index_max") or 0) >= 8:
        tips.append(("Strong sun (UV high): wear a cap and sunscreen.", "तेज़ धूप (UV ज़्यादा): टोपी और सनस्क्रीन लगाएँ।"))
    return {"id": f"weather-{city}", "kind": "weather", "en": " ".join([en] + [t[0] for t in tips]), "hi": " ".join([hi] + [t[1] for t in tips]),
            "source": "Open-Meteo weather service", "at": datetime.fromtimestamp(w["t"], IST).strftime("%H:%M"), "live": True}


NEWS_SKIP_SOURCES = {"YouTube", "IQAir", "SpaceRef", "AccuWeather", "Weather.com", "MSN Weather", "The Weather Channel", "Time and Date"}
NEWS_Q = {"gwalior": "Gwalior (tourism OR fort OR traffic OR festival OR closed OR weather)",
          "indore": "Indore (tourism OR Rajwada OR traffic OR festival OR closed OR weather)"}


def fetch_news(city: str) -> None:
    """Every 6 hours per city: local headlines from Google News go to the moderators as pending news.
    Nothing reaches raahis until a moderator approves it. A failed pull is retried on the next request."""
    db = get_db()
    slot = f"{city}:{today()}:{datetime.now(IST).hour // 6}"
    if db.newsfetch.find_one({"_id": slot}):
        return
    try:
        r = httpx.get("https://news.google.com/rss/search", params={"q": NEWS_Q.get(city, city) + " when:7d", "hl": "en-IN", "gl": "IN", "ceid": "IN:en"}, timeout=8)
        r.raise_for_status()
        items = re.findall(r"<item>(.*?)</item>", r.text, re.S)[:12]
    except Exception as e:
        print(f"news error {city}: {e}", flush=True)
        return
    db.newsfetch.update_one({"_id": slot}, {"$set": {"at": now(), "items": len(items)}}, upsert=True)
    for it in items:
        title = re.sub(r"<!\[CDATA\[|\]\]>", "", (re.search(r"<title>(.*?)</title>", it, re.S) or [None, ""])[1]).strip()
        link = (re.search(r"<link>(.*?)</link>", it, re.S) or [None, ""])[1].strip()
        src = (re.search(r"<source[^>]*>(.*?)</source>", it, re.S) or [None, "Google News"])[1].strip()
        pub = (re.search(r"<pubDate>(.*?)</pubDate>", it, re.S) or [None, ""])[1].strip()
        title, src = html.unescape(title), html.unescape(src)
        title = re.sub(rf"\s+-\s+{re.escape(src)}$", "", title).strip()  # Google appends " - Source"
        if junk_news(title, src, city) or stale_news(pub):
            continue
        try:
            when = parsedate_to_datetime(pub).astimezone(IST).strftime("%d %b %Y %H:%M")
        except Exception:
            when = datetime.now(IST).strftime("%d %b %Y %H:%M")
        nid = "n" + hashlib.sha1(link.encode()).hexdigest()[:10]
        db.news.update_one({"_id": nid}, {"$setOnInsert": {"kind": "news", "city": city, "en": title, "link": link, "source": src,
                                                           "published": pub, "at": when, "ts": news_ts(pub), "status": "pending"}}, upsert=True)
    # Clear older pending items that today's filter would have dropped.
    for n in db.news.find({"city": city, "status": "pending"}, {"en": 1, "source": 1}):
        if junk_news(n["en"], n.get("source", ""), city):
            db.news.delete_one({"_id": n["_id"]})


NEWS_MAX_DAYS = 7


def news_ts(pub: str) -> float:
    """Publish time as a number, for newest-first order (the shown "at" text does not sort by date)."""
    try:
        return parsedate_to_datetime(pub).timestamp()
    except Exception:
        return 0.0


def stale_news(pub: str) -> bool:
    """Google's search mixes in old articles: only the last week is news for a visitor."""
    try:
        return datetime.now(timezone.utc) - parsedate_to_datetime(pub) > timedelta(days=NEWS_MAX_DAYS)
    except Exception:
        return False


# What a visitor can act on: getting around, closures, crowds, events, the places themselves.
NEWS_TOPIC = re.compile(r"traffic|road|route|divert|diversion|jam|closed|closure|shut|reopen|open(s|ed)? (to|for)|ban|curfew|protest|bandh|strike|"
                        r"festival|mela|fair|utsav|event|celebrat|procession|holiday|diwali|navratri|dussehra|holi|"
                        r"touris|visitor|heritage|monument|fort|palace|temple|museum|zoo|lake|dam|garden|park|light and sound|ticket|"
                        r"station|railway|train|airport|flight|bus|metro|auto|rickshaw|cab|fare|"
                        r"rain|flood|heat|cold wave|fog|storm|alert|crowd|stampede|safety|police advisory|hotel|food street|market", re.I)


def junk_news(title: str, src: str, city: str | None = None) -> bool:
    """Not news a visitor needs: videos, weather or air-quality widget pages, pages titled only with a place name, and,
    for a city, headlines that are not about that city or not about anything a visitor acts on (Google files national
    stories under a city section: "Lula bucks the rightward tide" under Indore)."""
    if not title or src in NEWS_SKIP_SOURCES:
        return True
    if city in cities.CITY_IDS:
        d = data(city)
        local = [d["city"]["name"]["en"]] + [p["name"]["en"].split(" (")[0].split(",")[0] for p in d["places"]]
        here = any(re.search(rf"\b{re.escape(n)}\b", title, re.I) for n in local if len(n) > 3)
        if not here or not (NEWS_TOPIC.search(title) or any(re.search(rf"\b{re.escape(n)}\b", title, re.I) for n in local[1:] if len(n) > 3)):
            return True
    if re.search(r"forecast|weather today|air quality|\bAQI\b|#vlog|youtube|hourly|10[- ]day", title, re.I):
        return True
    bare = re.sub(rf"\s+-\s+{re.escape(src)}$", "", title)
    # "Indore, Madhya Pradesh, India": only place words, no news in it
    return bool(re.fullmatch(r"[A-Za-z .]+(,\s*[A-Za-z .]+){1,3}", bare)) and len(bare.split()) <= 6


@app.get("/cron/news")
def cron_news(authorization: str | None = Header(None)):
    """Vercel Cron calls this once a day (vercel.json), so news reaches the moderators even when nobody opens the app.
    Harmless if anyone else calls it: each city pulls at most once per 6-hour slot. With CRON_SECRET set on the
    server, only Vercel's call (which sends that secret) is accepted."""
    secret = os.getenv("CRON_SECRET")
    if secret and authorization != f"Bearer {secret}":
        raise HTTPException(401, "cron only")
    boot()
    for c in cities.CITY_IDS:
        fetch_news(c)
    return {"ok": True, "pending": get_db().news.count_documents({"status": "pending"})}


@app.get("/alerts")
def alerts(city: str = "gwalior"):
    """Live weather (refreshed every 4 hours) and news a moderator approved. Pulls today's news for review once a day."""
    boot()
    if city not in cities.CITY_IDS:
        raise HTTPException(404, "city not covered")
    fetch_news(city)
    out = []
    w = weather_alert(city)
    if w:
        out.append(w)
    out += [strip(n) for n in get_db().news.find({"city": city, "status": "approved"}).sort("ts", -1).limit(5)]
    return out


@app.get("/weather")
def weather_now(city: str = "gwalior"):
    w = weather(city)
    if not w:
        raise HTTPException(503, "weather not available")
    return strip(w)


@app.get("/bazaar")
def bazaar(route: str = "", city: str = "gwalior"):
    """Shops whose owners applied and a moderator approved."""
    ids = [x for x in route.split(",") if x]
    return [strip(b) for b in get_db().business.find({"city": city, "status": "live"}) if not ids or b.get("near") in ids or b.get("sponsored")]


@app.get("/bazaar/{bid}")
def bazaar_one(bid: str, me: dict | None = Depends(current)):
    b = get_db().business.find_one({"_id": bid, "status": "live"})
    if not b:
        raise HTTPException(404, "no such shop")
    db = get_db()
    out = strip(b)
    out["followers"] = db.follows.count_documents({"target": b["owner"]})
    out["following"] = bool(me and db.follows.find_one({"_id": f"{me['_id']}:{b['owner']}"}))
    out["visitedToday"] = bool(me and db.awards.find_one({"_id": f"{me['_id']}:visit:{bid}:{today()}"}))
    return out


class NoteIn(BaseModel):
    text: str = Field(min_length=1, max_length=300)


@app.get("/bazaar/{bid}/comments")
def bazaar_comments(bid: str):
    return [strip(c) for c in get_db().comments.find({"biz": bid, "status": {"$ne": "removed"}}).sort("at", -1).limit(50)]


@app.post("/bazaar/{bid}/comments")
def bazaar_comment(bid: str, body: NoteIn, me: dict | None = Depends(current)):
    me = need(me)
    if not get_db().business.find_one({"_id": bid, "status": "live"}):
        raise HTTPException(404, "no such shop")
    limit(me, "comment", 20, 60)
    c = {"_id": uuid.uuid4().hex[:12], "biz": bid, "by": me["_id"], "byName": me.get("name", "Raahi"), "text": social.clean(body.text, False), "status": "live", "reports": 0, "at": now()}
    get_db().comments.insert_one(c)
    return strip(c)


@app.post("/bazaar/{bid}/visit")
def bazaar_visit(bid: str, me: dict | None = Depends(current)):
    """A raahi says they visited a shop: points once a day per shop."""
    me = need(me)
    if not get_db().business.find_one({"_id": bid, "status": "live"}):
        raise HTTPException(404, "no such shop")
    return {"points": award(me["_id"], f"visit:{bid}:{today()}", 5)}


class SosIn(BaseModel):
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    accuracy: float | None = Field(default=None, ge=0, le=100000)
    note: str = Field(default="", max_length=300)


@app.post("/sos")
def sos(body: SosIn, me: dict | None = Depends(current)):
    """The 112 call is a phone link on the device. This logs the alert for moderators. Guests can use it too."""
    t = datetime.now(IST)
    near = cities.nearest(body.lat, body.lng, today()) if body.lat is not None and body.lng is not None else None
    e = {"_id": uuid.uuid4().hex[:8], "user": me["_id"] if me else "guest", "name": (me or {}).get("name", "Guest"),
         "at": now(), "date": t.date().isoformat(), "time": t.strftime("%H:%M:%S"), "city": (near or {}).get("city"),
         "status": "open", **body.model_dump()}
    get_db().sos.insert_one(e)
    return {"logged": True, "call": "112"}


def sos_account(uid: str) -> dict | None:
    """Everything a moderator needs to help: who pressed it, how to reach them, and where their day was going."""
    db = get_db()
    u = db.users.find_one({"_id": uid})
    if not u:
        return None
    last_stamp = db.stamps.find_one({"user": uid}, sort=[("t", -1)])
    plan = db.plans.find_one({"user": uid}, sort=[("at", -1)])
    prefs = u.get("prefs", {}) or {}
    return {
        "id": uid, "name": u.get("name"), "email": u.get("email"), "signIn": u.get("kind", "google"), "roles": u.get("roles", []),
        "joined": str(u.get("createdAt", ""))[:10] or None, "city": u.get("city"), "points": u.get("points", 0),
        "group": {k: prefs.get(k) for k in ("group", "elders", "access") if k in prefs},
        "lastStamp": {"place": last_stamp["place"], "date": last_stamp.get("date"),
                      "time": datetime.fromtimestamp(last_stamp.get("t", 0), IST).strftime("%H:%M")} if last_stamp else None,
        "lastPlan": {"date": (plan.get("input") or {}).get("date"), "stops": plan.get("order") or [], "done": plan.get("done") or []} if plan else None,
        "earlierPresses": db.sos.count_documents({"user": uid}) - 1,
    }


# ---------------- chat: retrieval agent + model ----------------
class Turn(BaseModel):
    role: str
    text: str


class ChatIn(BaseModel):
    text: str = Field(max_length=1000)
    history: list[Turn] = []
    lang: str = "en"
    prompt: list[str] = []
    roadmap: dict | None = None  # summary of the raahi's plan, computed on the device
    city: str = "gwalior"
    origin: dict | None = None  # {"name", "lat", "lng"}: the raahi's roadmap start or shared location
    lastPlaces: list[str] = []  # places the previous reply showed: "where is this listed?" follows on from them
    earlier: str = Field(default="", max_length=900)  # a short summary of this chat's older messages, made on the device
    chatId: str = Field(default="", max_length=40)


LABEL_WORDS = {
    "en": {"officially confirmed": "officially confirmed", "locally verified": "checked on site", "recently reported": "recently reported", "estimated": "an estimate", "historical pattern": "a past pattern", "unverified": "not verified", "potentially outdated": "may be outdated"},
    "hi": {"officially confirmed": "आधिकारिक रूप से पुष्ट", "locally verified": "मौके पर जाँचा", "recently reported": "हाल में बताया गया", "estimated": "अनुमान", "historical pattern": "पुराना पैटर्न", "unverified": "असत्यापित", "potentially outdated": "पुराना हो सकता है"},
}
VERDICT_WORDS = {
    "en": {"good to go": "you can go today", "possible with precautions": "you can go today, with care", "needs confirmation": "confirm with the place before going", "not feasible": "not possible today"},
    "hi": {"good to go": "आज जा सकते हैं", "possible with precautions": "आज जा सकते हैं, सावधानी से", "needs confirmation": "जाने से पहले जगह से पुष्टि करें", "not feasible": "आज संभव नहीं"},
}


def fact(f: dict | None, lang: str, d: dict) -> dict:
    if not f or f.get("v") is None and not f.get("s") and not f.get("t"):
        return {"value": "unavailable", "why": (f or {}).get("why", {}).get(lang, "not on record")}
    # Sources disagree: the model gets only the advisory, never the disputed values (Priyangi, Fact 2).
    if f.get("s") == "conflicting":
        return {"value": "not confirmed: sources disagree", "advisory": (f.get("why") or {}).get(lang, "Published sources disagree.")}
    out = {"value": (f.get("t") or {}).get(lang, f.get("v")), "howSure": LABEL_WORDS[lang].get(f.get("s"), f.get("s")), "date": f.get("ver")}
    if f.get("src"):
        out["source"] = d["sources"].get(f["src"], {}).get("name", f["src"])
    return out


def fees_pack(u: dict, lang: str, d: dict) -> dict:
    f = u["fees"]
    if f.get("v") is None or f.get("s") == "conflicting":
        return fact(f, lang, d)
    # Plain sentences, not a table: models misread tables of numbers.
    return {"prices": [fee_line(r, lang) for r in f["v"]["rows"]], "howSure": LABEL_WORDS[lang].get(f.get("s"), f.get("s")), "date": f.get("ver")}


def money(n, lang: str) -> str:
    if n is None:
        return "not known" if lang == "en" else "पता नहीं"
    if n == 0:
        return "free" if lang == "en" else "मुफ़्त"
    return f"₹{n}"


def fee_line(r: dict, lang: str) -> str:
    who = r["label"][lang]
    if "any" in r:
        return f"{who}: {money(r.get('any'), lang)}"
    if lang == "hi":
        return f"{who}: नकद {money(r.get('cash'), lang)}, ऑनलाइन {money(r.get('online'), lang)}"
    return f"{who}: {money(r.get('cash'), lang)} cash, {money(r.get('online'), lang)} online"


ROAD_FACTOR = 1.5  # same estimate as the app (src/core/geo.ts)
SPEED_KMH = {"walk": 4.5, "auto": 18, "cab": 22}
CONFIRM_WORDS = {
    "en": {"hours": "opening hours", "weeklyClosed": "weekly closed day", "lastEntry": "last entry time", "unavailable": "not published anywhere",
           "conflicting": "sources disagree", "unverified": "only one unofficial source", "recently reported": "from a news or travel report, not the custodian",
           "potentially outdated": "the source may be old", "estimated": "our estimate", "closing day conflicts between sources": "weekly closed day: sources disagree"},
    "hi": {"hours": "खुलने का समय", "weeklyClosed": "साप्ताहिक बंदी", "lastEntry": "आख़िरी प्रवेश का समय", "unavailable": "कहीं प्रकाशित नहीं",
           "conflicting": "स्रोत अलग-अलग", "unverified": "सिर्फ़ एक अनौपचारिक स्रोत", "recently reported": "ख़बर या यात्रा रिपोर्ट से, संरक्षक से नहीं",
           "potentially outdated": "स्रोत पुराना हो सकता है", "estimated": "हमारा अनुमान", "closing day conflicts between sources": "साप्ताहिक बंदी: स्रोत अलग-अलग"},
}


def to_confirm(reasons: list[str], lang: str) -> list[str]:
    """Rule reasons ("hours is unverified") in plain words ("opening hours: only one unofficial source")."""
    w = CONFIRM_WORDS["hi" if lang == "hi" else "en"]
    out = []
    for r in reasons:
        if r in w:
            out.append(w[r])
            continue
        m = re.match(r"(hours|weeklyClosed|lastEntry) (?:is )?(.+)", r)
        if m:
            out.append(f"{w[m[1]]}: {w.get(m[2], m[2])}")
    return out


def how_to_confirm(p: dict, lang: str) -> str:
    c = p.get("contact") or {}
    phone = re.search(r"\+?\d[\d -]{7,}\d", ((c.get("t") or {}).get("en") or "")) if c.get("v") is not None else None
    if phone:
        return f"call the place: {phone[0]}" if lang == "en" else f"जगह पर फ़ोन करें: {phone[0]}"
    return "ask at the ticket counter or gate on arrival (we have no phone number for it)" if lang == "en" else "पहुँचकर टिकट काउंटर या गेट पर पूछें (हमारे पास फ़ोन नंबर नहीं है)"


def travel_pack(d: dict, coord: list[float], origin: dict | None, lang: str) -> dict | None:
    """Time and fare from the raahi's start, the same estimate the app's cards and roadmap use."""
    try:
        o = [float(origin["lat"]), float(origin["lng"])]
    except Exception:
        return None
    road = round(km(o, coord) * ROAD_FACTOR, 1)
    out = {"from": str(origin.get("name") or "your start")[:60], "roadKm": road,
           "byAuto": f"{max(2, round(road / SPEED_KMH['auto'] * 60))} min", "byCab": f"{max(2, round(road / SPEED_KMH['cab'] * 60))} min",
           "howSure": "an estimate (straight-line distance × 1.5 at set speeds)" if lang == "en" else "अनुमान (सीधी दूरी × 1.5, तय रफ़्तार पर)"}
    if road <= 3:
        out["onFoot"] = f"{max(2, round(road / SPEED_KMH['walk'] * 60))} min"
    band = next((f for f in d.get("fares", []) if f["mode"] == "auto" and road <= f["maxKm"]), None)
    out["autoFare"] = f"₹{band['min']}–{band['max']} per auto ({LABEL_WORDS[lang].get(band.get('s'), band.get('s'))}, {d['sources'].get(band.get('src'), {}).get('name', band.get('src'))})" if band \
        else ("not known: no fare source for this city or distance yet" if lang == "en" else "पता नहीं: इस शहर या दूरी का किराया स्रोत अभी नहीं")
    return out


def live_alert(p: dict, tw: dict, lang: str) -> str | None:
    """A moderator's alert on this place, naming the part when only one part of a big place is affected."""
    for key, en, hi_ in (("closed", "closed today (moderator alert)", "आज बंद (मॉडरेटर सूचना)"),
                         ("crowded", "very crowded right now (moderator alert)", "अभी बहुत भीड़ (मॉडरेटर सूचना)")):
        hit = [u for u in p["units"] if u["id"] in (tw.get(key) or [])]
        if hit:
            word = en if lang == "en" else hi_
            return word if len(hit) == len(p["units"]) else f"{', '.join(u['name'][lang] for u in hit)}: {word}"
    return None


def guard_ok(p: dict) -> bool:
    """Decision 25 (as submitted in Round 1): alternates only from Level 2, or Level 1 with a current custodian publication."""
    g = p.get("guardrail") or {}
    if g.get("status") == "level2":
        return True
    pub = g.get("publication") or {}
    return g.get("status") == "level1" and pub.get("v", True) is not None and bool(pub.get("s")) and pub.get("s") not in ("potentially outdated", "conflicting")


def alternatives(d: dict, p: dict, day: str, tw: dict, lang: str, k: int = 3) -> list[dict]:
    """Where to go instead: open places like this one, nearest first, with no alert, and only places the guardrail
    lets the app suggest (Level 1 or 2)."""
    tags = set(p.get("tags") or [])
    here = p["units"][0]["coord"]
    out = []
    for q in d["places"]:
        u = q["units"][0]
        if q["id"] == p["id"] or not guard_ok(q) or live_alert(q, tw, lang) or not (u.get("hours") or {}).get("v"):
            continue
        if rules.check_feasibility(d, u, day)["verdict"] == "not feasible":
            continue
        out.append((-len(tags & set(q.get("tags") or [])), km(here, u["coord"]), q))
    out.sort(key=lambda x: (x[0], x[1]))
    return [{"id": q["id"], "name": q["name"][lang], "hours": fact(q["units"][0]["hours"], lang, d).get("value"), "kmAway": round(dist * ROAD_FACTOR, 1)} for _, dist, q in out[:k]]


def place_pack(d: dict, p: dict, lang: str, day: str, origin: dict | None = None, tw: dict | None = None) -> dict:
    tw = tw or {}
    alert = live_alert(p, tw, lang)
    sections = []
    for u in p["units"]:
        chk = rules.check_feasibility(d, u, day)
        v = chk["verdict"]
        sec = {"name": u["name"][lang], "todaysVerdict": VERDICT_WORDS["hi" if lang == "hi" else "en"].get(v, v),
               "hours": fact(u["hours"], lang, d), "weeklyClosing": fact(u["weeklyClosed"], lang, d), "fees": fees_pack(u, lang, d)}
        if u["id"] in (tw.get("closed") or []):
            sec["todaysVerdict"] = "not possible today: closed by a moderator alert" if lang == "en" else "आज संभव नहीं: मॉडरेटर ने बंद बताया"
        elif v == "needs confirmation":
            sec["toConfirm"] = to_confirm(chk["reasons"], lang)
            sec["howToConfirm"] = how_to_confirm(p, lang)
        elif v == "possible with precautions":
            sec["careful"] = chk["reasons"]
        sections.append(sec)
    out = {
        "id": p["id"], "name": p["name"][lang], "type": p["type"][lang],
        **({"liveAlert": alert, "tryInstead": alternatives(d, p, day, tw, lang)} if alert else {}),
        **({"fromYou": t} if (t := travel_pack(d, p["units"][0]["coord"], origin, lang)) else {}),
        "sections": sections,
        "summary": fact(p["summary"], lang, d),
        "rules": [fact(r, lang, d) for r in p["rules"]],
        "access": fact(p.get("accessibility"), lang, d),
        "facilities": fact(p.get("facilities"), lang, d),
        "contact": fact(p.get("contact"), lang, d),
        "notes": [fact(n, lang, d) for n in p.get("notes", [])],
        "thingsToDo": [{"name": a["name"][lang], **fact(a, lang, d)} for a in p.get("activities", []) or []],
        # FAQ answers repeat the facts above; only the questions go in, to keep the prompt small for the free tier.
        "questionsPeopleAsk": [f["q"][lang] for f in (p.get("faqs") or [])[:6]],
    }
    return out


ASSISTANT = {"en": "Yatra", "hi": "यात्रा"}
FOLLOW_Q = re.compile(r"\b(this|that|it|there|here|these|those|listed|where is|how far|how long|get there|reach)\b|यह|वह|वहाँ|कहाँ", re.I)
TIP_TOPIC = {"transport": r"auto|rickshaw|rikshaw|cab|taxi|rapido|ola|uber|fare|ride|travel|get around|getting around|transport|cheap|budget|cost|ऑटो|रिक्शा|किराया|सवारी|कैब",
             "station": r"station|railway|train|arriv|reach|स्टेशन|रेलवे|ट्रेन"}
RECO_Q = re.compile(r"where (should|can|do) (i|we) go|what should (i|we) (see|visit|do)|where to go|suggest|recommend|what to (see|visit)|best place|must see|kaha(n)? ja(u|un|yen)|कहाँ जाएँ|कहाँ जाऊँ|क्या देखें|सुझाव", re.I)
HOW_KNOW_Q = re.compile(r"source|verif|how do you know|where .*(info|data|information)|trust|accurate|reliable|kaha se|kahan se|स्रोत|सत्यापि|कहाँ से|भरोसा", re.I)
NEAR_Q = re.compile(r"\bnear|nearby|close to|around\b|पास", re.I)
HOW_WE_KNOW = {
    "en": ["Every fact has a label, a date and a source: officially confirmed (the custodian's own page, ASI rules, district site, MP Tourism), checked on site (a saarthi's photo), recently reported, not verified, sources disagree, may be outdated.",
           "Good to go means the opening hours and closing day are officially confirmed or checked on site and it is open today.",
           "Confirm first means at least one deciding fact is not certain; the app names which one and how to check it.",
           "Saarthis add or correct facts with photo proof; a moderator or another saarthi approves each entry before it changes the place.",
           "Travel times and fares are estimates from distance and published fare bands, never live prices."],
    "hi": ["हर तथ्य के साथ लेबल, तारीख और स्रोत है: आधिकारिक रूप से पुष्ट (संरक्षक का पेज, ASI नियम, ज़िला साइट, MP टूरिज़्म), मौके पर जाँचा (सारथी की फ़ोटो), हाल में बताया गया, असत्यापित, स्रोत अलग-अलग, पुराना हो सकता है।",
           "'आज जा सकते हैं' का मतलब है खुलने का समय और बंदी का दिन आधिकारिक रूप से पुष्ट या मौके पर जाँचे गए हैं और आज खुला है।",
           "'पहले पुष्टि करें' का मतलब है कोई ज़रूरी तथ्य पक्का नहीं; ऐप बताता है कौन सा और कैसे जाँचें।",
           "सारथी फ़ोटो सबूत के साथ तथ्य जोड़ते हैं; हर एंट्री मॉडरेटर या दूसरा सारथी मंज़ूर करता है।",
           "सफ़र का समय और किराया दूरी और प्रकाशित किराये से अनुमान है, लाइव कीमत नहीं।"],
}


def follow_ups(pack: dict, body: ChatIn, lang: str) -> list[str]:
    """Three next questions that move the raahi's day forward, from what this answer covered."""
    hi = lang == "hi"
    out = []
    if pack["places"]:
        p = pack["places"][0]
        n = p["name"]
        if p.get("tryInstead"):
            out.append(f"{p['tryInstead'][0]['name']} के बारे में बताओ" if hi else f"Tell me about {p['tryInstead'][0]['name']}")
        if "fromYou" not in p:
            out.append(f"{n} कैसे पहुँचें?" if hi else f"How do I get to {n}?")
        out.append(f"{n} के पास और क्या है?" if hi else f"What else is near {n}?")
        if not any("prices" in s.get("fees", {}) for s in p["sections"]):
            out.append(f"{n} पर क्या करें?" if hi else f"What can I do at {n}?")
        else:
            out.append(f"{n} की टिकट कितनी है?" if hi else f"Ticket price at {n}")
    if not body.roadmap:
        out.append("मेरा दिन प्लान करो" if hi else "Plan my day")
    out.append("आज क्या खुला है?" if hi else "What is open today?")
    return list(dict.fromkeys(out))[:3]
GUIDE = json.loads((Path(__file__).parent / "app_guide.json").read_text(encoding="utf-8"))
APP_Q = re.compile(r"\b(how|app|feature|use|what can|can you|help me with|where do i|kaise|kya kar)\b|कैसे|ऐप|फ़ीचर|क्या कर|इस्तेमाल", re.I)
# A tip is skipped when one of the last replies already pointed at a feature: helpful, never nagging.
TIP_SEEN = re.compile(r"stamp|passport|roadmap|plan my day|story cards|map tab|bazaar|saarthi|स्टैम्प|पासपोर्ट|रोडमैप|नक्शा टैब|बाज़ार|सारथी", re.I)


def guide_for(text: str, lang: str, k: int = 2) -> list[str]:
    """App-guide entries that match the question, best first."""
    q = set(rag.words(text))
    scored = []
    for f in GUIDE["features"]:
        w = set(rag.words(f["words"]))
        score = len(q & w) + 0.5 * sum(1 for a in q for b in w if a != b and min(len(a), len(b)) >= 4 and (a.startswith(b) or b.startswith(a)))
        if score:
            scored.append((score, f[lang]))
    scored.sort(key=lambda x: -x[0])
    return [t for _, t in scored[:k]]


def tip_for(pack: dict, body: ChatIn, lang: str) -> str | None:
    """One feature worth mentioning with this answer, or None."""
    if any(TIP_SEEN.search(t.text) for t in body.history[-6:] if t.role != "user"):
        return None
    by_id = {f["id"]: f[lang] for f in GUIDE["features"]}
    if pack["places"]:
        return by_id["stamps"] if not body.roadmap else by_id["story"]
    return None if body.roadmap else by_id["plan"]


def retrieve(body: ChatIn) -> tuple[dict, set[str]]:
    """Picks up to 3 places: names in the question first, then the best search hits (RAG)."""
    city = body.city if body.city in cities.available() else "gwalior"
    d = data(city)
    day = today()
    lang = "hi" if body.lang == "hi" else "en"
    tw = twists()
    ids = [h["id"] for h in rules.search_places(d, body.text)]
    named = list(ids)  # places the raahi named, before any search widens the list
    # "Where should I go?": the places the planner itself may use today (Level 1 or 2, open, no alert), Level 2 first.
    # Never a search hit: that could name an unflagged place (Decision 28).
    reco = not ids and bool(RECO_Q.search(body.text))
    if reco:
        ok = [p for p in d["places"] if guard_ok(p) and not live_alert(p, tw, lang)
              and rules.check_feasibility(d, p["units"][0], day)["verdict"] != "not feasible"]
        ids = [p["id"] for p in sorted(ok, key=lambda p: (p["guardrail"]["status"] != "level2"))][:3]
    # "Where is this listed?", "how do I get there?": a follow-up with no place name is about the last reply's places.
    # Only when there was a last reply with places: in a new chat a short question is a new question.
    follow = not ids and bool(body.lastPlaces) and bool(FOLLOW_Q.search(body.text) or len(body.text.split()) <= 6)
    if follow:
        ids = [pid for pid in body.lastPlaces if rules.get_place(d, pid)][:3]
    # A question about using the app only brings in places it names.
    how_to = bool(APP_Q.search(body.text)) and guide_for(body.text, lang)
    for pid in ([] if (how_to and not ids) or follow or reco else rag.places_for(city, body.text, lang)):
        if pid not in ids:
            ids.append(pid)
    pack = {"today": f"{day} ({datetime.fromisoformat(day).strftime('%A')})", "city": d["city"]["name"][lang],
            "places": [place_pack(d, rules.get_place(d, pid), lang, day, body.origin, tw) for pid in ids[:3] if rules.get_place(d, pid)]}
    if reco:
        pack["suggestedBecause"] = ("These are the places Plan my day can use today: their custodians publish them open and ticketed. "
                                    "A place whose custodian asked for more visitors comes first. Others can be added by name.") if lang == "en" else             ("ये वे जगहें हैं जिन्हें 'मेरा दिन प्लान करो' आज इस्तेमाल कर सकता है: इनके संरक्षक इन्हें खुला और टिकट वाला बताते हैं। "
             "जिस जगह के संरक्षक ने ज़्यादा आगंतुक चाहे, वह पहले है। बाकी जगहें नाम से जोड़ी जा सकती हैं।")
    if body.origin:
        pack["raahiStartsFrom"] = str(body.origin.get("name") or "")[:60]
    alerts = [{"place": p["name"][lang], "alert": a} for p in d["places"] if (a := live_alert(p, tw, lang))]
    if alerts:
        pack["moderatorAlertsToday"] = alerts
    if HOW_KNOW_Q.search(body.text):
        pack["howWeKnow"] = HOW_WE_KNOW[lang]
    if ids and NEAR_Q.search(body.text):
        # Decision 28: Yatra never names an unflagged place the raahi did not name, so "nearby" holds Level 2 places only.
        base = rules.get_place(d, ids[0])
        flagged = [q for q in d["places"] if q["id"] != base["id"] and (q.get("guardrail") or {}).get("status") == "level2"]
        pack["nearby"] = [{"name": q["name"][lang], "kmAway": round(km(base["units"][0]["coord"], q["units"][0]["coord"]) * ROAD_FACTOR, 1),
                           "hours": fact(q["units"][0]["hours"], lang, d).get("value")}
                          for q in sorted(flagged, key=lambda q: km(base["units"][0]["coord"], q["units"][0]["coord"]))[:3]]
        pack["nearbyNote"] = "Only places whose custodians asked for more visitors are suggested nearby." if lang == "en" else "पास में सिर्फ़ वे जगहें सुझाई जाती हैं जिनके संरक्षकों ने ज़्यादा आगंतुक चाहे हैं।"
    if body.roadmap:
        pack["todaysRoadmap"] = body.roadmap
    if body.earlier:
        pack["earlierInThisChat"] = body.earlier
    # Today's weather tips, only from the cached reading (the chat never waits on the weather service).
    if pack["places"] and get_db().weather.find_one({"_id": city}):
        w = weather_alert(city)
        if w:
            pack["weatherToday"] = w[lang]
    # "When does Gujari Mahal open?" is about that place: the open-today list only answers when no place is named.
    if not named and re.search(r"\bopen\b|open (today|now)|what.*open|खुल", body.text, re.I):
        pack["openToday"] = open_today(d, lang, day, tw)
        pack["places"] = []  # the compact list answers it; full records would overflow the free tier's per-minute limit
        ids += [p["id"] for p in d["places"] if p["name"][lang] in {o["name"] for o in pack["openToday"]} and p["id"] not in ids]
    # Getting-around tips and city notes from team field visits (fares, shared autos, the station works).
    tips = [t for t in d.get("tips", []) if re.search(TIP_TOPIC[t["topic"]], body.text, re.I)]
    if tips:
        pack["localTips"] = [{"tip": t["t"][lang], "howSure": LABEL_WORDS[lang].get(t["s"], t["s"]), "checked": t["ver"]} for t in tips[:5]]
    nums = directory_for(d, body.text, lang)
    if nums:
        pack["cityNumbers"] = nums
    # How to use the app: for questions about the app, or when no place matched.
    if APP_Q.search(body.text) or (not pack["places"] and "openToday" not in pack):
        guide = guide_for(body.text, lang)
        pack["appGuide"] = guide or [GUIDE["about"][lang]]
    tip = tip_for(pack, body, lang)
    if tip and "appGuide" not in pack:
        pack["maybeMention"] = tip
    allowed = set(ids[:3]) | {p["id"] for p in d["places"] if p["name"][lang] in {o["name"] for o in pack.get("openToday", [])}}
    for t in body.history:
        if t.role == "user":
            allowed |= {h["id"] for h in rules.search_places(d, t.text)}
    allowed |= {p["id"] for p in d["places"] if p["guardrail"]["status"] == "level2"}
    names = {x["name"] for pp in pack["places"] for x in pp.get("tryInstead", [])} | {x["name"] for x in pack.get("nearby", [])} | {x["place"] for x in alerts}
    allowed |= {p["id"] for p in d["places"] if p["name"][lang] in names}
    return pack, allowed


def open_today(d: dict, lang: str, day: str, tw: dict | None = None) -> list[dict]:
    """Every place with hours on record that is open today, by today's verdict. Being open is a fact,
    so this does not depend on whether the planner may suggest the place."""
    out = []
    for p in d["places"]:
        u = p["units"][0]
        if not (u.get("hours") or {}).get("v"):
            continue
        v = rules.check_feasibility(d, u, day)["verdict"]
        a = live_alert(p, tw or {}, lang)
        if v == "not feasible" or (a and "closed" in a or a and "बंद" in a):
            continue
        h = fact(u["hours"], lang, d)
        out.append({"name": p["name"][lang], "hours": {k: h[k] for k in ("value", "howSure", "advisory") if k in h}, "todaysVerdict": VERDICT_WORDS["hi" if lang == "hi" else "en"].get(v, v), **({"liveAlert": a} if a else {})})
    return out


DIR_WORDS = {
    "emergency": r"emergenc|help ?line|112|100|108|ambulance|fire|women|child|आपात|हेल्पलाइन|एम्बुलेंस|मदद",
    "hospital": r"hospital|doctor|medical|clinic|injur|sick|अस्पताल|डॉक्टर|इलाज|बीमार",
    "police": r"police|thana|theft|stolen|lost|पुलिस|थाना|चोरी|खो",
    "transport": r"airport|flight|railway|train|station|bus stand|हवाई|ट्रेन|रेलवे|स्टेशन|बस",
    "hotel": r"hotel|stay|room|होटल|ठहर|कमरा",
}


def directory_for(d: dict, text: str, lang: str, k: int = 6) -> list[dict]:
    """City numbers for a question about emergencies, hospitals, police, transport or hotels."""
    cats = [c for c, rx in DIR_WORDS.items() if re.search(rx, text, re.I)]
    if not cats:
        return []
    q = set(rag.words(text))
    out = []
    for c in cats:
        rows = [e for e in d.get("directory", []) if e["cat"] == c]
        rows.sort(key=lambda e: (-len(q & set(rag.words(e["name"]["en"] + " " + e.get("address", "")))), e["s"] != "officially confirmed"))
        for e in rows[:k]:
            out.append({"name": e["name"][lang], "phones": e["phones"], "address": e.get("address"), "howSure": LABEL_WORDS[lang].get(e["s"], e["s"]),
                        "source": d["sources"].get(e["src"], {}).get("name", e["src"])})
    return out


def overclaims(answer: str, pack: dict) -> bool:
    """True when the reply says "officially confirmed" but no fact it could mean is officially confirmed."""
    if "officially confirmed" not in answer.lower() and "आधिकारिक रूप से पुष्ट" not in answer:
        return False
    if "howWeKnow" in pack and not pack["places"]:
        return False  # explaining what the labels mean, not claiming a fact
    strong = {LABEL_WORDS["en"]["officially confirmed"], LABEL_WORDS["hi"]["officially confirmed"]}
    for p in pack["places"]:
        named = named_in(p["name"], answer)
        facts = [s.get(k, {}) for s in p["sections"] for k in ("hours", "weeklyClosing", "fees")]
        if named and any(f.get("howSure") in strong for f in facts):
            return False
    for o in pack.get("openToday", []):
        if named_in(o["name"], answer) and (o.get("hours") or {}).get("howSure") in strong:
            return False
    return True


def named_in(name: str, answer: str) -> bool:
    """A place counts as named when its name, or its first distinctive word, is in the reply ("Central Museum" for "Central Museum, Indore")."""
    low = answer.lower()
    if name.lower() in low:
        return True
    words = [w for w in re.findall(r"[a-zऀ-ॿ]{4,}", name.lower()) if w not in {"temple", "garden", "palace", "mandir", "indore", "gwalior"}]
    return bool(words) and words[0] in low


# Words a reply may put after a real name without renaming it ("Gwalior Fort complex", "Sarafa Bazaar Road").
NAME_TAIL = {"mall", "road", "gate", "temple", "museum", "palace", "garden", "park", "lake", "dam", "fort", "market", "bazaar", "complex", "area", "hill", "sanctuary", "zoo"}
NAME_GLUE = {"of", "the", "ka", "ki", "ke", "and", "&"}
# First words that are not distinctive enough to say "this is that place" (cities, ordinary words).
NAME_GENERIC = {"gwalior", "indore", "central", "city", "light", "regional", "tomb", "gandhi", "chhatris", "samadhi",
                "bagh", "italian", "bada", "gurudwara", "moti", "maharaj", "assi", "bahu", "vilas", "suraj", "teli"}


def renamed(answer: str, pack: dict | None = None) -> list[str]:
    """Place names the reply changed: a run of capitalised words that contains a known place's distinctive word
    but also words no place name has ("Phoenix Pride of India Mall" for Phoenix Citadel Mall)."""
    names = [p["name"]["en"] for c in cities.available() for p in data(c)["places"]]
    vocab = {w for n in names for w in re.findall(r"[a-z0-9']+", n.lower())} | NAME_TAIL | NAME_GLUE
    # Anything the FACTS pack itself says is fair: custodians, trusts, directory names.
    vocab |= set(re.findall(r"[a-z0-9']+", json.dumps(pack or {}, ensure_ascii=False).lower()))
    keys = {w for n in names for w in re.findall(r"[a-z]{4,}", n.lower())[:1] if w not in NAME_TAIL | NAME_GENERIC}
    out = []
    # A run: capitalised words, joined by spaces and the small glue words, inside one clause.
    for m in re.finditer(r"[A-Z][\w'’-]*(?:\s+(?:(?:of|the|ka|ki|ke|and|&)\s+)?[A-Z0-9][\w'’-]*)*", answer):
        words = [w.strip(".'’").lower() for w in m.group(0).split()]
        hit = next((i for i, w in enumerate(words) if w in keys), None)
        if hit is None:
            continue
        # Words before the place word may be the start of the sentence ("Today Phoenix ..."): only the place word
        # and what follows it must be name words.
        bad = [w for w in words[hit:] if w not in vocab]
        if bad:
            out.append(" ".join(m.group(0).split()[hit:]).rstrip(".'’"))
    return out


def mention_extra(answer: str, allowed: set[str], city: str = "gwalior") -> list[str]:
    low = answer.lower()
    out = []
    for c in cities.available():
        out += [p["id"] for p in data(c)["places"] if p["id"] not in allowed and (p["name"]["en"].lower() in low or p["name"]["hi"] in answer)]
    return out


def shown_ids(answer: str, pack: dict, body: ChatIn, k: int = 3) -> list[str]:
    """The cards under a reply: the places it actually talks about, at most three. A list answer
    (open today, nearby) shows cards only for the places it names, never every match."""
    lang = "hi" if body.lang == "hi" else "en"
    ids = [p["id"] for p in pack["places"] if named_in(p["name"], answer)]
    d = data(body.city if body.city in cities.available() else "gwalior")
    low = answer.lower()
    ids += [p["id"] for p in d["places"] if p["id"] not in ids and (p["name"][lang].lower() in low)]
    if not ids and pack["places"]:
        ids = [pack["places"][0]["id"]]
    return ids[:k]


MEMORY_Q = re.compile(r"remember|memory|earlier chat|last time|याद|पिछली (चैट|बार)", re.I)


def system_prompt(body: ChatIn, city: str) -> str:
    return "\n".join([
        f"You are {ASSISTANT['hi' if body.lang == 'hi' else 'en']}, the assistant inside the Dishaara app: a warm, simple travel helper for {city}, India. Today is {today()}.",
        "You get a FACTS pack from our checked records. Rules:",
        "0. If FACTS has appGuide, use it to explain how to use the app, step by step and briefly. Never invent buttons or features that are not in appGuide.",
        "0b. If FACTS has maybeMention, you may add it as one short last sentence, only when it truly helps with what they asked. Otherwise leave it out. Never in an emergency.",
        "1. Use only the FACTS pack. Never use your own memory for hours, fees, dates, history, distances, phone numbers or rules.",
        "2. If a fact is unavailable, say plainly that we do not know it yet. Never guess.",
        "3. todaysVerdict is decided by rules. Say it in your own words but keep its meaning exactly. Never soften it. Never write the field names (todaysVerdict, howSure, FACTS) in your reply.",
        "4. If a value is \"not confirmed\", say so and pass on the advisory. Never give a price or time for it.",
        "5. Say how sure a key fact is with its howSure words and date, for example: officially confirmed on 13 Oct. Each fact has its own howSure: never give one fact's howSure to another (hours, fees and summary are separate). If unsure which applies, leave the howSure out. The date is that fact's own checked date from FACTS, never today's date: if a fact has no date, give no date.",
        "6b. If something is unavailable, name what we do not know, in one short sentence.",
        "6. Only talk about places in the pack. Under your reply the app shows a card for up to three places your reply names. Never promise a card or a map: say \"tap a card below\" only when you name a place.",
        "6e. If a place has liveAlert, the first bullet is **Right now:** the alert. For crowded: long queues at the ticket counter and gate, the visit takes longer than usual, keep phone and wallet close; go later or see a nearby place first. Then suggest one or two of its tryInstead places with their hours. If FACTS has moderatorAlertsToday and the raahi asks what to do or where to go, avoid those places.",
        "6f. If a section has toConfirm, say exactly what is not certain and howToConfirm. Never say only 'confirm first'. If a section has no toConfirm and its verdict is that they can go, do not ask them to confirm anything.",
        "6k. Write Getting there only from fromYou. If a place has no fromYou, leave Getting there out: never give a travel time, distance or fare for it.",
        "6g. If a place has fromYou, give the time from the raahi's start (by auto, and on foot when given) and the autoFare, and call it an estimate.",
        "6h. If FACTS has howWeKnow, explain in plain words how the app knows and checks facts, using it.",
        "6n. If FACTS has localTips, give the ones that answer the question as bullets, each with its howSure and date, and say they come from the team's own visit.",
        "6l. If FACTS has suggestedBecause, reply with a bold first line, then one bullet per place \"- **Name**: hours, today's verdict\", then one line with suggestedBecause in your own words, then offer Plan my day to fit them into their time. Never say there are no places.",
        "6m. If FACTS has no places, no openToday and no cityNumbers, do not use the labelled bullets: answer in one or two plain lines and ask what they want to see.",
        "6j. If FACTS has weatherToday and it has a tip (heat, rain, strong sun), you may give that tip as Good to know.",
        "6i. If FACTS has nearby, name two or three of them with distance.",
        "6a. If FACTS has openToday, the reply is only: a bold first line; then up to 5 bullets \"- **Name**: hours\", adding \"(very crowded now)\" or the alert when that place has liveAlert, and listing places without an alert first; one line saying how many more are open and that the Map tab shows them all; the italic question. No other labels, no nested lists, never list a place twice. Places without hours on record are not listed. Do not say how sure each one is.",
        "6c. If FACTS has cityNumbers, give the one or two numbers that answer the question, with the name and how sure they are. Never make up a number.",
        "6d. If FACTS has thingsToDo or questionsPeopleAsk for a place, use them for what visitors can do there and for common questions.",
        "7. Format every reply in Markdown as a short card the raahi can scan, in this order:",
        "   - Line 1: the direct answer in **bold**, one sentence.",
        "   - Then bullet lines (\"- \"), each starting with a bold label, only the ones that apply: " + ("**आज:** फ़ैसला; **समय:** घंटे (कितना पक्का, तारीख); **टिकट:** कीमत; **कैसे पहुँचें:** समय और किराया (अनुमान); **पहले जाँचें:** क्या पक्का नहीं और कैसे जाँचें; **जानने लायक:** जाने से पहले एक काम की बात" if body.lang == "hi" else "**Today:** the verdict; **Hours:** the hours (how sure, date); **Ticket:** the price; **Getting there:** time and fare from their start (estimate); **Check first:** what is not certain and how to check it; **Good to know:** one practical thing to know before going") + ".",
        "   - Good to know comes from the place's rules, notes, facilities, access or a closed part: dress or shoe rules, photography, cash only, steep climb, a section that is shut. Pick what saves the raahi trouble on the day. Leave it out if FACTS has nothing.",
        "   - Several places (open today, nearby, try instead): one bullet per place, \"- **Name**: hours\", at most 5.",
        "   - Last line: one short question in *italics* that helps plan their day.",
        "   At most 6 bullets and 110 words. No headings, tables or emojis. Never write field names.",
        # Only when they ask about memory: Gemma on Adaption answered Hindi ticket questions with this line (29 Oct).
        *(["9. You see the last few messages of this chat. earlierInThisChat is a short summary of this chat's older messages, and earlierChats lists the raahi's earlier chats (signed-in raahis only). You have only these summaries, not the full old messages: say exactly that. Without them, say you remember only this chat. Never claim to remember more."]
          if MEMORY_Q.search(body.text) else ["9. Use earlierInThisChat and earlierChats, when present, only as context. Always answer the question the raahi just asked."]),
        "10. If the raahi asks about their plan, roadmap, timings, schedule, costs or budget and FACTS has todaysRoadmap, answer with a Markdown table instead of bullets: columns Time | Place | Ride there | Ticket each, one row per stop, a last row for the ride back, then one bold line with the totals (tickets, rides, total, for how many people). Copy every time and price exactly from todaysRoadmap. If FACTS has no todaysRoadmap, say they can make one with Plan my day.",
        f"8. Reply in {'Hindi (Devanagari)' if body.lang == 'hi' else 'English'}.",
        f"About this raahi: {'; '.join(body.prompt[:10])}." if body.prompt else "No personal preferences set.",
    ])


def groq(messages: list[dict]) -> str:
    key = os.environ["GROQ_KEY"]
    r = httpx.post(GROQ_URL, headers={"Authorization": f"Bearer {key}"}, json={"model": GROQ_MODEL, "messages": messages, "temperature": 0.2, "reasoning_effort": "low", "max_completion_tokens": 900}, timeout=15)
    r.raise_for_status()
    return (r.json()["choices"][0]["message"].get("content") or "").strip()


ADAPTION_URL = "https://api.prod.adaptionlabs.ai/api/v1/responses"
# Picked 29 Oct by 07_round2/adaption/bench.py on held-out Yatra rows: gemma-4-26b-a4b-it kept every number grounded,
# gave the label and the bold first line most often, and answered in about 3 s. Change with ADAPTION_MODEL.
ADAPTION_MODEL = os.getenv("ADAPTION_MODEL", "gemma-4-26b-a4b-it")
ENGINE = {"last": None}  # which service wrote the last reply, shown to the raahi


def adaption(messages: list[dict]) -> str:
    """Adaption's hosted inference (Responses API). The system prompt goes in as instructions."""
    sys_msg = "\n\n".join(m["content"] for m in messages if m["role"] == "system")
    turns = [{"role": m["role"], "content": m["content"]} for m in messages if m["role"] != "system"]
    r = httpx.post(ADAPTION_URL, headers={"Authorization": f"Bearer {os.environ['ADAPTION_API_KEY']}"},
                   json={"model": ADAPTION_MODEL, "instructions": sys_msg, "input": turns, "max_output_tokens": 1200, "temperature": 0.2}, timeout=20)
    r.raise_for_status()
    text = "\n".join(c.get("text", "") for o in r.json().get("output", []) if o.get("type") == "message" for c in o.get("content") or [])
    if not text.strip():
        raise ValueError("empty Adaption reply")
    return text.strip()


def write(messages: list[dict]) -> str:
    """Adaption first, Groq if Adaption is down or out of credits. Both go through the same fact checks."""
    if os.getenv("ADAPTION_API_KEY"):
        try:
            out = adaption(messages)
            ENGINE["last"] = f"Adaption · {ADAPTION_MODEL}"
            return out
        except Exception as e:
            print(f"adaption error, using groq: {type(e).__name__}: {str(e)[:200]}", flush=True)
    out = groq(messages)
    ENGINE["last"] = "Groq · gpt-oss-120b"
    return out


WRITER = write  # tests replace this


@app.post("/chat")
def chat(body: ChatIn, request: Request, me: dict | None = Depends(current)):
    """Returns {ai: false} when there is no key or the reply fails the checks; the app then shows its rule answer."""
    if re.search(r"emergency|ambulance|police|hospital|injur|accident|आपात|एम्बुलेंस|पुलिस|अस्पताल", body.text, re.I):
        return {"ai": False, "emergency": True, "text": None}
    if not os.getenv("GROQ_KEY") and not os.getenv("ADAPTION_API_KEY") and WRITER is write:
        return {"ai": False, "note": "no-key", "text": None}
    if me:
        limit(me, "chat", 60, 60)
    else:
        limit(by_ip(request), "chat", 20, 60)
    pack, allowed = retrieve(body)
    if me:
        past = [f"{r['updated']:%d %b}: {r.get('summary') or r['title']}" for r in get_db().chats.find({"user": me["_id"], "_id": {"$ne": body.chatId}}, {"msgs": 0}).sort("updated", -1).limit(CHAT_CONTEXT)]
        if past:
            pack["earlierChats"] = past
    messages = [{"role": "system", "content": system_prompt(body, pack["city"])}]
    messages += [{"role": "user" if t.role == "user" else "assistant", "content": t.text[:1000]} for t in body.history[-6:]]
    messages.append({"role": "user", "content": f"FACTS: {json.dumps(pack, ensure_ascii=False)}\n\nRaahi asks: {body.text}"})
    sources = [pack, [t.text for t in body.history if t.role == "user"], body.text, today()]
    try:
        for attempt in range(2):
            answer = WRITER(messages)
            ok, missing = grounding.check(answer, sources)
            extra = mention_extra(answer, allowed)
            # Field names leaking into the reply. "FACTS" only in capitals: "facts" is an ordinary word.
            over = overclaims(answer, pack) or bool(re.search(r"todaysverdict|howsure|appguide|maybemention", answer, re.I) or re.search(r"\bFACTS\b", answer))
            wrong = renamed(answer or "", pack)
            # A travel time or fare with no fromYou in the pack is invented, even when the numbers happen to appear elsewhere.
            travel = not any("fromYou" in p for p in pack["places"]) and "todaysRoadmap" not in pack                 and bool(re.search(r"getting there|by auto|by cab|on foot|कैसे पहुँचें|ऑटो से", answer or "", re.I))
            if answer and ok and not extra and not over and not wrong and not travel:
                return {"ai": True, "text": answer, "engine": ENGINE["last"], "placeIds": shown_ids(answer, pack, body), "followUps": follow_ups(pack, body, "hi" if body.lang == "hi" else "en")}
            print(f"chat check failed: missing={missing} extra={extra} over={over} renamed={wrong} travel={travel}", flush=True)
            fix = ([f"values not in FACTS: {', '.join(missing)}"] if missing else []) + ([f"places not in FACTS: {', '.join(extra)}"] if extra else []) \
                + (["\"officially confirmed\" for a fact whose howSure is different"] if over else []) \
                + (["a travel time or fare, but FACTS has no fromYou: leave Getting there out"] if travel else [])                 + ([f"place names that are not in FACTS ({', '.join(wrong)}): write every place name exactly as FACTS spells it"] if wrong else [])
            messages += [{"role": "assistant", "content": answer}, {"role": "user", "content": f"Your reply used {' and '.join(fix) or 'nothing'}. Rewrite it using only FACTS."}]
        return {"ai": False, "note": "grounding", "text": None, "placeIds": [p["id"] for p in pack["places"]][:1]}
    except Exception as e:
        print(f"chat error: {type(e).__name__}: {str(e)[:300]}", flush=True)  # shows in the Vercel logs
        return {"ai": False, "note": "error", "text": None}


# ---------------- saved chats ----------------
# A signed-in raahi's chats are kept so they can reread one and carry on below it. Guests keep theirs on the phone only.
class ChatMsg(BaseModel):
    id: int
    role: str = Field(pattern="^(user|bot)$")
    text: str = Field(max_length=4000)
    at: int | None = None
    cards: list[dict] = []
    chips: list[str] = []
    ai: bool | None = None
    engine: str | None = Field(default=None, max_length=60)
    note: str | None = None


CHATS_PER_USER = 20  # saved chats per account
CHAT_KEEP = 120  # messages kept per saved chat
CHAT_SUMMARY_CHARS = 300  # summary per chat, fed to Yatra as context
CHAT_CONTEXT = 3  # earlier chats Yatra sees


class ChatSave(BaseModel):
    title: str = Field(max_length=80)
    city: str = Field(default="gwalior", max_length=20)
    msgs: list[ChatMsg] = Field(max_length=400)


@app.get("/chats")
def chats_list(me: dict | None = Depends(current)):
    me = need(me)
    rows = get_db().chats.find({"user": me["_id"]}, {"msgs": 0}).sort("updated", -1).limit(30)
    return [{"id": r["_id"], "title": r["title"], "city": r.get("city"), "count": r.get("count", 0), "updated": r["updated"].isoformat()} for r in rows]


@app.get("/chats/{cid}")
def chats_get(cid: str, me: dict | None = Depends(current)):
    me = need(me)
    r = get_db().chats.find_one({"_id": cid, "user": me["_id"]})
    if not r:
        raise HTTPException(404, "no such chat")
    return {"id": r["_id"], "title": r["title"], "city": r.get("city"), "msgs": r["msgs"]}


@app.put("/chats/{cid}")
def chats_put(cid: str, body: ChatSave, me: dict | None = Depends(current)):
    me = need(me)
    if not re.fullmatch(r"[a-z0-9-]{6,40}", cid):
        raise HTTPException(400, "bad chat id")
    db = get_db()
    old = db.chats.find_one({"_id": cid})
    if old and old["user"] != me["_id"]:
        raise HTTPException(403, "not your chat")
    asked = [m.text.strip()[:70] for m in body.msgs if m.role == "user"]
    summary = ("Asked: " + "; ".join(asked[-6:]))[:CHAT_SUMMARY_CHARS]
    db.chats.replace_one({"_id": cid}, {"_id": cid, "user": me["_id"], "title": body.title, "city": body.city, "summary": summary,
                                        "msgs": [m.model_dump() for m in body.msgs[-CHAT_KEEP:]], "count": len(body.msgs), "updated": now()}, upsert=True)
    # Storage limit: the newest chats stay, the oldest go. The raahi is told in the app.
    old = [r["_id"] for r in db.chats.find({"user": me["_id"]}, {"_id": 1}).sort("updated", -1).skip(CHATS_PER_USER)]
    if old:
        db.chats.delete_many({"_id": {"$in": old}})
    return {"ok": True, "kept": CHATS_PER_USER, "dropped": len(old)}


@app.delete("/chats/{cid}")
def chats_delete(cid: str, me: dict | None = Depends(current)):
    me = need(me)
    get_db().chats.delete_one({"_id": cid, "user": me["_id"]})
    return {"ok": True}


# ---------------- saarthi ----------------
@app.get("/saarthi/me")
def saarthi_me(me: dict | None = Depends(current)):
    me = need(me, "saarthi")
    boot()
    db = get_db()
    return {"id": me["_id"], "name": me.get("name"), "region": me.get("region", ""),
            "checks": db.verify.count_documents({"checkedBy": me["_id"]}),
            "approved": db.verify.count_documents({"byUser": me["_id"], "status": "approved"}),
            "toVerify": db.verify.count_documents({"status": "pending", "byUser": {"$ne": me["_id"]}}),
            "openTickets": db.tickets.count_documents({"status": "open"}),
            "followers": db.follows.count_documents({"target": me["_id"]})}


class FactIn(BaseModel):
    placeId: str  # a place id, or "city" for an entry about the whole city (with city set)
    city: str | None = None
    unitId: str | None = None  # the part of a place (Gwalior Fort has four); empty = the whole place
    field: str = Field(max_length=60)
    value: str = Field(min_length=1, max_length=500)
    label: str
    proof: list[str] = []


HIGH_RISK = {"Ticket prices", "Weekly closing", "Opening hours", "Last entry", "Safety note"}


@app.post("/facts")
def add_fact(body: FactIn, me: dict | None = Depends(current)):
    """Saarthi entries never go live directly. High-risk fields need a second saarthi or an official source."""
    me = need(me, "saarthi")
    if body.placeId == "city":
        if body.city not in cities.CITY_IDS or body.field not in cities.CITY_FIELDS:
            raise HTTPException(422, "a city entry needs a covered city and the field Getting around or City notice")
        city = body.city
    else:
        city, _ = place(body.placeId)
    if body.label not in rules.STRONG | {"recently reported", "estimated", "historical pattern", "unverified", "conflicting", "potentially outdated"}:
        raise HTTPException(422, "unknown label")
    limit(me, "fact", 50, 24 * 60)
    db = get_db()
    proofs = [x for x in body.proof[:5] if db.proofs.find_one({"_id": x, "by": me["_id"]}, {"_id": 1})]
    new = on_probation(me)
    e = {"_id": f"v{uuid.uuid4().hex[:6]}", "place": body.placeId, "unit": body.unitId, "city": city, "field": body.field, "value": body.value,
         "by": me.get("name", "Saarthi"), "byUser": me["_id"], "risk": "high" if body.field in HIGH_RISK else "low",
         "status": "review" if new else "pending", "date": today(), "label": body.label, "proof": proofs, "at": now()}
    db.verify.insert_one(e)
    if new:
        pl = place(body.placeId)[1] if body.placeId != "city" else {"name": {"en": f"Whole city ({city.title()})"}, "units": []}
        db.queue.insert_one({"_id": f"m-fact-{e['_id']}", "kind": "fact", "entry": e["_id"], "user": me["_id"],
                             "title": f"New saarthi entry: {pl['name']['en']}{' / ' + next((u['name']['en'] for u in pl['units'] if u['id'] == body.unitId), '') if body.unitId else ''}, {body.field}", "detail": f"{body.value} ({body.label}) by {e['by']}",
                             "proof": proofs, "status": "pending", "at": now()})
    return {**strip(e), "route": "moderator" if new else "saarthi"}


class ProofAdd(BaseModel):
    proof: list[str] = Field(min_length=1, max_length=5)


@app.post("/facts/{vid}/proof")
def add_proof_later(vid: str, body: ProofAdd, me: dict | None = Depends(current)):
    """A saarthi adds photos or clips to their own entry while it still waits for review (filed first, proof later)."""
    me = need(me, "saarthi")
    db = get_db()
    v = db.verify.find_one({"_id": vid})
    if not v or v.get("byUser") != me["_id"]:
        raise HTTPException(404, "no such entry of yours")
    if v.get("status") not in ("review", "pending"):
        raise HTTPException(409, "this entry was already reviewed")
    mine = [x for x in body.proof if db.proofs.find_one({"_id": x, "by": me["_id"]}, {"_id": 1})]
    proof = list(dict.fromkeys((v.get("proof") or []) + mine))[:8]
    db.verify.update_one({"_id": vid}, {"$set": {"proof": proof}})
    db.queue.update_one({"_id": f"m-fact-{vid}"}, {"$set": {"proof": proof}})
    return strip(db.verify.find_one({"_id": vid}))


@app.get("/facts/mine")
def my_facts(me: dict | None = Depends(current)):
    """The saarthi's own entries, newest first, with their review status and how many proofs each has."""
    me = need(me, "saarthi")
    return [{**strip(v), "proofCount": len(v.get("proof") or [])} for v in get_db().verify.find({"byUser": me["_id"]}).sort("at", -1).limit(60)]


PROBATION_DAYS = 7


def on_probation(me: dict) -> bool:
    """A saarthi's first week: their entries go to a moderator. After that, to another saarthi."""
    since = me.get("saarthiSince") or me.get("createdAt")
    if not since:
        return True
    if isinstance(since, str):
        since = datetime.fromisoformat(since.replace("Z", "+00:00"))
    if since.tzinfo is None:
        since = since.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - since < timedelta(days=PROBATION_DAYS)


PROOF_TYPES = {"image/jpeg", "image/png", "image/webp"}
# A short voice note or clip of the counter also counts. Vercel takes request bodies up to 4.5 MB.
CLIP_TYPES = {"audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4", "audio/aac", "audio/wav", "audio/x-m4a",
              "video/mp4", "video/webm", "video/quicktime"}
PHOTO_MAX, CLIP_MAX = 2_000_000, 4_000_000


@app.post("/proofs")
async def upload_proof(file: UploadFile = File(...), me: dict | None = Depends(current)):
    """A photo, voice note or short clip of a board, ticket or counter. Kept in the database, shown to whoever
    checks the entry."""
    me = need(me, "saarthi")
    limit(me, "proof", 40, 24 * 60)
    kind = (file.content_type or "").split(";")[0]
    if kind not in PROOF_TYPES | CLIP_TYPES:
        raise HTTPException(415, "send a photo (JPEG, PNG, WebP), a voice note or a short video")
    cap = PHOTO_MAX if kind in PROOF_TYPES else CLIP_MAX
    data = await file.read(cap + 1)
    if len(data) > cap:
        raise HTTPException(413, f"file is over {cap // 1_000_000} MB")
    pid = uuid.uuid4().hex[:12]
    get_db().proofs.insert_one({"_id": pid, "by": me["_id"], "type": kind, "data": Binary(data), "at": now()})
    return {"id": pid, "type": kind}


@app.get("/proofs/{pid}")
def get_proof(pid: str, me: dict | None = Depends(current)):
    me = need(me)
    if not ({"saarthi", "moderator"} & set(me["roles"])):
        raise HTTPException(403, "only saarthis and moderators see proofs")
    doc = get_db().proofs.find_one({"_id": pid})
    if not doc:
        raise HTTPException(404, "no such proof")
    return Response(content=bytes(doc["data"]), media_type=doc["type"], headers={"Cache-Control": "private, max-age=86400"})


TEMPLATE_FIELDS = [  # saarthi form field -> where it is in the record
    ("Opening hours", "unit", "hours"), ("Weekly closing", "unit", "weeklyClosed"), ("Ticket prices", "unit", "fees"),
    ("Last entry", "unit", "lastEntry"), ("Payment", "unit", "payment"), ("Accessibility", "place", "accessibility"),
    ("Facilities", "place", "facilities"), ("Dress rules", "dress", "dress"),
]
WEAK = {"unverified", "conflicting", "potentially outdated"}


@app.get("/saarthi/todo")
def saarthi_todo(city: str = "gwalior", me: dict | None = Depends(current)):
    """Every fact still missing or weak in a city, place by place: what a saarthi should collect next."""
    need(me, "saarthi")
    d = data(city)
    waiting = {(v["place"], v.get("unit"), v["field"]) for v in get_db().verify.find({"city": city, "status": {"$in": ["review", "pending"]}}, {"place": 1, "unit": 1, "field": 1})}
    out = []
    for p in d["places"]:
        items = []
        many = len(p["units"]) > 1
        for name, where, key in TEMPLATE_FIELDS:
            targets = [(u["id"] if many else None, u["name"]["en"] if many else None, u.get(key)) for u in p["units"]] if where == "unit" else \
                [(None, None, (p.get("sensitive") or {}).get("dress"))] if where == "dress" and p.get("sensitive") else \
                [] if where == "dress" else [(None, None, p.get(key))]
            for uid, uname, f in targets:
                f = f or {}
                missing = f.get("v") is None and not f.get("s") and not f.get("t")
                weak = f.get("s") in WEAK
                if missing or weak:
                    items.append({"field": name, "unit": uid, "unitName": uname, "state": "missing" if missing else f.get("s"),
                                  "now": (f.get("t") or {}).get("en") or (f.get("why") or {}).get("en"), "waiting": (p["id"], uid, name) in waiting})
        if items:
            out.append({"place": p["id"], "name": p["name"]["en"], "items": items})
    return sorted(out, key=lambda x: -len(x["items"]))


@app.get("/verify-queue")
def verify_queue(me: dict | None = Depends(current)):
    me = need(me, "saarthi")
    boot()
    return [strip(v) for v in get_db().verify.find({"status": "pending"}) if v.get("byUser") != me["_id"]]


class VerifyIn(BaseModel):
    ok: bool
    note: str = Field(default="", max_length=300)


@app.post("/verify/{vid}")
def verify(vid: str, body: VerifyIn, me: dict | None = Depends(current)):
    me = need(me, "saarthi")
    db = get_db()
    v = db.verify.find_one({"_id": vid})
    if not v:
        raise HTTPException(404, "no such entry")
    if v.get("byUser") == me["_id"]:
        raise HTTPException(403, "a saarthi cannot verify their own entry")
    status = "approved" if body.ok else "flagged"
    db.verify.update_one({"_id": vid}, {"$set": {"status": status, "checkedBy": me["_id"], "checkNote": body.note}})
    if body.ok:
        cities.apply_entry({**v, "status": status})  # a second saarthi agreed: the place record updates now
    if not body.ok:
        db.queue.replace_one({"_id": f"m-{vid}"}, {"_id": f"m-{vid}", "kind": "flag", "title": f"Flagged entry: {v['place']} {v['field']}", "detail": body.note, "status": "pending", "at": now()}, upsert=True)
    return strip(db.verify.find_one({"_id": vid}))


# ---------------- business ----------------
class BusinessIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    kind: str = Field(pattern="^(food|craft|stay|guide|shop|activity)$")
    city: str = "gwalior"
    near: str = Field(default="", max_length=60)  # a place id the shop is near
    details: str = Field(default="", max_length=600)
    phone: str = Field(default="", max_length=20)
    lat: float | None = None
    lng: float | None = None


@app.post("/me/apply-business")
def apply_business(body: BusinessIn, me: dict | None = Depends(current)):
    """An owner lists a shop. A moderator approves it before it shows in the Bazaar."""
    me = need(me)
    limit(me, "apply-biz", 3, 24 * 60)
    if body.city not in cities.CITY_IDS:
        raise HTTPException(422, "unknown city")
    if body.near:
        place(body.near)
    db = get_db()
    b = {"_id": f"b{uuid.uuid4().hex[:8]}", "owner": me["_id"], "ownerName": me.get("name", ""), **body.model_dump(), "status": "pending", "at": now()}
    db.business.insert_one(b)
    db.queue.insert_one({"_id": f"m-biz-{b['_id']}", "kind": "business", "business": b["_id"], "user": me["_id"],
                         "title": f"New business: {body.name} ({body.kind}, {body.city})", "detail": body.details, "status": "pending", "at": now()})
    return strip(b)


def my_business(me: dict) -> dict:
    b = get_db().business.find_one({"owner": me["_id"]}, sort=[("at", -1)])
    if not b:
        raise HTTPException(404, "no business yet: apply first")
    return b


@app.get("/business/me")
def business_me(me: dict | None = Depends(current)):
    """The owner's own shop with real counts: followers, comments, raahis who checked in."""
    me = need(me)
    b = my_business(me)
    db = get_db()
    out = strip(b)
    out["followers"] = db.follows.count_documents({"target": me["_id"]})
    out["commentCount"] = db.comments.count_documents({"biz": b["_id"], "status": {"$ne": "removed"}})
    out["visits"] = db.awards.count_documents({"_id": {"$regex": f":visit:{re.escape(b['_id'])}:"}})
    return out


@app.put("/business/me")
def business_put(body: dict, me: dict | None = Depends(current)):
    b = my_business(need(me, "business"))
    upd = {k: v for k, v in body.items() if k in ("name", "tags", "details", "near", "phone", "lat", "lng") and len(json.dumps(v)) < 2000}
    for k in ("lat", "lng"):
        if k in upd and not (isinstance(upd[k], (int, float)) and not isinstance(upd[k], bool) and -180 <= upd[k] <= 180):
            raise HTTPException(422, f"{k} must be a number")
    for k in ("name", "phone", "near"):
        if k in upd and not isinstance(upd[k], str):
            raise HTTPException(422, f"{k} must be text")
    get_db().business.update_one({"_id": b["_id"]}, {"$set": upd})
    return strip(get_db().business.find_one({"_id": b["_id"]}))


SHOP_PHOTOS = 6


@app.post("/business/me/photos")
async def business_photo(file: UploadFile = File(...), me: dict | None = Depends(current)):
    """A shop photo. Public: anyone browsing the Bazaar sees it."""
    me = need(me, "business")
    b = my_business(me)
    limit(me, "shop-photo", 30, 24 * 60)
    if file.content_type not in PROOF_TYPES:
        raise HTTPException(415, "send a JPEG, PNG or WebP photo")
    if len(b.get("photos", [])) >= SHOP_PHOTOS:
        raise HTTPException(409, f"up to {SHOP_PHOTOS} photos: remove one first")
    data = await file.read(PHOTO_MAX + 1)
    if len(data) > PHOTO_MAX:
        raise HTTPException(413, "photo is over 2 MB")
    mid = uuid.uuid4().hex[:12]
    db = get_db()
    db.media.insert_one({"_id": mid, "by": me["_id"], "biz": b["_id"], "type": file.content_type, "data": Binary(data), "at": now()})
    db.business.update_one({"_id": b["_id"]}, {"$push": {"photos": mid}})
    return strip(db.business.find_one({"_id": b["_id"]}))


@app.delete("/business/me/photos/{mid}")
def business_photo_delete(mid: str, me: dict | None = Depends(current)):
    b = my_business(need(me, "business"))
    db = get_db()
    db.business.update_one({"_id": b["_id"]}, {"$pull": {"photos": mid}})
    db.media.delete_one({"_id": mid, "biz": b["_id"]})
    return strip(db.business.find_one({"_id": b["_id"]}))


@app.get("/media/{mid}")
def media(mid: str):
    doc = get_db().media.find_one({"_id": mid})
    if not doc:
        raise HTTPException(404, "no such photo")
    return Response(content=bytes(doc["data"]), media_type=doc["type"], headers={"Cache-Control": "public, max-age=604800"})


@app.get("/business/me/comments")
def business_comments(me: dict | None = Depends(current)):
    """Comments raahis left on this owner's posts."""
    me = need(me, "business")
    db = get_db()
    mine = [p["_id"] for p in db.posts.find({"by": me["_id"]}, {"_id": 1})]
    shops = [b["_id"] for b in db.business.find({"owner": me["_id"]}, {"_id": 1})]
    return [strip(c) for c in db.comments.find({"$or": [{"post": {"$in": mine}}, {"biz": {"$in": shops}}], "status": {"$ne": "removed"}}).sort("at", -1).limit(50)]


@app.post("/business/me/sponsor-request")
def sponsor_request(me: dict | None = Depends(current)):
    b = my_business(need(me))
    r = {"_id": uuid.uuid4().hex[:6], "business": b["_id"], "status": "pending", "at": now()}
    db = get_db()
    db.sponsor.insert_one(r)
    db.queue.insert_one({"_id": f"m-sp-{r['_id']}", "kind": "sponsor", "title": f"Sponsor card request: {b['name']}", "detail": "", "status": "pending", "at": now()})
    return strip(r)


# ---------------- moderator ----------------
@app.get("/mod/overview")
def mod_overview(me: dict | None = Depends(current)):
    need(me, "moderator")
    boot()
    db = get_db()
    return {"places": sum(len(data(c)["places"]) for c in cities.available()), "openTickets": db.tickets.count_documents({"status": {"$ne": "answered"}}),
            "saarthis": db.users.count_documents({"roles": "saarthi"}), "users": db.users.count_documents({}),
            "sos": db.sos.count_documents({}), "queue": db.queue.count_documents({"status": "pending"})}


@app.get("/mod/queues")
def mod_queues(me: dict | None = Depends(current)):
    need(me, "moderator")
    boot()
    return [strip(q) for q in get_db().queue.find({"status": "pending"}).sort("at", -1)]


class DecideIn(BaseModel):
    approve: bool


@app.post("/mod/queues/{qid}")
def mod_decide(qid: str, body: DecideIn, me: dict | None = Depends(current)):
    me = need(me, "moderator")
    db = get_db()
    q = db.queue.find_one({"_id": qid})
    if not q:
        raise HTTPException(404, "no such item")
    if q["kind"] == "fact" and q.get("user") == me["_id"]:
        raise HTTPException(403, "you cannot approve your own entry: another team member must")
    db.queue.update_one({"_id": qid}, {"$set": {"status": "approved" if body.approve else "rejected", "decidedBy": me["_id"]}})
    if q["kind"] == "application" and q.get("user") and body.approve:
        db.users.update_one({"_id": q["user"]}, {"$addToSet": {"roles": "saarthi"}, "$set": {"region": q.get("region", ""), "saarthiSince": now()}})
    if q["kind"] == "fact" and q.get("entry"):
        v = db.verify.find_one({"_id": q["entry"]})
        if v:
            st = "approved" if body.approve else "rejected"
            db.verify.update_one({"_id": v["_id"]}, {"$set": {"status": st, "checkedBy": me["_id"]}})
            if body.approve:
                cities.apply_entry({**v, "status": st})
    if q["kind"] == "business" and q.get("business"):
        db.business.update_one({"_id": q["business"]}, {"$set": {"status": "live" if body.approve else "rejected", "decidedBy": me["_id"]}})
        if body.approve and q.get("user"):
            db.users.update_one({"_id": q["user"]}, {"$addToSet": {"roles": "business"}})
    if q["kind"] == "report" and q.get("target"):
        coll = db.posts if q.get("targetKind") == "post" else db.comments
        # Approve the report = keep it hidden. Reject = the content was fine, show it again.
        coll.update_one({"_id": q["target"]}, {"$set": {"status": "removed" if body.approve else "live", "reports": 0}})
    return strip(db.queue.find_one({"_id": qid}))


@app.get("/mod/twists")
def get_twists():
    """Readable by the app (test mode and twists change what raahis see). Only moderators change them."""
    return twists()


@app.put("/mod/twists")
def put_twists(body: dict, me: dict | None = Depends(current)):
    need(me, "moderator")
    twists()
    upd = {k: body[k] for k in TWISTS if k in body}
    get_db().twists.update_one({"_id": "twists"}, {"$set": upd})
    return twists()


@app.get("/mod/sos")
def mod_sos(me: dict | None = Depends(current)):
    """Emergency presses, newest first, each with the full account of the raahi who pressed it."""
    need(me, "moderator")
    out = []
    for e in get_db().sos.find().sort("at", -1).limit(50):
        row = strip(e)
        row["account"] = sos_account(e["user"]) if e.get("user") and e["user"] != "guest" else None
        out.append(row)
    return out


class SosDone(BaseModel):
    note: str = Field(default="", max_length=500)


@app.post("/mod/sos/{sid}")
def mod_sos_handled(sid: str, body: SosDone, me: dict | None = Depends(current)):
    """A moderator marks an emergency press handled, with what they did. Who and when are recorded."""
    me = need(me, "moderator")
    db = get_db()
    if not db.sos.find_one({"_id": sid}):
        raise HTTPException(404, "no such alert")
    t = datetime.now(IST)
    db.sos.update_one({"_id": sid}, {"$set": {"status": "handled", "handledBy": me.get("name"), "handledAt": t.strftime("%Y-%m-%d %H:%M"), "handledNote": body.note}})
    return strip(db.sos.find_one({"_id": sid}))


@app.get("/mod/news")
def mod_news(me: dict | None = Depends(current)):
    need(me, "moderator")
    boot()
    for c in cities.CITY_IDS:
        fetch_news(c)
    db = get_db()
    for n in db.news.find({"status": "pending"}, {"en": 1, "source": 1, "published": 1, "city": 1}):
        if junk_news(n["en"], n.get("source", ""), n.get("city")) or stale_news(n.get("published", "")):
            db.news.delete_one({"_id": n["_id"]})
            continue
        # Items saved before 25 Oct evening: drop the " - Source" tail and show the publish time.
        clean = re.sub(rf"\s+-\s+{re.escape(n.get('source', ''))}$", "", n["en"]).strip()
        upd = {"en": clean} if clean != n["en"] else {}
        upd["ts"] = news_ts(n.get("published", ""))
        try:
            upd["at"] = parsedate_to_datetime(n.get("published", "")).astimezone(IST).strftime("%d %b %Y %H:%M")
        except Exception:
            pass
        if upd:
            db.news.update_one({"_id": n["_id"]}, {"$set": upd})
    news = [strip(n) for n in db.news.find().sort("ts", -1).limit(80)]
    # Pending first, each group newest first.
    return sorted(news, key=lambda n: (n.get("status") != "pending", -(n.get("ts") or 0)))


@app.post("/mod/news/{nid}")
def mod_news_decide(nid: str, body: DecideIn, me: dict | None = Depends(current)):
    need(me, "moderator")
    db = get_db()
    if not db.news.find_one({"_id": nid}):
        raise HTTPException(404, "no such item")
    db.news.update_one({"_id": nid}, {"$set": {"status": "approved" if body.approve else "rejected"}})
    return strip(db.news.find_one({"_id": nid}))


@app.get("/mod/users")
def mod_users(q: str = "", me: dict | None = Depends(current)):
    need(me, "moderator")
    f = {"name": {"$regex": re.escape(q), "$options": "i"}} if q else {}
    return [{"id": u["_id"], "name": u.get("name"), "roles": u.get("roles"), "kind": u.get("kind"), "banned": u.get("banned", False), "points": u.get("points", 0)}
            for u in get_db().users.find(f).limit(50)]


# ---------------- voice ----------------
ELEVEN_URL = "https://api.elevenlabs.io/v1/text-to-speech/"
# Free accounts can only use ElevenLabs' built-in voices through the API (library voices need a paid plan).
ELEVEN_VOICE = os.getenv("ELEVENLABS_VOICE", "EXAVITQu4vr4xnSDxMaL")
# v3 speaks with emotion and follows cues like [warmly]; Aditya chose it over the cheaper Turbo (Sarah, 23 Oct).
# It costs about twice the credits; ELEVENLABS_MODEL=eleven_turbo_v2_5 switches back if credits run low.
ELEVEN_MODEL = os.getenv("ELEVENLABS_MODEL", "eleven_v3")
V3 = ELEVEN_MODEL.startswith("eleven_v3")
# v3 takes only stability (0 creative, 0.5 natural, 1 robust): creative is the lively sample he picked.
ELEVEN_SETTINGS = {"stability": 0.0} if V3 else {"stability": 0.42, "similarity_boost": 0.8, "style": 0.15, "use_speaker_boost": True}
GENTLE = re.compile(r"not possible|closed|sorry|unfortunately|emergency|112|not confirmed|unsafe|संभव नहीं|बंद|माफ़|आपात|पक्का नहीं", re.I)
GOOD = re.compile(r"good news|you can go|open today|great|enjoy|आज खुला|जा सकते|अच्छी खबर|आनंद", re.I)


def with_feeling(text: str) -> str:
    """v3 emotion cues: warm to start, upbeat for good news and questions, gentle for bad news."""
    parts = re.split(r"(?<=[.!?।])\s+", text)
    out = []
    for i, p in enumerate(parts):
        cue = "[gently]" if GENTLE.search(p) else "[excited]" if GOOD.search(p) else "[cheerfully]" if p.rstrip().endswith("?") else "[warmly]" if i == 0 else ""
        out.append(f"{cue} {p}".strip())
    return " ".join(out)
SPEAK_MAX = 360  # characters per clip, cut at a sentence end, so credits last
STT_URL = "https://api.groq.com/openai/v1/audio/transcriptions"


def speakable(text: str, lang: str) -> str:
    """Turns a chat reply into something that sounds natural read aloud, and keeps it short."""
    t = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)  # [label](link) -> label
    t = re.sub(r"https?://\S+", "", t)
    t = re.sub(r"[*_#`>|]+", "", t)
    t = re.sub(r"^\s*(?:[-•▸]|\d+[.)])\s+", "", t, flags=re.M)  # list markers
    t = re.sub(r"₹\s?(\d[\d,]*)", r"\1 रुपये" if lang == "hi" else r"\1 rupees", t)
    t = t.replace("&", " और " if lang == "hi" else " and ")
    t = re.sub(r"[\U0001F000-\U0001FAFF☀-➿]", "", t)  # emoji
    t = re.sub(r"\s*\n+\s*", ". ", t)
    t = re.sub(r"\s+", " ", t).strip()
    t = re.sub(r"([.!?।:])\s*\.", r"\1", t)
    if len(t) <= SPEAK_MAX:
        return t
    cut = max(t.rfind(m, 0, SPEAK_MAX) for m in (". ", "? ", "! ", "। "))
    return t[: cut + 1] if cut > SPEAK_MAX // 3 else t[:SPEAK_MAX].rsplit(" ", 1)[0] + "."


def eleven(text: str, lang: str) -> bytes:
    r = httpx.post(f"{ELEVEN_URL}{ELEVEN_VOICE}", params={"output_format": "mp3_44100_64"},
                   headers={"xi-api-key": os.environ["ELEVENLABS_KEY"], "accept": "audio/mpeg"},
                   json={"text": text, "model_id": ELEVEN_MODEL, "language_code": "hi" if lang == "hi" else "en",
                         "voice_settings": ELEVEN_SETTINGS}, timeout=20)
    r.raise_for_status()
    return r.content


def eleven_stream(text: str, lang: str):
    """ElevenLabs streaming endpoint. Returns the first chunk (so errors surface before we answer) and the rest."""
    client = httpx.Client(timeout=30)
    req = client.build_request("POST", f"{ELEVEN_URL}{ELEVEN_VOICE}/stream", params={"output_format": "mp3_44100_64"},
                               headers={"xi-api-key": os.environ["ELEVENLABS_KEY"], "accept": "audio/mpeg"},
                               json={"text": text, "model_id": ELEVEN_MODEL, "language_code": "hi" if lang == "hi" else "en", "voice_settings": ELEVEN_SETTINGS})
    r = client.send(req, stream=True)
    if r.status_code != 200:
        msg = r.read()[:200]
        r.close()
        client.close()
        raise RuntimeError(f"elevenlabs {r.status_code}: {msg!r}")
    chunks = r.iter_bytes(4096)
    first = next(chunks, b"")

    def rest():
        try:
            yield from chunks
        finally:
            r.close()
            client.close()

    return first, rest()


SPEAKER = eleven  # tests replace this


@app.get("/tts")
def tts(request: Request, text: str = Query(max_length=2000), lang: str = "en"):
    """Read-aloud audio. Each text is made once and kept in the database (ElevenLabs bills per character).
    204 means no key or a failed call: the app uses the free browser voice instead."""
    if not os.getenv("ELEVENLABS_KEY") and SPEAKER is eleven:
        return Response(status_code=204)
    text = speakable(text, lang)
    if V3 and text:
        text = with_feeling(text)
    if not text:
        raise HTTPException(422, "empty text")
    key = hashlib.sha1(f"{ELEVEN_VOICE}|{ELEVEN_MODEL}|{ELEVEN_SETTINGS}|{lang}|{text}".encode()).hexdigest()
    db = get_db()
    hit = db.tts.find_one({"_id": key})
    if hit:
        return Response(bytes(hit["audio"]), media_type="audio/mpeg", headers={"Cache-Control": "public, max-age=604800"})
    # Only new clips cost ElevenLabs credits, so only they count: per visitor and for the whole app per day.
    limit(by_ip(request), "tts", 40, 60)
    limit(EVERYONE, "tts", 400, 24 * 60)
    if SPEAKER is eleven:
        # Stream: the first sound reaches the phone in about a second instead of after the whole clip.
        try:
            first, rest = eleven_stream(text, lang)
        except Exception as e:
            print(f"tts error: {type(e).__name__}: {str(e)[:200]}", flush=True)
            return Response(status_code=204)

        def body():
            got = [first]
            yield first
            for chunk in rest:
                got.append(chunk)
                yield chunk
            db.tts.replace_one({"_id": key}, {"_id": key, "audio": Binary(b"".join(got)), "at": now()}, upsert=True)

        return StreamingResponse(body(), media_type="audio/mpeg", headers={"Cache-Control": "public, max-age=604800"})
    try:
        audio = SPEAKER(text, lang)
    except Exception:
        return Response(status_code=204)
    db.tts.replace_one({"_id": key}, {"_id": key, "audio": Binary(audio), "at": now()}, upsert=True)
    return Response(audio, media_type="audio/mpeg", headers={"Cache-Control": "public, max-age=604800"})


def whisper(audio: bytes, filename: str, lang: str) -> str:
    r = httpx.post(STT_URL, headers={"Authorization": f"Bearer {os.environ['GROQ_KEY']}"},
                   files={"file": (filename, audio)}, data={"model": "whisper-large-v3", "language": "hi" if lang == "hi" else "en"}, timeout=30)
    r.raise_for_status()
    return r.json().get("text", "").strip()


LISTENER = whisper  # tests replace this


@app.post("/stt")
async def stt(request: Request, audio: UploadFile = File(...), lang: str = Form("en")):
    """Voice input for browsers without speech recognition: Whisper on Groq."""
    if not os.getenv("GROQ_KEY") and LISTENER is whisper:
        raise HTTPException(503, "no speech key on the server")
    limit(by_ip(request), "stt", 30, 60)
    limit(EVERYONE, "stt", 300, 24 * 60)
    raw = await audio.read(5_000_001)
    if not raw:
        raise HTTPException(422, "empty audio")
    if len(raw) > 5_000_000:
        raise HTTPException(413, "audio too long")
    try:
        return {"text": LISTENER(raw, audio.filename or "voice.webm", lang)}
    except Exception:
        raise HTTPException(502, "speech service failed")
