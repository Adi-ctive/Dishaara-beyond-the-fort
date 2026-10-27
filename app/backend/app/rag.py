"""Retrieval for the chat (RAG). Every checked fact becomes a short sentence (a chunk) with its
place, label and date. A question finds the best chunks: Atlas Search when the cluster has the
`chunks` search index, otherwise a simple word-overlap score here (the data is small).
The chunks only choose which places go into the facts pack. The model still sees only the
structured, labelled facts of those places, never free text it could misquote.
"""
from __future__ import annotations

import math
import os
import re

from .db import get_db

STOP = {"the", "a", "an", "is", "are", "to", "of", "in", "on", "at", "for", "and", "or", "what", "where", "when", "how",
        "can", "i", "me", "my", "do", "does", "it", "there", "today", "with", "about", "near", "which", "best", "go", "visit",
        "क्या", "है", "हैं", "में", "का", "की", "के", "को", "से", "और", "कहाँ", "कब", "कैसे", "आज", "पर"}


# Interest tags in both languages, and everyday words people use for them.
TAG_WORDS = {
    "architecture": ("architecture carving carvings building", "वास्तुकला नक्काशी इमारत"),
    "museums": ("museum museums gallery collection", "संग्रहालय म्यूज़ियम"),
    "music": ("music musician singer song classical", "संगीत संगीतकार गायक गाना"),
    "royal": ("royal king palace scindia", "शाही राजा महल सिंधिया"),
    "spiritual": ("spiritual prayer worship religious shrine", "आध्यात्मिक प्रार्थना पूजा धार्मिक"),
    "temples": ("temple temples mandir hindu", "मंदिर हिंदू"),
    "food": ("food eat eating street snacks", "खाना खाने नाश्ता"),
    "markets": ("market bazaar shopping shop", "बाज़ार बाजार खरीदारी दुकान"),
    "nature": ("garden park lake nature waterfall dam forest picnic trek wildlife zoo", "बगीचा पार्क झील प्रकृति झरना बाँध जंगल पिकनिक चिड़ियाघर"),
    "modern": ("modern mall shopping cinema city hangout", "आधुनिक मॉल शॉपिंग सिनेमा"),
    "activities": ("activity activities adventure show experience trek fun things to do", "गतिविधि रोमांच शो अनुभव मज़ा"),
}
# Everyday words for each kind of activity.
ACTIVITY_WORDS = {
    "boating": ("boat boating boats boat ride paddle speed boat lake water", "नाव नौका नौकायन बोटिंग झील पानी"),
    "show": ("show light sound evening entertainment", "शो लाइट साउंड शाम मनोरंजन"),
    "ride": ("ride rides amusement fun kids", "सवारी झूले मनोरंजन मज़ा बच्चे"),
    "safari": ("safari wildlife animals jungle", "सफ़ारी वन्यजीव जानवर जंगल"),
    "trek": ("trek trekking hike hiking walk climb", "ट्रेक पैदल चढ़ाई"),
    "water": ("water park swimming slides splash", "वॉटर पार्क तैराकी स्लाइड"),
    "game": ("games gaming bowling arcade fun", "खेल गेमिंग बॉलिंग आर्केड"),
    "food": ("food eat eating tasting", "खाना खाने स्वाद"),
    "shopping": ("shopping shop buy souvenirs", "खरीदारी दुकान स्मृति चिह्न"),
    "other": ("activity things to do fun", "गतिविधि करने लायक मज़ा"),
}
# Words for a kind of place that its name alone does not say.
KIND_WORDS = {"gurudwara": ("sikh", "सिख"), "cenotaph": ("memorial chhatri tomb", "स्मारक छत्री समाधि"), "food street": ("eat snacks street food", "खाना नाश्ता"), "tomb": ("grave mausoleum", "कब्र मकबरा समाधि"), "मकबरा": ("grave", "कब्र")}


def words(text: str) -> list[str]:
    return [w for w in re.findall(r"[a-z0-9ऀ-ॿ]+", text.lower()) if w not in STOP and len(w) > 1]


def tx(v, lang: str) -> str:
    if isinstance(v, dict):
        return v.get(lang) or v.get("en") or ""
    return str(v or "")


def sentences(p: dict, lang: str) -> list[tuple[str, str]]:
    """(kind, sentence) pairs for one place. Disputed values are never written out."""
    name = p["name"][lang]
    out = [("name", f"{name}. {tx(p.get('type'), lang)}.")]
    s = p.get("summary") or {}
    if s.get("t") or s.get("v"):
        out.append(("summary", f"{name}: {tx(s.get('t') or s.get('v'), lang)}"))
    for r in p.get("rules", []):
        if r.get("t") or r.get("v"):
            out.append(("rule", f"{name} rule: {tx(r.get('t') or r.get('v'), lang)}"))
    for t in p.get("tags", []) or []:
        en, hi = TAG_WORDS.get(t, (t, t))
        out.append(("tag", f"{name}: {en if lang == 'en' else hi}"))
    blob = (p["name"]["en"] + " " + tx(p.get("type"), "en")).lower() + p["name"]["hi"] + tx(p.get("type"), "hi")
    for k, (en, hi) in KIND_WORDS.items():
        if k in blob:
            out.append(("tag", f"{name}: {en if lang == 'en' else hi}"))
    for u in p.get("units", []):
        if u["name"][lang] != name:
            out.append(("section", f"{name} has {u['name'][lang]}."))
    # Things to do there (boating, shows, rides): so "where can I go boating" finds the place.
    for a in p.get("activities", []) or []:
        kind = ACTIVITY_WORDS.get(a.get("kind", ""), ("", ""))[0 if lang == "en" else 1]
        out.append(("activity", f"{name}: {tx(a.get('name'), lang)}. {kind}. {tx(a.get('t'), lang)}"))
    # Questions people ask, answered from the facts: the question text matches how visitors ask.
    for f in p.get("faqs", []) or []:
        out.append(("faq", f"{name}: {tx(f.get('q'), lang)} {tx(f.get('a'), lang)}"))
    return out


def build(city: str, data: dict) -> int:
    db = get_db()
    db.chunks.delete_many({"city": city})
    docs = [{"city": city, "place": p["id"], "lang": lang, "kind": k, "text": t}
            for p in data["places"] for lang in ("en", "hi") for k, t in sentences(p, lang)]
    if docs:
        db.chunks.insert_many(docs)
    return len(docs)


def _atlas(city: str, query: str, lang: str, k: int) -> list[dict] | None:
    if not os.getenv("MONGODB_URI") or os.getenv("ATLAS_SEARCH", "1") == "0":
        return None
    try:
        return list(get_db().chunks.aggregate([
            {"$search": {"index": "chunks", "compound": {
                "must": [{"text": {"query": query, "path": "text", "fuzzy": {"maxEdits": 1}}}],
                "filter": [{"equals": {"path": "city", "value": city}}, {"equals": {"path": "lang", "value": lang}}]}}},
            {"$limit": k}, {"$project": {"_id": 0, "place": 1, "text": 1, "kind": 1}}]))
    except Exception:
        return None  # no search index yet: fall back


CITY_WORDS = {"gwalior", "indore", "ग्वालियर", "इंदौर", "want", "like", "visit", "see", "places", "place", "city", "चाहता", "चाहती", "जाना", "घूमना"}


def search(city: str, query: str, lang: str = "en", k: int = 6) -> list[dict]:
    # Results are already limited to the city, so its own name (on every place) and filler words only blur the ranking.
    focused = " ".join(w for w in words(query) if w not in CITY_WORDS) or query
    hits = _atlas(city, focused, lang, k)
    if hits is not None:
        return hits
    q = set(words(focused))
    if not q:
        return []
    chunks = list(get_db().chunks.find({"city": city, "lang": lang}, {"_id": 0}))
    sets = [set(words(c["text"])) for c in chunks]
    # Rare words decide (boating), words on every place barely count (the city's own name).
    places_with: dict[str, set] = {}
    for c, w in zip(chunks, sets):
        for x in w & q:
            places_with.setdefault(x, set()).add(c["place"])
    n = len({c["place"] for c in chunks}) or 1
    idf = {x: math.log(1 + n / len(ps)) for x, ps in places_with.items()}
    scored = []
    for c, w in zip(chunks, sets):
        # Exact words count fully, shared beginnings of longer words (temple / temples) count half.
        score = sum(idf.get(x, 0) for x in q & w) + 0.5 * sum(1 for a in q for b in w if a != b and min(len(a), len(b)) >= 5 and (a.startswith(b) or b.startswith(a)))
        if score:
            scored.append((score + (0.5 if c["kind"] == "name" else 0), c))
    scored.sort(key=lambda x: -x[0])
    return [c for _, c in scored[:k]]


def places_for(city: str, query: str, lang: str, k: int = 3) -> list[str]:
    seen: list[str] = []
    for c in search(city, query, lang, k * 3):
        if c["place"] not in seen:
            seen.append(c["place"])
    return seen[:k]
