"""Accounts and sessions.

Raahis sign in with Google: the app sends Google's ID token, we check its signature, audience
and issuer, then give our own session token. Staff (the three moderators) sign in with a
username and password made by admin.py, no Google needed. Staff hold every role, so a moderator
can also work as a saarthi. Roles are read from the database on every request, so a ban or a
role change takes effect at once.
"""
from __future__ import annotations

import json
import os
import secrets
import time
import uuid
from datetime import timedelta

import bcrypt
import jwt
from fastapi import Header, HTTPException

from .db import get_db, now

GOOGLE_ISSUERS = ("accounts.google.com", "https://accounts.google.com")
GOOGLE_CERTS = "https://www.googleapis.com/oauth2/v3/certs"
SESSION_DAYS = 30
STAFF_ROLES = ["raahi", "saarthi", "moderator"]
# Without SESSION_SECRET (laptop dev) sessions last until the server restarts.
_dev_secret = secrets.token_hex(32)
_jwks = None


def secret() -> str:
    return os.getenv("SESSION_SECRET") or _dev_secret


def issue(uid: str) -> str:
    t = int(time.time())
    return jwt.encode({"sub": uid, "iat": t, "exp": t + SESSION_DAYS * 86400}, secret(), algorithm="HS256")


def public(u: dict) -> dict:
    """What the app may see about the signed-in user."""
    keep = ("name", "email", "roles", "avatar", "frame", "banner", "interests", "prefs", "prompt", "points", "kind", "city")
    return {"id": u["_id"], **{k: u.get(k) for k in keep if k in u}}


def new_user(**fields) -> dict:
    u = {"_id": uuid.uuid4().hex, "roles": ["raahi"], "points": 0, "interests": [], "prefs": {}, "prompt": [],
         "avatar": "peacock", "frame": "none", "banner": "dusk", "createdAt": now(), "banned": False, **fields}
    get_db().users.insert_one(u)
    return u


# ---------------- google ----------------
def verify_google(credential: str) -> dict:
    global _jwks
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    if not client_id:
        raise HTTPException(503, "Google sign-in is not set up on this server")
    _jwks = _jwks or jwt.PyJWKClient(GOOGLE_CERTS, cache_keys=True)
    try:
        key = _jwks.get_signing_key_from_jwt(credential).key
        claims = jwt.decode(credential, key, algorithms=["RS256"], audience=client_id, issuer=GOOGLE_ISSUERS)
    except jwt.PyJWTError as e:
        raise HTTPException(401, f"Google sign-in failed: {e}")
    if not claims.get("email_verified"):
        raise HTTPException(401, "Google email not verified")
    return claims


def google_user(claims: dict) -> dict:
    db = get_db()
    u = db.users.find_one({"googleSub": claims["sub"]})
    if u:
        db.users.update_one({"_id": u["_id"]}, {"$set": {"lastSeen": now()}})
        return u
    return new_user(kind="google", googleSub=claims["sub"], email=claims.get("email"), name=claims.get("given_name") or claims.get("name") or "Raahi")


# ---------------- staff ----------------
def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def make_staff(username: str, name: str, pw: str) -> dict:
    if len(pw) < 10:
        raise ValueError("password needs at least 10 characters")
    db = get_db()
    u = db.users.find_one({"username": username.lower()})
    if u:
        db.users.update_one({"_id": u["_id"]}, {"$set": {"pwHash": hash_pw(pw), "roles": STAFF_ROLES, "name": name}})
        return db.users.find_one({"_id": u["_id"]})
    return new_user(kind="staff", username=username.lower(), name=name, pwHash=hash_pw(pw), roles=STAFF_ROLES)


def staff_login(username: str, pw: str, kind: str = "staff") -> dict:
    db = get_db()
    key = f"login:{username.lower()}"
    since = now() - timedelta(minutes=15)
    if db.hits.count_documents({"user": key, "action": "fail", "at": {"$gte": since}}) >= 8:
        raise HTTPException(429, "too many tries, wait 15 minutes")
    u = db.users.find_one({"username": username.lower(), "kind": kind})
    if not u or not bcrypt.checkpw(pw.encode(), u["pwHash"].encode()):
        db.hits.insert_one({"user": key, "action": "fail", "at": now()})
        raise HTTPException(401, "wrong username or password")
    return u


# ---------------- test logins ----------------
TESTER_ROLES = {"raahi", "saarthi", "business"}  # never moderator


def sync_testers() -> list[dict]:
    """Email and password accounts for outside testers (ArgosX Pro scans cannot click through Google sign-in).
    They come from the TEST_LOGINS server setting: a JSON list of {email, name, roles, hash}, where hash is a
    bcrypt hash, so no password is stored in plain text anywhere. Removing a row from the setting does not
    delete the account: set its roles to [] to shut it."""
    raw = os.getenv("TEST_LOGINS")
    if not raw and os.getenv("TEST_LOGINS_FILE"):  # laptop runs: the same list from a local file
        raw = open(os.environ["TEST_LOGINS_FILE"], encoding="utf-8").read()
    if not raw:
        return []
    out = []
    db = get_db()
    for t in json.loads(raw):
        email = t["email"].strip().lower()
        roles = [r for r in t.get("roles", ["raahi"]) if r in TESTER_ROLES]
        fields = {"pwHash": t["hash"], "roles": roles, "name": t.get("name", "Tester"), "email": email}
        u = db.users.find_one({"username": email, "kind": "test"})
        if u:
            db.users.update_one({"_id": u["_id"]}, {"$set": fields})
            u = db.users.find_one({"_id": u["_id"]})
        else:
            u = new_user(kind="test", username=email, **fields)
        out.append(u)
    return out


# ---------------- request helpers ----------------
def current(authorization: str | None = Header(None)) -> dict | None:
    """The signed-in user, or None for a guest. A bad or expired token counts as a guest."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    try:
        sub = jwt.decode(authorization[7:], secret(), algorithms=["HS256"])["sub"]
    except jwt.PyJWTError:
        return None
    u = get_db().users.find_one({"_id": sub})
    if not u or u.get("banned"):
        return None
    return u


def need(user: dict | None, role: str = "raahi") -> dict:
    if not user:
        raise HTTPException(401, "sign in first")
    if role not in user.get("roles", []):
        raise HTTPException(403, f"needs the {role} role")
    return user


def limit(user: dict, action: str, n: int, minutes: int) -> None:
    """At most n of an action per user in a time window (spam and farming)."""
    db = get_db()
    since = now() - timedelta(minutes=minutes)
    if db.hits.count_documents({"user": user["_id"], "action": action, "at": {"$gte": since}}) >= n:
        raise HTTPException(429, f"slow down: {action} limit reached")
    db.hits.insert_one({"user": user["_id"], "action": action, "at": now()})
