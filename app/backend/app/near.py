"""Where is "near" in a question? (29 Oct 2026: "what is near Rajwada" worked, "around Gole ka Mandir", "north Indore"
and "near me" did not.) Finds the spot the raahi means, in this order:
  1. one of our places, by name
  2. one of the city's landmarks (station, fort...)
  3. "near me": the raahi's shared location or roadmap start
  4. a direction of the city ("north Indore"): a point 4 km from the centre that way
  5. any other name: looked up on OpenStreetMap (Nominatim, then Photon) inside the city, kept only when the result's
     name really matches the words asked (Photon once answered Teli ka Mandir for Gole ka Mandir), and cached in the
     database so each name is looked up once (OSM's usage policy: low volume, a real User-Agent).
Returns {"name", "coord", "kind"} or {"name", "missing": True} when a spot was asked for but not found, or None.
"""
from __future__ import annotations

import difflib
import math
import re

import httpx

from . import rules
from .db import get_db, now

NEAR_Q = re.compile(r"\bnear|nearby|close to|next to|around\b|aas ?paas|\bpaas\b|nazdeek|najdik|पास|आसपास|नज़दीक|नजदीक|"
                    r"\b(north|south|east|west|central|old)\b.{0,12}\b(gwalior|indore|city)\b|उत्तर|दक्षिण|पूर्व|पश्चिम", re.I)
ME = re.compile(r"\bnear me\b|around me|my location|where i am|\bmere paas\b|मेरे पास|मेरे आसपास|जहाँ मैं", re.I)
DIRS = {"north": (0, 1), "उत्तर": (0, 1), "south": (0, -1), "दक्षिण": (0, -1), "east": (1, 0), "पूर्व": (1, 0), "west": (-1, 0), "पश्चिम": (-1, 0),
        "central": (0, 0), "old": (0, 0)}
# The words around the spot: "near X", "around X", "close to X", "X ke paas", "X के पास".
PHRASES = [re.compile(r"\b(?:near|nearby|around|close to|next to|in|at)\s+(?:the\s+)?([^\W\d_][\w .'&-]{1,40}?)\s*(?:[?.!,]|$|\band\b|\bfor\b|\bwithin\b|\bthat\b|\bwhich\b)", re.I),
           re.compile(r"([^\W\d_][\w .'-]{1,30}?)\s+(?:ke\s+)?(?:paas|aas ?paas|nazdeek|najdik)\b", re.I),
           re.compile(r"([ऀ-ॿ][ऀ-ॿ ]{1,30}?)\s+(?:के|की)\s+(?:पास|आसपास|नज़दीक|नजदीक)")]
STOP = {"me", "here", "this", "that", "it", "there", "the city", "city", "gwalior", "indore", "ग्वालियर", "इंदौर", "today", "the area", "area", "my hotel", "hotel"}
UA = {"User-Agent": "Dishaara/1.0 (hackathon travel app; adictiveofficial@gmail.com)"}


def km(a, b) -> float:
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def words(t: str) -> list[str]:
    return [w for w in re.findall(r"[\wऀ-ॿ]+", t.lower().replace("़", "")) if len(w) > 2 and w not in rules.GENERIC and w not in {"ka", "ki", "ke", "road", "chowk", "square"}]


def same_name(asked: str, found: str) -> bool:
    """Every distinctive word asked has a close twin in the found name (spelling may differ a little)."""
    a, f = words(asked), words(found)
    return bool(a) and all(difflib.get_close_matches(w, f, n=1, cutoff=0.8) for w in a)


def phrase(text: str) -> str | None:
    for rx in PHRASES:
        for m in rx.finditer(text):
            p = re.sub(r"\s+(in|me|mein|of)\s+(gwalior|indore|ग्वालियर|इंदौर|the city)$", "", m.group(1).strip(" .,'-"), flags=re.I)  # "gopur in indore"
            if p and p.lower() not in STOP and not ME.search(p):
                return p[:40]
    return None


def lookup(name: str, city: dict) -> list[float] | None:
    """OpenStreetMap search inside the city box, checked against the name asked; cached."""
    db = get_db()
    key = f"{city['id']}:{name.lower()}"
    hit = db.geocache.find_one({"_id": key})
    if hit:
        return hit.get("coord")
    lat, lng = city["center"]
    box = f"{lng - 0.25},{lat + 0.25},{lng + 0.25},{lat - 0.25}"
    coord = None
    try:
        r = httpx.get("https://nominatim.openstreetmap.org/search", headers=UA, timeout=4,
                      params={"q": f"{name}, {city['name']['en']}", "format": "json", "limit": 3, "viewbox": box, "bounded": 1, "countrycodes": "in"})
        for x in r.json() if r.status_code == 200 else []:
            if same_name(name, x.get("name") or x.get("display_name", "").split(",")[0]):
                coord = [float(x["lat"]), float(x["lon"])]
                break
        if not coord:
            r = httpx.get("https://photon.komoot.io/api/", headers=UA, timeout=4, params={"q": f"{name} {city['name']['en']}", "lat": lat, "lon": lng, "limit": 3})
            for f in r.json().get("features", []) if r.status_code == 200 else []:
                c = f["geometry"]["coordinates"]
                if same_name(name, f["properties"].get("name") or "") and km([lat, lng], [c[1], c[0]]) < 30:
                    coord = [c[1], c[0]]
                    break
    except Exception:
        return None  # not cached: a network hiccup is not "no such place"
    db.geocache.replace_one({"_id": key}, {"_id": key, "coord": coord, "at": now()}, upsert=True)
    return coord


def anchor(text: str, d: dict, origin: dict | None) -> dict | None:
    if not NEAR_Q.search(text):
        return None
    hits = rules.search_places(d, text)
    if hits:
        p = rules.get_place(d, hits[0]["id"])
        return {"name": p["name"]["en"], "coord": p["units"][0]["coord"], "kind": "place", "id": p["id"]}
    low = text.lower()
    asked = phrase(text) or ""
    for l in d.get("landmarks", []):
        en, hi = l["name"]["en"].split(" (")[0], (l["name"].get("hi") or "").split(" (")[0]
        if en.lower() in low or (hi and hi in text) or (asked and (same_name(asked, en) or (hi and same_name(asked, hi)))):
            return {"name": l["name"]["en"], "coord": l["coord"], "kind": "landmark"}
    if ME.search(text):
        if origin and origin.get("lat") is not None:
            return {"name": f"your start point, {origin['name']}" if origin.get("name") else "your location", "coord": [origin["lat"], origin["lng"]], "kind": "me"}  # the app sends the roadmap start: say so
        return {"name": "your location", "missing": True, "kind": "me"}
    for w, (dx, dy) in DIRS.items():
        if re.search(rf"\b{w}\b" if w.isascii() else w, low):
            lat, lng = d["city"]["center"]
            return {"name": f"{w} {d['city']['name']['en']}", "coord": [lat + dy * 0.036, lng + dx * 0.039], "kind": "direction"}
    p = phrase(text)
    if not p:
        return None
    c = lookup(p, d["city"])
    return {"name": p, "coord": c, "kind": "osm"} if c else {"name": p, "missing": True, "kind": "osm"}
