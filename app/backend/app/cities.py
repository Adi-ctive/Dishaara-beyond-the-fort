"""City data in MongoDB: one `cities` document per city (sources, fares, landmarks) and one
`places` document per place. Imported from src/data/<city>.json, which stays the reviewed
source of truth. If the database has no data yet, or the file's dataVersion differs from the stored one,
the file is imported on first use.
"""
from __future__ import annotations

import copy
import json
import math
import os
import re
import time
from pathlib import Path

from . import rag, rules
from .db import get_db, now

DATA_DIR = Path(os.getenv("DATA_DIR", Path(__file__).resolve().parents[2] / "src" / "data"))
CITY_IDS = ["gwalior", "indore"]
NEAR_KM = 60  # a raahi within this distance of a city centre is in that city
_cache: dict[str, tuple[float, dict]] = {}
CACHE_S = 60


def km(a: list[float], b: list[float]) -> float:
    r = math.pi / 180
    d = math.sin((b[0] - a[0]) * r / 2) ** 2 + math.cos(a[0] * r) * math.cos(b[0] * r) * math.sin((b[1] - a[1]) * r / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(d))


def import_city(city: str) -> int:
    """Replaces one city's data with the file's, rebuilds its search chunks. Returns the place count."""
    raw = json.loads((DATA_DIR / f"{city}.json").read_text(encoding="utf-8"))
    db = get_db()
    places = raw.pop("places")
    db.cities.replace_one({"_id": city}, {"_id": city, **raw, "importedAt": now()}, upsert=True)
    db.places.delete_many({"city": city})
    if places:
        db.places.insert_many([{"_id": f"{city}:{p['id']}", "city": city, "order": i, **p} for i, p in enumerate(places)])
    # Saarthi entries approved on the server stay on top of the reviewed file, oldest first.
    for v in db.verify.find({"city": city, "status": "approved"}).sort("at", 1):
        apply_entry(v, rebuild=False)
    rag.build(city, {**raw, "places": [{k: x for k, x in p.items() if k not in ("_id", "city", "order")} for p in db.places.find({"city": city}).sort("order", 1)]})
    _cache.pop(city, None)
    return len(places)


# Saarthi form fields -> where they go in the place record, and the fact class.
ENTRY_FIELDS = {
    "Opening hours": ("unit", "hours", "hours"), "Weekly closing": ("unit", "weeklyClosed", "hours"),
    "Ticket prices": ("unit", "fees", "fees"), "Last entry": ("unit", "lastEntry", "hours"), "Payment": ("unit", "payment", "fees"),
    "Accessibility": ("place", "accessibility", "rules"), "Facilities": ("place", "facilities", "hours"),
    "Dress rules": ("dress", "dress", "rules"), "Do and don't": ("rule", "courtesy", "rules"), "Safety note": ("rule", "safety", "rules"),
    "Good to know": ("note", "notes", "status"), "Things to do": ("activity", "activities", "status"),
}
# Entries about the whole city, filed under the place id "city": getting around, notices that affect many places.
CITY_FIELDS = {"Getting around": ("transport", "fare"), "City notice": ("station", "status")}
DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]


def _value(field: str, text: str):
    """Structured value when the saarthi's text is clear enough for the planner, else None (text only)."""
    t = text.lower()
    if field == "hours":
        m = re.findall(r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)?", t)
        if len(m) == 2:
            out = []
            for i, (h, mi, ap) in enumerate(m):
                h = int(h) % 12 + (12 if ap == "pm" or (not ap and i == 1 and int(h) < 9) else 0)
                out.append(f"{h:02d}:{mi or '00'}")
            if out[0] < out[1]:
                return {"kind": "fixed", "open": out[0], "close": out[1]}
        if "sunrise" in t and "sunset" in t:
            return {"kind": "sun"}
        return None
    if field == "weeklyClosed":
        if re.search(r"\b(no|none|open (every|all) day|daily)\b", t):
            return []
        days = [i for i, d in enumerate(DAYS) if re.search(rf"\b{d}", t)]
        return days or None
    return None


# How strong each label is. A weaker new fact never silently replaces a stronger one (29 Oct).
STRENGTH = {"officially confirmed": 6, "locally verified": 5, "recently reported": 4, "estimated": 3, "historical pattern": 2,
            "unverified": 1, "potentially outdated": 0, "conflicting": 0}


def supersede(old: dict | None, new: dict) -> dict:
    """The fact that takes the old one's place, with the old one kept as history (alt, newest first, at most 6).
    If the old fact was stronger and says something else, both stand: the fact becomes "conflicting" (never one number
    when sources disagree), keeping the old structured value for the planner, which then asks to confirm first."""
    if not old or old.get("v") is None:
        return new
    was = {k: old[k] for k in ("t", "s", "src", "ver", "by") if old.get(k) is not None}
    hist = [was] + list(old.get("alt") or [])
    same = (old.get("t") or {}).get("en", "").strip().lower() == new["t"]["en"].strip().lower()
    if not same and STRENGTH.get(old.get("s"), 0) > STRENGTH.get(new["s"], 0):
        o, n = (old.get("t") or {}), new["t"]
        both = lambda lang: f"{o.get(lang) or o.get('en')} ({old.get('s')}, {old.get('ver')}); a saarthi reported: {n[lang]} ({new['s']}, {new.get('ver')})"
        return {**old, "s": "conflicting", "was": old.get("s"), "t": {"en": both("en"), "hi": both("hi")},
                "why": {"en": "Sources disagree: confirm at the place.", "hi": "स्रोत अलग-अलग: जगह पर पुष्टि करें।"},
                "alt": [{k: new[k] for k in ("t", "s", "src", "ver", "by") if new.get(k) is not None}] + hist[:5]}
    return {**new, "alt": hist[:6]}


def apply_entry(v: dict, rebuild: bool = True) -> bool:
    """Writes an approved saarthi entry into the place record: dated, labelled, credited to the saarthi."""
    db = get_db()
    if v.get("field") == "Event" and v.get("event"):
        # A saarthi's event joins the city calendar; past events stay as history for next year's guess.
        ev = v["event"]
        item = {"id": f"saarthi-{v['_id']}", "name": {"en": ev["name"], "hi": ev["name"]}, "about": {"en": v["value"], "hi": v["value"]},
                "where": {"en": ev.get("where") or "", "hi": ev.get("where") or ""}, "from": ev["start"], "to": ev.get("end") or ev["start"],
                "recurring": ev.get("recurring", "yearly"), "s": v["label"], "src": "saarthi", "ver": v.get("date"), "by": v.get("by", "Saarthi"),
                "entry": v.get("_id"), **({"place": v["place"]} if v.get("place") != "city" else {}),
                **({"watch": {"en": ev["watch"], "hi": ev["watch"]}} if ev.get("watch") else {})}
        db.cities.update_one({"_id": v["city"]}, {"$pull": {"events": {"entry": v.get("_id")}}})
        db.cities.update_one({"_id": v["city"]}, {"$push": {"events": item}})
        _cache.pop(v["city"], None)
        return True
    if v.get("place") == "city":
        topic = CITY_FIELDS.get(v.get("field"))
        if not topic:
            return False
        tip = {"topic": topic[0], "t": {"en": v["value"], "hi": v["value"]}, "s": v["label"], "src": "saarthi", "by": v.get("by", "Saarthi"), "ver": v.get("date"), "cls": topic[1], "entry": v.get("_id")}
        db.cities.update_one({"_id": v["city"]}, {"$pull": {"tips": {"entry": v.get("_id")}}})
        db.cities.update_one({"_id": v["city"]}, {"$push": {"tips": tip}})
        _cache.pop(v["city"], None)
        return True
    where = ENTRY_FIELDS.get(v.get("field"))
    doc = db.places.find_one({"_id": f"{v['city']}:{v['place']}"})
    if not where or not doc:
        return False
    kind, key, cls = where
    fact = {"t": {"en": v["value"], "hi": v["value"]}, "s": v["label"], "src": "saarthi", "by": v.get("by", "Saarthi"), "ver": v.get("date"), "cls": cls}
    if kind == "unit":
        fact["v"] = _value(key, v["value"])
        for u in doc["units"]:
            if not v.get("unit") or u["id"] == v["unit"]:  # only the part the saarthi named
                u[key] = supersede(u.get(key), fact)
    elif kind == "place":
        fact["v"] = True
        doc[key] = fact
    elif kind == "dress":
        if not doc.get("sensitive"):
            return False
        doc["sensitive"]["dress"] = {**fact, "v": True}
    elif kind == "note":
        doc["notes"] = [n for n in doc.get("notes", []) if (n.get("t") or {}).get("en") != v["value"]] + [{**fact, "v": True}]
    elif kind == "activity":
        acts = [a for a in doc.get("activities", []) if (a.get("t") or {}).get("en") != v["value"]]
        doc["activities"] = acts + [{**fact, "v": True, "id": f"s-{v.get('_id', len(acts))}", "name": {"en": v["value"].split(".")[0][:40], "hi": v["value"].split(".")[0][:40]}, "kind": "other", "price": None}]
    else:
        doc["rules"] = [r for r in doc.get("rules", []) if (r.get("t") or {}).get("en") != v["value"]] + [{**fact, "v": True, "kind": key}]
    db.places.replace_one({"_id": doc["_id"]}, doc)
    db.cities.update_one({"_id": v["city"]}, {"$set": {"sources.saarthi": {"name": "Checked on site by a Dishaara saarthi, verified by a second saarthi", "type": "local", "evidence": "Saarthi entry with proof", "date": v.get("date")}}})
    _cache.pop(v["city"], None)
    if rebuild:
        d = db.cities.find_one({"_id": v["city"]}) or {}
        rag.build(v["city"], {**d, "places": [{k: x for k, x in p.items() if k not in ("_id", "city", "order")} for p in db.places.find({"city": v["city"]}).sort("order", 1)]})
    return True


def file_version(city: str) -> str | None:
    return json.loads((DATA_DIR / f"{city}.json").read_text(encoding="utf-8")).get("city", {}).get("dataVersion")


def city(city: str, as_of: str) -> dict:
    """Full data for a city, after the freshness job, in the same shape as the seed file."""
    hit = _cache.get(city)
    if not hit or time.time() - hit[0] > CACHE_S:
        db = get_db()
        doc = db.cities.find_one({"_id": city})
        if (DATA_DIR / f"{city}.json").exists() and (not doc or doc.get("city", {}).get("dataVersion") != file_version(city)):
            # First use, or a deploy carried a newer reviewed file: the file wins.
            try:
                import_city(city)
            except Exception:  # another instance importing at the same moment
                if not doc:
                    raise
            doc = db.cities.find_one({"_id": city})
        if not doc:
            raise KeyError(city)
        doc = {k: v for k, v in doc.items() if k not in ("_id", "importedAt")}
        doc["places"] = [{k: v for k, v in p.items() if k not in ("_id", "city", "order")}
                         for p in db.places.find({"city": city}).sort("order", 1)]
        hit = (time.time(), doc)
        _cache[city] = hit
    return rules.freshen(copy.deepcopy(hit[1]), as_of)


def available() -> list[str]:
    return [c for c in CITY_IDS if (DATA_DIR / f"{c}.json").exists() or get_db().cities.find_one({"_id": c}, {"_id": 1})]


def nearest(lat: float, lng: float, as_of: str) -> dict | None:
    best = None
    for c in available():
        centre = city(c, as_of)["city"]["center"]
        d = km([lat, lng], centre)
        if d <= NEAR_KM and (not best or d < best[1]):
            best = (c, d)
    return {"city": best[0], "km": round(best[1], 1)} if best else None


def find_place(place_id: str, as_of: str) -> tuple[str, dict] | None:
    for c in available():
        p = rules.get_place(city(c, as_of), place_id)
        if p:
            return c, p
    return None
