"""Cross-user and role checks, the way an outside scanner signed in as two accounts would try them (28 Oct)."""
import io
import json

import bcrypt
import mongomock
import pytest
from fastapi.testclient import TestClient

from app import auth, cities, db, main

c = TestClient(main.app)


@pytest.fixture(autouse=True)
def fresh(monkeypatch):
    db.use(mongomock.MongoClient()["test"])
    cities._cache.clear()
    main._booted = False
    for k in ("GROQ_KEY", "MONGODB_URI", "GOOGLE_CLIENT_ID", "DEMO_LOGIN", "ELEVENLABS_KEY", "TEST_LOGINS"):
        monkeypatch.delenv(k, raising=False)
    yield


def signin(name):
    r = c.post("/auth/google", json={"name": name}).json()
    return {"Authorization": f"Bearer {r['token']}"}, r["user"]["id"]


def give(uid, *roles):
    db.get_db().users.update_one({"_id": uid}, {"$addToSet": {"roles": {"$each": list(roles)}}})


def set_testers(monkeypatch, rows):
    monkeypatch.setenv("TEST_LOGINS", json.dumps([{**r, "hash": bcrypt.hashpw(r.pop("pw").encode(), bcrypt.gensalt(4)).decode()} for r in rows]))
    main._booted = False


def test_email_test_logins(monkeypatch):
    set_testers(monkeypatch, [{"email": "Raahi.A@test.example", "name": "Tester A", "roles": ["raahi"], "pw": "pw-one-long-enough"},
                          {"email": "biz@test.example", "name": "Tester Biz", "roles": ["raahi", "business", "moderator"], "pw": "pw-two-long-enough"}])
    c.get("/health")
    assert c.post("/auth/email", json={"email": "raahi.a@test.example", "password": "wrong-one"}).status_code == 401
    r = c.post("/auth/email", json={"email": "raahi.a@test.example", "password": "pw-one-long-enough"}).json()
    assert r["user"]["kind"] == "test" and r["user"]["roles"] == ["raahi"]
    a = {"Authorization": f"Bearer {r['token']}"}
    assert [x["title"] for x in c.get("/chats", headers=a).json()] == ["Tester A: what is open today"]
    b = c.post("/auth/email", json={"email": "biz@test.example", "password": "pw-two-long-enough"}).json()
    assert "moderator" not in b["user"]["roles"]  # a test login never gets the team role
    bh = {"Authorization": f"Bearer {b['token']}"}
    assert c.get("/business/me", headers=bh).json()["status"] == "test"
    assert c.get("/bazaar?city=gwalior").json() == []  # the test shop never shows to raahis
    # staff and test logins do not cross
    assert c.post("/auth/staff", json={"username": "raahi.a@test.example", "password": "pw-one-long-enough"}).status_code == 401


def test_closed_test_login(monkeypatch):
    set_testers(monkeypatch, [{"email": "gone@test.example", "name": "Gone", "roles": [], "pw": "pw-closed-long-enough"}])
    c.get("/health")
    assert c.post("/auth/email", json={"email": "gone@test.example", "password": "pw-closed-long-enough"}).status_code == 403


def test_one_user_cannot_reach_another_users_records():
    a, aid = signin("Alice")
    b, bid = signin("Bob")
    give(aid, "saarthi", "business")
    give(bid, "saarthi", "business")
    # chats
    assert c.put("/chats/alice-chat-1", json={"title": "Alice", "city": "gwalior", "msgs": [{"id": 1, "role": "user", "text": "secret plan"}]}, headers=a).status_code == 200
    assert c.get("/chats/alice-chat-1", headers=b).status_code == 404
    assert "alice-chat-1" not in [x["id"] for x in c.get("/chats", headers=b).json()]
    assert c.put("/chats/alice-chat-1", json={"title": "Bob", "city": "gwalior", "msgs": []}, headers=b).status_code == 403
    c.delete("/chats/alice-chat-1", headers=b)
    assert c.get("/chats/alice-chat-1", headers=a).json()["msgs"][0]["text"] == "secret plan"
    # plans
    p = c.post("/plans", json={"input": {"hours": 4}}, headers=a).json()
    assert c.put(f"/plans/{p['id']}", json={"input": {"hours": 1}}, headers=b).status_code == 403
    assert p["id"] not in [x["id"] for x in c.get("/me/plans", headers=b).json()]
    # saarthi entries and proofs
    img = ("board.jpg", io.BytesIO(b"\xff\xd8\xff" + b"0" * 100), "image/jpeg")
    proof = c.post("/proofs", files={"file": img}, headers=a).json()["id"]
    e = c.post("/facts", json={"placeId": "sas-bahu", "field": "Ticket prices", "value": "₹25 cash", "label": "locally verified", "proof": [proof]}, headers=a).json()
    assert e["id"] not in [x["id"] for x in c.get("/facts/mine", headers=b).json()]
    bproof = c.post("/proofs", files={"file": ("x.jpg", io.BytesIO(b"\xff\xd8\xff" + b"1" * 50), "image/jpeg")}, headers=b).json()["id"]
    assert c.post(f"/facts/{e['id']}/proof", json={"proof": [bproof]}, headers=b).status_code == 404
    c.post(f"/facts/{e['id']}/proof", json={"proof": [bproof]}, headers=a)
    assert bproof not in (db.get_db().verify.find_one({"_id": e["id"]}).get("proof") or [])  # nobody attaches someone else's proof
    raahi, _ = signin("Plain Raahi")
    assert c.get(f"/proofs/{proof}", headers=raahi).status_code == 403
    assert c.get(f"/proofs/{proof}").status_code == 401
    # shops
    c.post("/me/apply-business", json={"name": "Alice Sweets", "kind": "food", "city": "gwalior"}, headers=a)
    assert c.get("/business/me", headers=b).status_code == 404
    assert c.put("/business/me", json={"name": "Hijacked"}, headers=b).status_code == 404
    assert db.get_db().business.find_one({"owner": aid})["name"] == "Alice Sweets"
    # posts and comments
    post = c.post("/posts", json={"kind": "post", "text": "Alice's post"}, headers=a).json()
    assert c.delete(f"/posts/{post['id']}", headers=b).status_code in (403, 404)
    com = c.post(f"/posts/{post['id']}/comments", json={"text": "Alice's comment"}, headers=a).json()
    assert c.delete(f"/comments/{com['id']}", headers=b).status_code in (403, 404)
    assert c.get(f"/posts/{post['id']}/comments", headers=b).json()[0]["text"] == "Alice's comment"


def test_team_only_routes_refuse_everyone_else():
    a, _ = signin("Alice")
    routes = [("get", "/mod/overview"), ("get", "/mod/queues"), ("post", "/mod/queues/x"), ("put", "/mod/twists"), ("get", "/mod/sos"),
              ("post", "/mod/sos/x"), ("get", "/mod/news"), ("post", "/mod/news/x"), ("get", "/mod/users"), ("post", "/mod/users/x/ban"),
              ("post", "/mod/content/post/x")]
    for m, path in routes:
        kw = {"json": {}} if m in ("post", "put") else {}
        assert getattr(c, m)(path, headers=a, **kw).status_code in (401, 403, 422), path
        assert getattr(c, m)(path, **kw).status_code in (401, 403, 422), path


def test_guest_cannot_write():
    for m, path, body in [("post", "/posts", {"kind": "post", "text": "x"}), ("post", "/facts", {"placeId": "sas-bahu", "field": "x", "value": "y", "label": "estimated"}),
                          ("put", "/me/profile", {"name": "x"}), ("post", "/stamps", {}), ("post", "/feedback", {}), ("get", "/chats", None)]:
        r = getattr(c, m)(path, json=body) if body is not None else getattr(c, m)(path)
        assert r.status_code in (401, 422), (path, r.status_code)
