"""Tool services the assistant may call (FR-AI-02). Facts come only from the seed file.

check_feasibility mirrors web/src/core/feasibility.ts (SRS §6.4). Verdicts are computed here,
never by the LLM (FR-FC-02).
"""
from __future__ import annotations

import json
import math
import os
from datetime import date as Date, timedelta
from pathlib import Path

DATA_PATH = Path(os.getenv("DATA_PATH", Path(__file__).resolve().parents[2] / "src" / "data" / "gwalior.json"))
CHECK_DAYS = {"status": 7, "fare": 30, "hours": 90, "fees": 90, "rules": 180, "history": 365}
STRONG = {"officially confirmed", "locally verified"}
AGES = {"officially confirmed", "locally verified", "recently reported", "estimated", "historical pattern"}
TICKET_BUFFER = 10
COVERED = {"gwalior", "ग्वालियर", "indore", "इंदौर"}
KNOWN_CITIES = ["agra", "delhi", "jaipur", "orchha", "bhopal", "mumbai", "goa", "varanasi", "udaipur", "jhansi",
                "khajuraho", "kolkata", "chennai", "bengaluru", "bangalore", "hyderabad", "pune", "lucknow", "आगरा", "दिल्ली",
                "जयपुर", "ओरछा", "भोपाल", "मुंबई", "गोवा", "वाराणसी", "उदयपुर", "झांसी", "खजुराहो"]


def freshen(data: dict, as_of: str | None = None) -> dict:
    """The daily freshness job (FR-VF-05): a fact past its check-by date becomes potentially outdated."""
    as_of = as_of or Date.today().isoformat()

    def walk(n):
        if isinstance(n, list):
            for x in n:
                walk(x)
        elif isinstance(n, dict):
            if isinstance(n.get("cls"), str) and isinstance(n.get("s"), str) and n.get("ver"):
                cb = (Date.fromisoformat(n["ver"]) + timedelta(days=CHECK_DAYS[n["cls"]])).isoformat()
                if n["s"] in AGES and cb < as_of:
                    n["was"], n["s"] = n["s"], "potentially outdated"
            for k, v in n.items():
                if k != "alt":
                    walk(v)

    walk(data["places"])
    walk(data.get("fares", []))
    return data


def load(as_of: str | None = None) -> dict:
    """Gwalior straight from the seed file (tests and tools). The API reads cities from MongoDB."""
    return freshen(json.loads(DATA_PATH.read_text(encoding="utf-8")), as_of)


def uncovered_city(text: str) -> str | None:
    s = text.lower()
    for c in KNOWN_CITIES:
        i = s.find(c)
        if i >= 0 and (i == 0 or not s[i - 1].isalpha()) and (i + len(c) == len(s) or not s[i + len(c)].isalpha()):
            return c
    return None


# Words that name a kind of place, not a place: matching on them alone picked the wrong place (29 Oct test set:
# "सराफ़ा बाज़ार, ग्वालियर" matched Gwalior Fort through "ग्वालियर", "Gohad Fort" matched Gwalior Fort through "fort").
GENERIC = {"tomb", "temple", "temples", "palace", "mahal", "gwalior", "indore", "mandir", "bagh", "fort", "garden", "gardens", "lake", "museum",
           "market", "bazaar", "bazar", "park", "the", "and", "with", "dam", "zoo", "hall", "group", "falls", "waterfall", "memorial", "city",
           "ग्वालियर", "इंदौर", "मंदिर", "महल", "किला", "क़िला", "बाग", "बाज़ार", "बाजार", "मकबरा", "संग्रहालय", "उद्यान", "झील", "माता", "समूह", "मेला"}


def _norm(t: str) -> str:
    return t.lower().replace("़", "").replace("(", " ").replace(")", " ").replace(",", " ")


def search_places(data: dict, query: str) -> list[dict]:
    """Places named in the question, best match first: a full name beats distinctive words, which beat a close spelling."""
    import difflib
    q = _norm(query)
    qw = [w for w in q.split() if len(w) > 3]
    scored = []
    for p in data["places"]:
        names = [_norm(p["name"]["en"]), _norm(p["name"]["hi"]), *(_norm(u["name"]["en"]) for u in p["units"])]
        words = {w for n in names for w in n.split() if len(w) > 3 and w not in GENERIC}
        score = 10 * sum(1 for n in names if n.strip() and n.strip() in q)
        score += 3 * sum(1 for w in words if w in q)
        # Every word of a name present, endings allowed to change ("ग्वालियर किले" for "ग्वालियर किला", "forts" for "fort").
        stem = lambda w: w[:max(3, len(w) - 1)]
        score += 8 * sum(1 for n in names if len(n.split()) > 1 and all(any(x.startswith(stem(w)) for x in q.split()) for w in n.split()))
        if not score:
            score = 2 * sum(1 for w in words if len(w) >= 5 and difflib.get_close_matches(w, qw, n=1, cutoff=0.8))
        if score:
            scored.append((score, p))
    scored.sort(key=lambda x: -x[0])
    return [{"id": p["id"], "name": p["name"], "guardrail": p["guardrail"]["status"]} for _, p in scored]  # Decision 25


def get_place(data: dict, place_id: str) -> dict | None:
    return next((p for p in data["places"] if p["id"] == place_id), None)


def _sun(day: str, lat: float, lng: float, tz: float) -> tuple[int, int]:
    rad = math.pi / 180
    d = Date.fromisoformat(day)
    J = (d - Date(1970, 1, 1)).days + 0.5 + 2440587.5
    n = round(J - 2451545 + 0.0008)
    Js = n - lng / 360
    M = (357.5291 + 0.98560028 * Js) % 360
    C = 1.9148 * math.sin(M * rad) + 0.02 * math.sin(2 * M * rad) + 0.0003 * math.sin(3 * M * rad)
    L = (M + C + 180 + 102.9372) % 360
    Jt = 2451545 + Js + 0.0053 * math.sin(M * rad) - 0.0069 * math.sin(2 * L * rad)
    dec = math.asin(math.sin(L * rad) * math.sin(23.44 * rad))
    H = math.acos((math.sin(-0.833 * rad) - math.sin(lat * rad) * math.sin(dec)) / (math.cos(lat * rad) * math.cos(dec))) / rad
    local = lambda j: round(((j - 2440587.5) % 1) * 1440 + tz * 60) % 1440
    return local(Jt - H / 360), local(Jt + H / 360)


def _window(data: dict, u: dict, day: str):
    h = u["hours"].get("v")
    if not h:
        return None
    if h["kind"] == "sun":
        return _sun(day, u["coord"][0], u["coord"][1], data["city"]["tz"])
    hm = lambda s: int(s[:2]) * 60 + int(s[3:])
    return hm(h["open"]), hm(h["close"])


def _visit(u: dict) -> int:
    lo = u["minVisit"].get("v") or 30
    hi = u["minVisit"].get("rec") or lo
    return round((lo + hi) / 10) * 5


def check_feasibility(data: dict, unit: dict, day: str, arrival: int | None = None) -> dict:
    dow = (Date.fromisoformat(day).weekday() + 1) % 7  # 0 = Sunday
    w = _window(data, unit, day)
    visit = _visit(unit)
    no, confirm, prec = [], [], []
    wc = unit["weeklyClosed"]
    closed = wc.get("v") if isinstance(wc.get("v"), list) else []
    if wc.get("s") == "conflicting":
        alt = [d for a in wc.get("alt", []) for d in (a.get("v") or [])]
        if dow in closed or dow in alt:
            confirm.append("closing day conflicts between sources")
    elif dow in closed:
        no.append("weekly closure on this day")
    if w:
        latest = w[1] - TICKET_BUFFER - visit
        if latest < w[0]:
            no.append("open hours shorter than the minimum visit")
        elif arrival is not None and arrival > latest:
            no.append(f"arrive by {latest // 60:02d}:{latest % 60:02d} to finish before closing")
        elif arrival is not None and latest - arrival <= 30:
            prec.append("arrival within 30 minutes of the latest entry")
    for field in ("hours", "weeklyClosed", "lastEntry"):
        f = unit[field]
        if f.get("v") is None:
            confirm.append(f"{field} unavailable")
        elif f.get("s") == "conflicting":
            if field != "weeklyClosed":
                confirm.append(f"{field} conflicting")
        elif f.get("s") not in STRONG:
            confirm.append(f"{field} is {f.get('s')}")
    if no:
        return {"verdict": "not feasible", "reasons": no}
    if confirm:
        return {"verdict": "needs confirmation", "reasons": confirm}
    if prec:
        return {"verdict": "possible with precautions", "reasons": prec}
    return {"verdict": "good to go", "reasons": ["open, enough time, decisive facts officially confirmed"]}
