"""One test or more per endpoint in app/docs/API.md. Runs on an in-memory database."""
import os
import time

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
    for k in ("GROQ_KEY", "ADAPTION_API_KEY", "MONGODB_URI", "GOOGLE_CLIENT_ID", "DEMO_LOGIN", "ELEVENLABS_KEY"):
        monkeypatch.delenv(k, raising=False)
    main.WRITER = main.write
    main.SPEAKER = main.eleven
    main.LISTENER = main.whisper
    yield


def signin(name="Aditya"):
    r = c.post("/auth/google", json={"name": name}).json()
    return {"Authorization": f"Bearer {r['token']}"}


def staff(username="aditya", name="Aditya"):
    auth.make_staff(username, name, "a-long-password")
    r = c.post("/auth/staff", json={"username": username, "password": "a-long-password"}).json()
    return {"Authorization": f"Bearer {r['token']}"}


def veteran(*names):
    """Saarthis past their first week: their entries go to other saarthis, not to a moderator."""
    from datetime import datetime, timedelta, timezone
    main.get_db().users.update_many({"username": {"$in": list(names)}}, {"$set": {"saarthiSince": datetime.now(timezone.utc) - timedelta(days=10)}})


def at(pid, n=3, acc=12, offset_s=0):
    coord = next(p for p in main.data()["places"] if p["id"] == pid)["units"][0]["coord"]
    t0 = time.time() + offset_s
    return [{"lat": coord[0], "lng": coord[1], "accuracy": acc, "t": t0 + i * 60} for i in range(n)]


# data
def test_health_and_cities():
    assert c.get("/health").json()["ok"]
    ids = [x["id"] for x in c.get("/cities").json()]
    assert ids[0] == "gwalior"
    assert c.get("/cities/nearest", params={"lat": 26.23, "lng": 78.17}).json()["city"] == "gwalior"
    assert c.get("/cities/nearest", params={"lat": 19.07, "lng": 72.87}).json() is None


def test_city_data_is_the_checked_seed():
    d = c.get("/cities/gwalior/data").json()
    jv = next(p for p in d["places"] if p["id"] == "jai-vilas")
    assert jv["units"][0]["fees"]["s"] == "conflicting"  # Priyangi, Fact 2
    assert c.get("/cities/agra/data").status_code == 404


# auth and profile
def test_profile_never_stores_religion():
    h = signin()
    r = c.put("/me/profile", json={"interests": ["forts"], "prompt": ["Likes forts", "Is Hindu"]}, headers=h).json()
    assert r["prompt"] == ["Likes forts"]
    assert c.get("/me/profile", headers=h).json()["interests"] == ["forts"]


def test_staff_login_roles_and_wrong_password():
    auth.make_staff("pranjal", "Pranjal", "a-long-password")
    assert c.post("/auth/staff", json={"username": "pranjal", "password": "wrong"}).status_code == 401
    r = c.post("/auth/staff", json={"username": "Pranjal", "password": "a-long-password"}).json()
    assert set(r["user"]["roles"]) == {"raahi", "saarthi", "moderator"}  # mods are saarthis too
    with pytest.raises(ValueError):
        auth.make_staff("x", "X", "short")


def test_staff_login_locks_after_many_fails():
    auth.make_staff("pranjal", "Pranjal", "a-long-password")
    for _ in range(8):
        c.post("/auth/staff", json={"username": "pranjal", "password": "wrong"})
    assert c.post("/auth/staff", json={"username": "pranjal", "password": "a-long-password"}).status_code == 429


def test_google_sign_in_makes_one_account_per_google_user(monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "cid")
    monkeypatch.setattr(auth, "verify_google", lambda cred: {"sub": "g-123", "email": "a@b.c", "given_name": "Asha", "email_verified": True})
    a = c.post("/auth/google", json={"credential": "x"}).json()
    b = c.post("/auth/google", json={"credential": "x"}).json()
    assert a["user"]["id"] == b["user"]["id"] and a["user"]["name"] == "Asha" and a["user"]["roles"] == ["raahi"]
    # With Google set up, name-only sign-in is off.
    assert c.post("/auth/google", json={"name": "Fake"}).status_code == 422


def test_bad_token_is_a_guest_and_ban_takes_effect():
    assert c.get("/me", headers={"Authorization": "Bearer nonsense"}).status_code == 401
    h = signin("Spammer")
    uid = c.get("/me", headers=h).json()["id"]
    assert c.post(f"/mod/users/{uid}/ban", json={"banned": True}, headers=staff()).json()["banned"]
    assert c.get("/me", headers=h).status_code == 401


def test_saarthi_application_approved_by_a_moderator():
    h = signin("Ravi")
    assert c.post("/me/apply-saarthi", json={"region": "Gwalior old city"}, headers=h).json()["status"] == "pending"
    m = staff()
    q = next(x for x in c.get("/mod/queues", headers=m).json() if x["kind"] == "application" and x.get("user"))
    c.post(f"/mod/queues/{q['id']}", json={"approve": True}, headers=m)
    assert "saarthi" in c.get("/me", headers=h).json()["roles"]


# plans
def test_plan_save_and_update():
    p = c.post("/plans", json={"input": {"hours": 4}}).json()
    c.put(f"/plans/{p['id']}", json={"input": {"hours": 4}, "done": ["teli-ka-mandir"]})
    assert c.get(f"/plans/{p['id']}").json()["done"] == ["teli-ka-mandir"]
    assert c.get("/plans/nope").status_code == 404
    h = signin()
    mine = c.post("/plans", json={"input": {"hours": 6}}, headers=h).json()
    assert c.put(f"/plans/{mine['id']}", json={"input": {}}, headers=signin("Other")).status_code == 403
    assert [x["id"] for x in c.get("/me/plans", headers=h).json()] == [mine["id"]]


# stamps
def test_stamp_needs_an_account():
    assert c.post("/stamps", json={"placeId": "teli-ka-mandir", "readings": at("teli-ka-mandir")}).status_code == 401


def test_stamp_confirmed_at_the_place_with_points():
    h = signin()
    r = c.post("/stamps", json={"placeId": "teli-ka-mandir", "readings": at("teli-ka-mandir")}, headers=h).json()
    assert r["status"] == "confirmed" and r["rarity"] == "rare" and r["points"] >= 50
    assert c.get("/me/stamps", headers=h).json()["teli-ka-mandir"]["status"] == "confirmed"
    p = c.get("/me/progress", headers=h).json()
    assert p["rare"] == 1 and p["gwalior"]["got"] == 1
    # The same stamp again gives no new points.
    assert c.post("/stamps", json={"placeId": "teli-ka-mandir", "readings": at("teli-ka-mandir")}, headers=h).json()["points"] == 0


def test_stamp_rejected_far_away_and_single_reading():
    h = signin()
    far = [{"lat": 28.61, "lng": 77.2, "accuracy": 10, "t": time.time() + i * 60} for i in range(3)]
    assert c.post("/stamps", json={"placeId": "sas-bahu", "readings": far}, headers=h).json()["status"] == "rejected"
    one = at("sas-bahu", n=1)
    assert c.post("/stamps", json={"placeId": "sas-bahu", "readings": one}, headers=h).json()["status"] == "rejected"


def test_stamp_pending_on_poor_accuracy_then_counter_code_confirms():
    h = signin()
    assert c.post("/stamps", json={"placeId": "sas-bahu", "readings": at("sas-bahu", acc=120)}, headers=h).json()["status"] == "pending"
    r = c.post("/stamps", json={"placeId": "sas-bahu", "readings": [], "code": "demo-qr"}, headers=h).json()
    assert r["status"] == "confirmed"


def test_stamp_impossible_travel_rejected():
    h = signin()
    c.post("/stamps", json={"placeId": "jai-vilas", "readings": at("jai-vilas")}, headers=h)
    # Jai Vilas to the Sun Temple (several km) two minutes later.
    r = c.post("/stamps", json={"placeId": "sun-temple", "readings": at("sun-temple", offset_s=180)}, headers=h).json()
    assert r["status"] == "rejected"
    assert {x["check"]: x["ok"] for x in r["checks"]}["impossibleTravel"] is False


def test_worship_site_gives_plain_stamp_and_test_mode():
    h = signin()
    assert c.put("/mod/twists", json={"testMode": True}, headers=h).status_code == 403
    c.put("/mod/twists", json={"testMode": True}, headers=staff())
    r = c.post("/stamps", json={"placeId": "gurudwara-data-bandi-chhod"}, headers=h).json()
    assert r["testMode"] and r["status"] == "confirmed" and r["rarity"] == "plain" and r["points"] == 10


# feedback, still true, tickets
def test_feedback_creates_ticket_and_points_once():
    h = signin()
    r = c.post("/feedback", json={"placeId": "sas-bahu", "answers": {"open": "Yes"}}, headers=h).json()
    assert r["points"] == 15
    assert c.get("/tickets", headers=staff()).json()[0]["id"] == r["ticket"]
    assert c.post("/feedback", json={"placeId": "sas-bahu", "note": "again"}, headers=h).json()["points"] == 0
    assert c.post("/feedback", json={"placeId": "sas-bahu"}, headers=h).status_code == 422


def test_still_true_disagreement_makes_task():
    assert c.post("/still-true", json={"placeId": "sas-bahu", "yes": False}).status_code == 401
    c.post("/still-true", json={"placeId": "sas-bahu", "yes": False}, headers=signin())
    assert c.get("/tickets", headers=staff()).json()[0]["from"] == "Still-true taps"


def test_ticket_answer_and_escalate():
    h = staff()
    raahi = signin()
    assert c.get("/tickets", headers=raahi).status_code == 403  # raahis cannot see saarthi work
    t1 = c.post("/feedback", json={"placeId": "sas-bahu", "answers": {"open": "yes"}}, headers=raahi).json()["ticket"]
    t2 = c.post("/feedback", json={"placeId": "teli-ka-mandir", "note": "Board says closed"}, headers=raahi).json()["ticket"]
    assert {t["id"] for t in c.get("/tickets", headers=h).json()} >= {t1, t2}
    assert c.post(f"/tickets/{t1}/answer", json={"answer": "Checked"}, headers=h).json()["status"] == "answered"
    c.post(f"/tickets/{t2}/answer", json={"escalate": True}, headers=h)
    assert any(q["id"] == f"m-{t2}" for q in c.get("/mod/queues", headers=h).json())


# alerts, bazaar, sos
def test_news_hidden_until_moderator_approves(monkeypatch):
    monkeypatch.setattr(main, "fetch_news", lambda city: None)
    monkeypatch.setattr(main, "weather", lambda city: None)
    main.get_db().news.insert_one({"_id": "n1", "kind": "news", "city": "gwalior", "en": "Road works near the fort", "source": "Test", "at": "x", "status": "pending"})
    assert "n1" not in [a["id"] for a in c.get("/alerts").json()]
    assert c.post("/mod/news/n1", json={"approve": True}).status_code == 401
    c.post("/mod/news/n1", json={"approve": True}, headers=staff())
    assert "n1" in [a["id"] for a in c.get("/alerts").json()]


def test_weather_is_live_and_cached(monkeypatch):
    monkeypatch.setattr(main, "fetch_news", lambda city: None)
    calls = []

    class R:
        def raise_for_status(self): pass
        def json(self): return {"current": {"temperature_2m": 31, "apparent_temperature": 33, "weather_code": 1}, "daily": {"temperature_2m_max": [37], "temperature_2m_min": [21], "precipitation_probability_max": [10], "uv_index_max": [6]}}
    monkeypatch.setattr(main.httpx, "get", lambda *a, **k: calls.append(1) or R())
    w = c.get("/alerts").json()[0]
    assert w["kind"] == "weather" and "31°C" in w["en"] and "Hot day" in w["en"]
    c.get("/alerts")
    assert len(calls) == 1  # second call within 4 hours uses the stored reading


def test_business_apply_approve_then_bazaar():
    owner = signin("Shop Owner")
    mod = staff()
    assert c.get("/business/me", headers=owner).status_code == 404  # no shop until they apply
    b = c.post("/me/apply-business", json={"name": "Bahadura Sweets", "kind": "food", "city": "gwalior", "near": "jai-vilas", "details": "Laddu since 1950"}, headers=owner).json()
    assert b["status"] == "pending" and c.get("/bazaar?city=gwalior").json() == []
    assert c.put("/business/me", json={"name": "x"}, headers=owner).status_code == 403  # not a business until approved
    q = next(q for q in c.get("/mod/queues", headers=mod).json() if q["kind"] == "business")
    c.post(f"/mod/queues/{q['id']}", json={"approve": True}, headers=mod)
    assert [x["name"] for x in c.get("/bazaar?city=gwalior&route=jai-vilas").json()] == ["Bahadura Sweets"]
    assert c.get("/bazaar?city=indore").json() == []
    assert c.put("/business/me", json={"details": "Open 9 to 9", "evil": 1}, headers=owner).json()["details"] == "Open 9 to 9"
    assert "evil" not in c.get("/business/me", headers=owner).json()
    assert c.put("/business/me", json={"lat": {"$gt": 0}}, headers=owner).status_code == 422
    assert c.put("/business/me", json={"name": ["<img src=x>"]}, headers=owner).status_code == 422
    other = signin("Someone Else")
    assert c.get("/business/me", headers=other).status_code == 404  # nobody edits a shared shop any more


def test_sos_logged_for_moderators():
    c.post("/sos", json={"lat": 26.23, "lng": 78.17})  # guests can call for help
    assert len(c.get("/mod/sos", headers=staff()).json()) == 1
    assert c.get("/mod/sos", headers=signin()).status_code == 403


# chat
def test_chat_without_key_tells_app_to_use_rules():
    assert c.post("/chat", json={"text": "Fort ticket price?"}).json() == {"ai": False, "note": "no-key", "text": None}


def test_chat_emergency_never_calls_model():
    main.WRITER = lambda m: pytest.fail("model called")
    assert c.post("/chat", json={"text": "I need an ambulance"}).json()["emergency"]


def test_chat_grounded_reply_passes():
    seen = {}
    def writer(messages):
        seen["last"] = messages[-1]["content"]
        return "Sas-Bahu Temple: good to go today, the fee is ₹25 cash."
    main.WRITER = writer
    r = c.post("/chat", json={"text": "Can I visit Sas-Bahu temple?"}).json()
    assert r["ai"] and "₹25" in r["text"]
    assert seen["last"].startswith("FACTS: ")  # the model only sees the pack


def test_chat_invented_fee_falls_back():
    main.WRITER = lambda m: "The Sas-Bahu ticket is ₹75."
    assert c.post("/chat", json={"text": "Sas-Bahu temple fee?"}).json() == {"ai": False, "note": "grounding", "text": None, "placeIds": ["sas-bahu"]}


def test_chat_unasked_place_is_caught():
    replies = iter(["Sas-Bahu Temple is fine. Also see Jai Vilas Palace.", "Sas-Bahu Temple is fine today."])
    main.WRITER = lambda m: next(replies)
    r = c.post("/chat", json={"text": "Sas-Bahu temple today?"}).json()
    assert r["ai"] and "Jai Vilas" not in r["text"]


def test_chat_search_finds_places_by_meaning():
    seen = {}
    def writer(messages):
        seen["facts"] = messages[-1]["content"]
        return "Tomb of Tansen is the place for music."
    main.WRITER = writer
    c.post("/chat", json={"text": "Where can I learn about classical music?"})
    assert "Tomb of Tansen" in seen["facts"]


def test_chat_pack_never_carries_disputed_prices():
    seen = {}
    def writer(messages):
        seen["facts"] = messages[-1]["content"]
        return "Jai Vilas Palace: confirm with the place before going."
    main.WRITER = writer
    r = c.post("/chat", json={"text": "Jai Vilas palace price?"}).json()
    assert r["ai"]
    assert "not confirmed" in seen["facts"] and "350" not in seen["facts"] and "550" not in seen["facts"]


# saarthi
def test_saarthi_fact_flow_and_no_self_verify():
    a, p = staff("aditya", "Aditya"), staff("priyangi", "Priyangi")
    veteran("aditya", "priyangi")
    assert c.post("/facts", json={"placeId": "sas-bahu", "field": "x", "value": "y", "label": "estimated"}, headers=signin()).status_code == 403
    e = c.post("/facts", json={"placeId": "sas-bahu", "field": "Ticket prices", "value": "₹25 cash", "label": "locally verified"}, headers=a).json()
    assert e["risk"] == "high" and e["status"] == "pending"
    assert c.post(f"/verify/{e['id']}", json={"ok": True}, headers=a).status_code == 403
    assert e["id"] not in [v["id"] for v in c.get("/verify-queue", headers=a).json()]
    assert c.post(f"/verify/{e['id']}", json={"ok": True}, headers=p).json()["status"] == "approved"
    assert c.post("/facts", json={"placeId": "sas-bahu", "field": "x", "value": "y", "label": "made up"}, headers=a).status_code == 422


def test_saarthi_me_and_posts():
    h = staff()
    raahi = signin("Ravi")
    assert c.post("/posts", json={"as": "saarthi", "kind": "fact", "text": "hi"}, headers=raahi).status_code == 403
    # raahi applies, a moderator approves, then the new saarthi can post and verify
    c.post("/me/apply-saarthi", json={"region": "Gwalior Fort", "note": "Guide for 5 years"}, headers=raahi)
    q = next(q for q in c.get("/mod/queues", headers=h).json() if q["kind"] == "application")
    c.post(f"/mod/queues/{q['id']}", json={"approve": True}, headers=h)
    assert "saarthi" in c.get("/me", headers=raahi).json()["roles"]
    main.get_db().users.update_one({"name": "Ravi"}, {"$set": {"saarthiSince": __import__("datetime").datetime(2026, 1, 1, tzinfo=__import__("datetime").timezone.utc)}})
    c.post("/facts", json={"placeId": "sas-bahu", "field": "Opening hours", "value": "8 to 6", "label": "locally verified"}, headers=raahi)
    assert c.get("/saarthi/me", headers=h).json()["toVerify"] == 1
    assert c.post("/posts", json={"as": "saarthi", "kind": "fact", "text": "Fee board checked today."}, headers=raahi).json()["status"] == "live"
    assert c.post("/posts", json={"kind": "meme", "text": "hi"}, headers=h).status_code == 422


# social
def test_like_save_follow_count_once():
    s = staff()
    post = c.post("/posts", json={"as": "saarthi", "kind": "fact", "text": "Fee board checked today.", "placeId": "sas-bahu"}, headers=s).json()
    h = signin()
    for _ in range(3):
        r = c.post(f"/posts/{post['id']}/like", json={"on": True}, headers=h).json()
    assert r["likes"] == 1 and r["liked"]
    assert c.post(f"/posts/{post['id']}/like", json={"on": False}, headers=h).json()["likes"] == 0
    c.post(f"/posts/{post['id']}/save", json={"on": True}, headers=h)
    assert [p["id"] for p in c.get("/feed?tab=saved", headers=h).json()] == [post["id"]]
    author = post["by"]
    assert c.post(f"/follow/{author}", json={"on": True}, headers=h).json()["followers"] == 1
    assert c.post(f"/follow/{author}", json={"on": True}, headers=h).json()["followers"] == 1
    assert [p["id"] for p in c.get("/feed?tab=following", headers=h).json()] == [post["id"]]
    assert c.post(f"/posts/{post['id']}/like", json={"on": True}).status_code == 401
    assert c.get(f"/saarthis/{author}").json()["followers"] == 1


def test_comments_block_links_and_phone_numbers():
    post = c.post("/posts", json={"as": "saarthi", "kind": "fact", "text": "Open today."}, headers=staff()).json()
    h = signin()
    assert c.post(f"/posts/{post['id']}/comments", json={"text": "Thanks!"}, headers=h).status_code == 200
    assert c.post(f"/posts/{post['id']}/comments", json={"text": "visit spam.xyz now"}, headers=h).status_code == 422
    assert c.post(f"/posts/{post['id']}/comments", json={"text": "call 98765 43210"}, headers=h).status_code == 422
    assert len(c.get(f"/posts/{post['id']}/comments").json()) == 1


def test_three_reports_hide_a_post_and_queue_it():
    s = staff()
    post = c.post("/posts", json={"kind": "blog", "text": "Something rude."}, headers=s).json()
    for n in ("A", "B", "C"):
        c.post(f"/report/{post['id']}", json={"kind": "post"}, headers=signin(n))
    assert post["id"] not in [p["id"] for p in c.get("/feed").json()]
    q = next(x for x in c.get("/mod/queues", headers=s).json() if x["kind"] == "report")
    c.post(f"/mod/queues/{q['id']}", json={"approve": False}, headers=s)  # the post was fine
    assert post["id"] in [p["id"] for p in c.get("/feed").json()]


def test_one_person_reporting_many_times_counts_once():
    post = c.post("/posts", json={"kind": "blog", "text": "Fine post."}, headers=staff()).json()
    h = signin()
    for _ in range(5):
        c.post(f"/report/{post['id']}", json={"kind": "post"}, headers=h)
    assert post["id"] in [p["id"] for p in c.get("/feed").json()]


def test_comment_rate_limit():
    post = c.post("/posts", json={"as": "saarthi", "kind": "fact", "text": "Open."}, headers=staff()).json()
    h = signin()
    codes = [c.post(f"/posts/{post['id']}/comments", json={"text": f"note {i}"}, headers=h).status_code for i in range(31)]
    assert codes[:30] == [200] * 30 and codes[-1] == 429


# business
def test_business_page_comments_sponsor():
    owner = signin("Shop Owner")
    mod = staff()
    c.post("/me/apply-business", json={"name": "Craft Corner", "kind": "craft", "city": "gwalior"}, headers=owner)
    q = next(q for q in c.get("/mod/queues", headers=mod).json() if q["kind"] == "business")
    c.post(f"/mod/queues/{q['id']}", json={"approve": True}, headers=mod)
    post = c.post("/posts", json={"as": "business", "kind": "offer", "text": "10% off this week"}, headers=owner).json()
    c.post(f"/posts/{post['id']}/comments", json={"text": "Lovely shop"}, headers=signin("Visitor"))
    assert [x["text"] for x in c.get("/business/me/comments", headers=owner).json()] == ["Lovely shop"]
    c.post("/business/me/sponsor-request", headers=owner)
    assert any(q["kind"] == "sponsor" for q in c.get("/mod/queues", headers=mod).json())


# moderator
def test_mod_overview_queue_and_twists():
    h = staff()
    assert c.get("/mod/overview", headers=signin()).status_code == 403
    c.post("/me/apply-saarthi", json={"region": "Indore", "note": ""}, headers=signin("Asha"))
    o = c.get("/mod/overview", headers=h).json()
    assert o["places"] >= 9 and o["queue"] == 1  # no sample items: only what people sent
    q = c.get("/mod/queues", headers=h).json()[0]
    assert c.post(f"/mod/queues/{q['id']}", json={"approve": True}, headers=h).json()["status"] == "approved"
    assert c.put("/mod/twists", json={"closed": ["teli-ka-mandir"], "rain": True}, headers=h).json()["closed"] == ["teli-ka-mandir"]
    assert c.get("/mod/twists").json()["rain"] is True


# live Groq, only with a key in the shell
@pytest.mark.skipif(not os.getenv("GROQ_LIVE_KEY"), reason="no GROQ_LIVE_KEY in the shell")
def test_chat_live(monkeypatch):
    monkeypatch.setenv("GROQ_KEY", os.environ["GROQ_LIVE_KEY"])
    r = c.post("/chat", json={"text": "Is Jai Vilas Palace open today and what does it cost?"}).json()
    assert r["ai"] or r["note"] == "grounding"


# voice
def test_tts_without_key_tells_app_to_use_browser_voice():
    assert c.get("/tts", params={"text": "Namaste"}).status_code == 204


def test_tts_is_made_once_and_kept():
    calls = []
    main.SPEAKER = lambda t, lang: calls.append(t) or b"ID3fake"
    for _ in range(2):
        r = c.get("/tts", params={"text": "Sas-Bahu is open today"})
        assert r.status_code == 200 and r.headers["content-type"] == "audio/mpeg" and r.content == b"ID3fake"
    assert len(calls) == 1 and calls[0].endswith("Sas-Bahu is open today")  # v3 adds a feeling cue in front


def test_stt_without_key_is_503_and_with_listener_returns_text():
    assert c.post("/stt", files={"audio": ("v.webm", b"abc")}).status_code == 503
    main.LISTENER = lambda data, name, lang: f"heard {len(data)} bytes in {lang}"
    r = c.post("/stt", files={"audio": ("v.webm", b"abc")}, data={"lang": "hi"})
    assert r.json() == {"text": "heard 3 bytes in hi"}
    assert c.post("/stt", files={"audio": ("v.webm", b"")}).status_code == 422


def test_speakable_reads_like_speech_and_stays_short():
    assert main.speakable("**Sas-Bahu** is open.\n- Ticket: ₹25 cash 🙂", "en") == "Sas-Bahu is open. Ticket: 25 rupees cash"
    assert "रुपये" in main.speakable("टिकट ₹25", "hi")
    assert len(main.speakable("A short sentence here. " * 40, "en")) <= main.SPEAK_MAX


def test_chat_overclaimed_label_is_rewritten():
    replies = iter(["Sarafa Bazaar food stalls run late, officially confirmed.", "Sarafa Bazaar food stalls run late, as recently reported."])
    main.WRITER = lambda m: next(replies)
    r = c.post("/chat", json={"text": "Sarafa night food?", "city": "indore"}).json()
    assert r["ai"] and "officially" not in r["text"]


def test_chat_knows_the_app_and_tips_only_sometimes():
    seen = []
    def writer(messages):
        seen.append(messages[-1]["content"])
        return "Open the place and tap Collect stamp."
    main.WRITER = writer
    c.post("/chat", json={"text": "How do I collect a stamp?"})
    assert "appGuide" in seen[-1] and "Collect stamp" in seen[-1]
    assert "Yatra" in main.system_prompt(main.ChatIn(text="hi"), "Gwalior")
    # A place question can carry one tip...
    c.post("/chat", json={"text": "Is Sas-Bahu temple open?"})
    assert "maybeMention" in seen[-1]
    # ...but not right after a reply that already pointed at a feature.
    c.post("/chat", json={"text": "Is Sas-Bahu temple open?", "history": [{"role": "assistant", "text": "Tap Collect stamp when you are there."}]})
    assert "maybeMention" not in seen[-1]


def test_ordinary_word_facts_is_not_a_leak():
    main.WRITER = lambda m: "I give you checked facts about each place and plan your day."
    assert c.post("/chat", json={"text": "What can you do?"}).json()["ai"] is True


def test_v3_feeling_cues():
    t = main.with_feeling("Teli ka Mandir is open today. The museum is closed on Mondays. Shall I plan your day?")
    assert t.startswith("[excited] Teli ka Mandir") and "[gently] The museum is closed" in t and "[cheerfully] Shall I" in t
    assert main.with_feeling("Namaste.").startswith("[warmly]")


def test_leaderboard_and_streak():
    h = signin("Asha")
    c.post("/stamps", json={"placeId": "teli-ka-mandir", "readings": at("teli-ka-mandir")}, headers=h)
    board = c.get("/leaderboard?period=week", headers=h).json()
    assert board["rows"][0]["name"] == "Asha" and board["rows"][0]["me"] and board["myRank"] == 1
    assert c.get("/leaderboard?period=all").json()["rows"][0]["points"] >= 50
    assert c.get("/me/progress", headers=h).json()["streak"] == 1
    staff()  # moderators are not ranked
    assert all(r["name"] != "Aditya" for r in c.get("/leaderboard?period=all").json()["rows"])


# activities and FAQs (25 Oct)
def test_chat_finds_boating_at_tighra():
    seen = {}
    def writer(messages):
        seen["facts"] = messages[-1]["content"]
        return "Tighra Dam has boating."
    main.WRITER = writer
    c.post("/chat", json={"text": "I want to do boating in Gwalior"})
    assert "Tighra Dam" in seen["facts"] and "Boating" in seen["facts"]


def test_faqs_never_state_disputed_prices():
    jv = next(p for p in c.get("/cities/gwalior/data").json()["places"] if p["id"] == "jai-vilas")
    fee = next(f for f in jv["faqs"] if f["from"] == "fees")
    assert "sources disagree" in fee["a"]["en"] and not any(n in fee["a"]["en"] for n in ("350", "550", "1000"))


def test_verified_saarthi_entry_updates_the_place():
    a, b = staff("aditya", "Aditya"), staff("priyangi", "Priyangi")
    veteran("aditya", "priyangi")
    c.post("/facts", json={"placeId": "sas-bahu", "field": "Opening hours", "value": "8 am to 6 pm", "label": "locally verified"}, headers=a)
    vid = c.get("/verify-queue", headers=b).json()[0]["id"]
    assert c.post(f"/verify/{vid}", json={"ok": True}, headers=b).json()["status"] == "approved"
    sb = next(p for p in c.get("/cities/gwalior/data").json()["places"] if p["id"] == "sas-bahu")
    h = sb["units"][0]["hours"]
    assert h["s"] == "locally verified" and h["v"] == {"kind": "fixed", "open": "08:00", "close": "18:00"} and h["by"] == "Aditya"
    cities.import_city("gwalior")  # a redeploy re-imports the file: the saarthi's entry stays
    sb = next(p for p in c.get("/cities/gwalior/data").json()["places"] if p["id"] == "sas-bahu")
    assert sb["units"][0]["hours"]["s"] == "locally verified"


def test_city_numbers_reach_yatra():
    seen = {}
    def writer(messages):
        seen["facts"] = messages[-1]["content"]
        return "Gwalior airport: 0751-2470080."
    main.WRITER = writer
    r = c.post("/chat", json={"text": "What is the airport phone number?"}).json()
    assert "0751-2470080" in seen["facts"] and r["ai"]


def test_phone_in_another_format_still_grounded():
    from app import grounding
    ok, _ = grounding.check("Call 0731 262 6326.", [{"phones": ["+91-731-2626326"]}])
    assert ok
    bad, _ = grounding.check("Call 0731 262 9999.", [{"phones": ["+91-731-2626326"]}])
    assert not bad


def test_open_today_lists_every_open_place_not_only_plannable():
    seen = {}
    def writer(messages):
        seen["facts"] = messages[-1]["content"]
        return "Open today."
    main.WRITER = writer
    c.post("/chat", json={"text": "What is open today?", "city": "indore"})
    assert seen["facts"].count('"todaysVerdict"') > 3 and "Khajrana" in seen["facts"]


def test_sos_shows_full_account_and_can_be_handled():
    raahi = signin("Meera")
    c.post("/stamps", json={"placeId": "sas-bahu", "readings": at("sas-bahu"), "code": "DEMO-QR"}, headers=raahi)
    c.post("/sos", json={"lat": 26.23, "lng": 78.17, "accuracy": 15}, headers=raahi)
    mod = staff()
    row = c.get("/mod/sos", headers=mod).json()[0]
    assert row["date"] and len(row["time"]) == 8 and row["city"] == "gwalior" and row["status"] == "open"
    acc = row["account"]
    assert acc["name"] == "Meera" and acc["roles"] == ["raahi"] and acc["lastStamp"]["place"] == "sas-bahu"
    done = c.post(f"/mod/sos/{row['id']}", json={"note": "Called back, safe"}, headers=mod).json()
    assert done["status"] == "handled" and done["handledBy"] == "Aditya"


def test_communities_everyone_posts_with_their_badge():
    raahi = signin("Neha")
    p = c.post("/posts", json={"kind": "question", "text": "Is Sarafa busy on weekdays?", "community": "indore"}, headers=raahi).json()
    assert p["byRole"] == "raahi" and p["community"] == "indore"
    assert c.post("/posts", json={"as": "saarthi", "kind": "fact", "text": "Board checked"}, headers=raahi).status_code == 403  # not a saarthi
    assert c.post("/posts", json={"kind": "fact", "text": "Board checked"}, headers=raahi).status_code == 403  # facts are for saarthis
    s = staff()
    c.post("/posts", json={"as": "saarthi", "kind": "fact", "text": "Fee board checked today.", "community": "mp"}, headers=s)
    assert [x["byRole"] for x in c.get("/feed?community=mp").json()] == ["saarthi"]
    assert [x["id"] for x in c.get("/feed?community=indore").json()] == [p["id"]]
    c.post(f"/posts/{p['id']}/like", json={"on": True}, headers=s)  # a saarthi interacts with a raahi's post
    assert c.get("/feed?community=indore&sort=top").json()[0]["likes"] == 1



def test_first_week_entries_go_to_a_moderator_with_proof():
    s = staff("pranjal", "Pranjal")  # a new saarthi account: first week
    proof = c.post("/proofs", files={"file": ("board.jpg", bytes([255, 216, 255]) + b" fakejpeg", "image/jpeg")}, headers=s).json()["id"]
    assert c.post("/proofs", files={"file": ("x.txt", b"hi", "text/plain")}, headers=s).status_code == 415
    e = c.post("/facts", json={"placeId": "meghdoot-garden", "field": "Opening hours", "value": "6 am to 9 pm", "label": "locally verified", "proof": [proof]}, headers=s).json()
    assert e["route"] == "moderator" and e["status"] == "review"
    other = staff("priyangi", "Priyangi")
    assert e["id"] not in [v["id"] for v in c.get("/verify-queue", headers=other).json()]  # not for peers yet
    q = next(x for x in c.get("/mod/queues", headers=other).json() if x["kind"] == "fact")
    assert q["proof"] == [proof] and c.get(f"/proofs/{proof}", headers=other).status_code == 200
    c.post(f"/mod/queues/{q['id']}", json={"approve": True}, headers=other)
    mg = next(p for p in c.get("/cities/indore/data").json()["places"] if p["id"] == "meghdoot-garden")
    assert mg["units"][0]["hours"]["v"] == {"kind": "fixed", "open": "06:00", "close": "21:00"} and mg["units"][0]["hours"]["by"] == "Pranjal"
    todo = c.get("/saarthi/todo?city=indore", headers=s).json()
    assert todo and all("items" in t for t in todo)


def test_moderator_cannot_approve_own_first_week_entry():
    a = staff("aditya", "Aditya")
    c.post("/facts", json={"placeId": "gwalior-fort", "unitId": "fort-asi-museum", "field": "Last entry", "value": "4:30 pm", "label": "locally verified"}, headers=a)
    q = next(x for x in c.get("/mod/queues", headers=a).json() if x["kind"] == "fact")
    assert c.post(f"/mod/queues/{q['id']}", json={"approve": True}, headers=a).status_code == 403
    p = staff("priyangi", "Priyangi")
    c.post(f"/mod/queues/{q['id']}", json={"approve": True}, headers=p)
    fort = next(x for x in c.get("/cities/gwalior/data").json()["places"] if x["id"] == "gwalior-fort")
    units = {u["id"]: u for u in fort["units"]}
    assert units["fort-asi-museum"]["lastEntry"]["t"]["en"] == "4:30 pm"
    assert units["fort-gujari"]["lastEntry"]["t"]["en"] != "4:30 pm"  # only the part the saarthi named


def test_role_looks_need_the_role():
    raahi = signin("Kiran")
    assert c.put("/me/profile", json={"frame": "saarthi"}, headers=raahi).status_code == 403
    assert c.put("/me/profile", json={"frame": "gold"}, headers=raahi).status_code == 200
    s = staff()
    assert c.put("/me/profile", json={"frame": "saarthi", "banner": "control"}, headers=s).status_code == 200
    assert c.put("/me/profile", json={"frame": "saarthi-senior"}, headers=s).status_code == 403  # needs 25 approved entries
    uid = c.get("/me", headers=s).json()["id"]
    assert c.get(f"/saarthis/{uid}").json()["rank"] == "Saarthi"


def test_voice_and_video_proof():
    s = staff("pranjal", "Pranjal")
    v = c.post("/proofs", files={"file": ("note.webm", b"\x1aE\xdf\xa3 voice", "audio/webm")}, headers=s).json()
    assert v["type"] == "audio/webm"
    assert c.get(f"/proofs/{v['id']}", headers=s).headers["content-type"] == "audio/webm"
    assert c.post("/proofs", files={"file": ("clip.mp4", b"0" * 4_000_001, "video/mp4")}, headers=s).status_code == 413
    assert c.post("/proofs", files={"file": ("big.jpg", b"0" * 2_000_001, "image/jpeg")}, headers=s).status_code == 413


def test_shop_photos_are_public():
    owner = signin("Shop Owner")
    mod = staff()
    c.post("/me/apply-business", json={"name": "Photo Shop", "kind": "food", "city": "gwalior"}, headers=owner)
    q = next(q for q in c.get("/mod/queues", headers=mod).json() if q["kind"] == "business")
    c.post(f"/mod/queues/{q['id']}", json={"approve": True}, headers=mod)
    b = c.post("/business/me/photos", files={"file": ("shop.jpg", bytes([255, 216, 255]) + b" jpeg", "image/jpeg")}, headers=owner).json()
    mid = b["photos"][0]
    assert c.get(f"/media/{mid}").status_code == 200  # no sign-in needed
    assert c.get(f"/bazaar/{b['id']}").json()["photos"] == [mid]
    assert c.post("/business/me/photos", files={"file": ("x.jpg", b"jpeg", "image/jpeg")}, headers=signin("Visitor")).status_code == 403
    assert c.delete(f"/business/me/photos/{mid}", headers=owner).json()["photos"] == []
    assert c.get(f"/media/{mid}").status_code == 404


def test_renamed_places_are_caught():
    pack = {"places": [{"name": "Kanch Mandir", "custodian": "Kanch Mandir Trust"}]}
    assert main.renamed("Today: Central Museum and Treasure Island Grand Plaza.", pack) == ["Treasure Island Grand Plaza"]
    assert main.renamed("Phoenix Citadel Mall, then Ralamandal Wildlife Sanctuary. Call Kanch Mandir Trust.", pack) == []
    assert main.renamed("Sarafa Night Market Festival is fun.") == ["Sarafa Night Market Festival"]


def test_authors_delete_their_own_posts_and_comments():
    me, other = signin("Poster"), signin("Someone Else")
    p = c.post("/posts", json={"kind": "post", "text": "Lovely morning at the fort", "community": "gwalior"}, headers=me).json()
    cm = c.post(f"/posts/{p['id']}/comments", json={"text": "Agreed"}, headers=other).json()
    assert c.get("/feed?community=gwalior", headers=me).json()[0]["mine"] is True
    assert c.delete(f"/posts/{p['id']}", headers=other).status_code == 403
    assert c.delete(f"/comments/{cm['id']}", headers=me).status_code == 403
    assert c.delete(f"/comments/{cm['id']}", headers=other).json()["status"] == "removed"
    assert c.delete(f"/posts/{p['id']}", headers=me).json()["status"] == "removed"
    assert p["id"] not in [x["id"] for x in c.get("/feed?community=gwalior").json()]


def test_chat_crowded_place_suggests_others():
    mod = staff()
    c.put("/mod/twists", json={"crowded": ["fort-gujari"]}, headers=mod)
    seen = {}
    def writer(m):
        seen["facts"] = m[-1]["content"]
        return "Gwalior Fort is very crowded right now."
    main.WRITER = writer
    r = c.post("/chat", json={"text": "Gwalior Fort today?"}).json()
    c.put("/mod/twists", json={"crowded": []}, headers=mod)
    assert "Gujari Mahal museum: very crowded right now (moderator alert)" in seen["facts"] and "tryInstead" in seen["facts"]
    assert r["placeIds"][0] == "gwalior-fort" and r["followUps"]


def test_chat_follow_up_uses_last_places_and_travel():
    seen = {}
    def writer(m):
        seen["facts"] = m[-1]["content"]
        return "It is listed on the card below."
    main.WRITER = writer
    r = c.post("/chat", json={"text": "where is this time listed", "lastPlaces": ["tighra-dam"], "origin": {"name": "Railway station", "lat": 26.2176, "lng": 78.1828}}).json()
    assert r["placeIds"] == ["tighra-dam"]
    assert '"fromYou"' in seen["facts"] and '"byAuto"' in seen["facts"]


def test_chat_how_we_know():
    seen = {}
    main.WRITER = lambda m: seen.setdefault("f", m[-1]["content"]) and "Every fact has a label, a date and a source."
    c.post("/chat", json={"text": "where does the app get its information, is it verified?"})
    assert "howWeKnow" in seen["f"]


def test_grounding_decimal_and_rounded_km():
    from app import grounding
    facts = [{"fromYou": {"roadKm": 26.9, "byAuto": "90 min"}}]
    assert grounding.check("It is about 26.9\u202fkm, roughly 27 km by road.", facts)[0]
    assert not grounding.check("It is 35 km away.", facts)[0]


def test_saved_chats_belong_to_their_owner():
    me, other = signin("Aditya"), signin("Priyangi")
    msgs = [{"id": 1, "role": "user", "text": "Gwalior Fort", "at": 1}, {"id": 2, "role": "bot", "text": "**Gwalior Fort: You can go today.**", "at": 2}]
    assert c.put("/chats/c-abc123", json={"title": "Gwalior Fort", "msgs": msgs}, headers=me).status_code == 200
    rows = c.get("/chats", headers=me).json()
    assert rows[0]["id"] == "c-abc123" and rows[0]["count"] == 2
    assert c.get("/chats/c-abc123", headers=me).json()["msgs"][1]["text"].startswith("**Gwalior Fort")
    assert c.get("/chats/c-abc123", headers=other).status_code == 404
    assert c.put("/chats/c-abc123", json={"title": "x", "msgs": []}, headers=other).status_code == 403
    assert c.get("/chats").status_code == 401  # guests keep chats on the phone only


def test_chat_cards_only_for_places_the_reply_names(monkeypatch):
    monkeypatch.setenv("GROQ_KEY", "test")
    main.WRITER = lambda m: "**Teli ka Mandir is open today.**\n- **Hours:** sunrise to sunset\n*Add it to your roadmap?*"
    r = c.post("/chat", json={"text": "what is open today", "history": [], "lang": "en", "prompt": [], "city": "gwalior"}).json()
    assert r["ai"] and r["placeIds"] == ["teli-ka-mandir"]


def test_chat_prompt_says_it_only_remembers_this_chat():
    body = main.ChatIn(text="do you remember me", history=[], lang="en", prompt=[])
    assert "You have only these summaries" in main.system_prompt(body, "Gwalior")


def test_daily_cron_pulls_news_for_every_city(monkeypatch):
    pulled = []
    monkeypatch.setattr(main, "fetch_news", lambda city: pulled.append(city))
    assert c.get("/cron/news").json()["ok"] and sorted(pulled) == sorted(cities.CITY_IDS)
    monkeypatch.setenv("CRON_SECRET", "s3cret")
    assert c.get("/cron/news").status_code == 401
    assert c.get("/cron/news", headers={"Authorization": "Bearer s3cret"}).status_code == 200


def test_chat_travel_without_a_start_is_rejected(monkeypatch):
    monkeypatch.setenv("GROQ_KEY", "test")
    replies = iter(["**Teli ka Mandir is open.**\n- **Getting there:** 15 min by auto, about ₹30", "**Teli ka Mandir is open today.**"])
    main.WRITER = lambda m: next(replies)
    r = c.post("/chat", json={"text": "Tell me about Teli ka Mandir", "history": [], "lang": "en", "prompt": [], "city": "gwalior"}).json()
    assert r["ai"] and "by auto" not in r["text"]


def test_where_should_i_go_suggests_plannable_places_in_a_new_chat(monkeypatch):
    body = main.ChatIn(text="where should i go", history=[], lang="en", prompt=[], city="gwalior")
    pack, _ = main.retrieve(body)
    ids = [p["id"] for p in pack["places"]]
    assert ids and ids[0] == "teli-ka-mandir"  # Level 2 first
    d = main.data("gwalior")
    assert all(main.guard_ok(main.rules.get_place(d, i)) for i in ids)  # never an unflagged search hit
    assert "suggestedBecause" in pack


def test_short_new_question_is_not_a_follow_up():
    body = main.ChatIn(text="tell me something nice", history=[], lang="en", prompt=[], city="gwalior", lastPlaces=[])
    pack, _ = main.retrieve(body)
    assert "suggestedBecause" not in pack


def test_city_tip_and_place_note_go_through_review():
    a, b = staff("aditya", "Aditya"), staff("priyangi", "Priyangi")
    veteran("aditya", "priyangi")
    assert c.post("/facts", json={"placeId": "city", "city": "gwalior", "field": "Opening hours", "value": "x", "label": "locally verified"}, headers=a).status_code == 422
    c.post("/facts", json={"placeId": "city", "city": "gwalior", "field": "Getting around", "value": "Green CNG shared autos cost about ₹20-25 a person, cash only.", "label": "locally verified"}, headers=a)
    c.post("/facts", json={"placeId": "baija-taal", "field": "Things to do", "value": "Boating on the lake.", "label": "locally verified"}, headers=a)
    body = main.ChatIn(text="cheapest auto", history=[], lang="en", prompt=[], city="gwalior")
    assert "localTips" not in main.retrieve(body)[0]  # nothing live before review
    for v in c.get("/verify-queue", headers=b).json():
        c.post(f"/verify/{v['id']}", json={"ok": True}, headers=b)
    assert "CNG shared autos" in main.retrieve(body)[0]["localTips"][0]["tip"]
    bt = next(p for p in c.get("/cities/gwalior/data").json()["places"] if p["id"] == "baija-taal")
    assert bt["activities"][0]["s"] == "locally verified" and not main.guard_ok(bt)
    cities.import_city("gwalior")  # a redeploy keeps approved city tips
    assert "localTips" in main.retrieve(body)[0]


def test_saarthi_adds_proof_to_a_filed_entry():
    a, b = staff("aditya", "Aditya"), staff("priyangi", "Priyangi")
    e = c.post("/facts", json={"placeId": "moti-mahal", "field": "Good to know", "value": "10 minutes per section.", "label": "locally verified"}, headers=a).json()
    pid = c.post("/proofs", files={"file": ("t.jpg", b"\xff\xd8\xff" + b"0" * 100, "image/jpeg")}, headers=a).json()["id"]
    assert c.post(f"/facts/{e['id']}/proof", json={"proof": [pid]}, headers=b).status_code == 404  # not hers
    assert c.post(f"/facts/{e['id']}/proof", json={"proof": [pid]}, headers=a).json()["proof"] == [pid]
    assert main.get_db().queue.find_one({"_id": f"m-fact-{e['id']}"})["proof"] == [pid]
    assert next(x for x in c.get("/facts/mine", headers=a).json() if x["id"] == e["id"])["proofCount"] == 1


def test_news_keeps_local_visitor_news_only():
    keep = ["Rajwada to stay closed for restoration till November", "Indore: traffic diverted near Rajwada for Diwali procession"]
    drop = ["Lula bucks the rightward tide in Latin America", "Pune techie travels to Indore firm, realises he lost Rs 2.17 crore in stock scam"]
    assert not any(main.junk_news(t, "The Indian Express", "indore") for t in keep)
    assert all(main.junk_news(t, "The Indian Express", "indore") for t in drop)


# security pass, 28 Oct night (own scan before the ArgosX scans)
def test_new_voice_clips_are_rate_limited_per_visitor_but_cached_ones_are_free():
    main.SPEAKER = lambda t, lang: b"ID3fake"
    h = {"x-forwarded-for": "203.0.113.9"}
    for i in range(40):
        assert c.get("/tts", params={"text": f"Clip number {i}."}, headers=h).status_code == 200
    assert c.get("/tts", params={"text": "One more new clip."}, headers=h).status_code == 429
    assert c.get("/tts", params={"text": "Clip number 3."}, headers=h).status_code == 200  # cached, costs nothing
    assert c.get("/tts", params={"text": "Another network."}, headers={"x-forwarded-for": "198.51.100.4"}).status_code == 200


def test_guest_chat_is_rate_limited_by_network():
    os.environ["GROQ_KEY"] = "test"
    main.WRITER = lambda *a, **k: "Gwalior Fort is open today."
    try:
        h = {"x-forwarded-for": "203.0.113.10"}
        codes = [c.post("/chat", json={"text": "what is open today", "city": "gwalior"}, headers=h).status_code for _ in range(21)]
        assert codes[:20] == [200] * 20 and codes[20] == 429
    finally:
        os.environ.pop("GROQ_KEY", None)


def test_cors_only_allows_the_app():
    ok = c.options("/chat", headers={"Origin": "https://dishaara.vercel.app", "Access-Control-Request-Method": "POST"})
    bad = c.options("/chat", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"})
    assert ok.headers.get("access-control-allow-origin") == "https://dishaara.vercel.app"
    assert "access-control-allow-origin" not in bad.headers


def test_writer_uses_adaption_then_falls_back_to_groq(monkeypatch):
    monkeypatch.setenv("ADAPTION_API_KEY", "x")
    monkeypatch.setattr(main, "adaption", lambda m: "from adaption")
    monkeypatch.setattr(main, "groq", lambda m: "from groq")
    assert main.write([]) == "from adaption" and main.ENGINE["last"].startswith("Adaption")

    def down(m):
        raise RuntimeError("402 no credits")
    monkeypatch.setattr(main, "adaption", down)
    assert main.write([]) == "from groq" and main.ENGINE["last"].startswith("Groq")


def test_open_question_about_a_named_place_keeps_its_facts():
    pack, _ = main.retrieve(main.ChatIn(text="When does Gujari Mahal open?", city="gwalior", lang="en"))
    assert [p["id"] for p in pack["places"]][:1] == ["gwalior-fort"] and "openToday" not in pack
    pack, _ = main.retrieve(main.ChatIn(text="What is open today?", city="gwalior", lang="en"))
    assert pack.get("openToday")


def test_plan_ahead_questions_get_the_event_calendar():
    pack, _ = main.retrieve(main.ChatIn(text="Can I plan ahead for next month?", city="gwalior", lang="en"))
    assert "planAhead" in pack and "eventsThen" in pack
    pack, _ = main.retrieve(main.ChatIn(text="I am coming on 15 January, anything special?", city="gwalior", lang="en"))
    fair = pack["eventsThen"]["events"][0]
    assert fair["howSure"] == "a past pattern" and fair["when"].startswith("last held")
    assert "planAhead" not in main.retrieve(main.ChatIn(text="When does Gujari Mahal open?", city="gwalior", lang="en"))[0]


def test_saarthi_event_goes_to_the_city_calendar_after_approval():
    a, p = staff("aditya", "Aditya"), staff("priyangi", "Priyangi")
    veteran("aditya", "priyangi")
    ev = {"name": "Kite festival", "start": "2025-01-14", "end": "2025-01-14", "recurring": "yearly", "where": "Phool Bagh", "watch": "Municipal notice board"}
    assert c.post("/facts", json={"placeId": "city", "city": "gwalior", "field": "Event", "value": "Kites over Phool Bagh", "label": "locally verified"}, headers=a).status_code == 422
    e = c.post("/facts", json={"placeId": "city", "city": "gwalior", "field": "Event", "value": "Kites over Phool Bagh", "label": "locally verified", "event": ev}, headers=a).json()
    assert c.post(f"/verify/{e['id']}", json={"ok": True}, headers=p).status_code == 200
    d = main.data("gwalior")
    kite = next(x for x in d["events"] if x["name"]["en"] == "Kite festival")
    assert kite["from"] == "2025-01-14" and kite["src"] == "saarthi"
    hits = main.events_on(d, "2027-01-14")
    assert any(h["name"]["en"] == "Kite festival" and h["s"] == "historical pattern" for h in hits)
