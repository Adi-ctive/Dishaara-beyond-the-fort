"""Apply the 25 Oct 2026 web research ledger to the app's city data.

Reads 07_round2/data_research/ledger.jsonl and writes src/data/gwalior.json and indore.json.
  python scripts/apply_research.py          apply and print what changed or was skipped
  python scripts/apply_research.py --dry    print only

Rules (from the research session, see 07_round2/data_research/PROGRESS.md):
- officially confirmed / recently reported: the fact with its sources.
- conflicting: s "conflicting", every version kept in alt, the value only when the ledger has one.
- unverified: kept with that label, so the planner asks to confirm first.
- unavailable: v null with the reason in why.
- A finding never replaces a stronger fact (official facts are never downgraded).
- Guardrail levels (Decision 25) are never touched. site-check findings go to the teammate sheet only.
Running it twice gives the same result.
"""
import json
import re
import sys
from datetime import date
from pathlib import Path

APP = Path(__file__).resolve().parent.parent
LEDGER = APP.parent / "07_round2" / "data_research" / "ledger.jsonl"
CITIES = ["gwalior", "indore"]

RANK = {"officially confirmed": 4, "locally verified": 4, "recently reported": 3, "conflicting": 2,
        "unverified": 1, "potentially outdated": 1, "unavailable": 0}
CLS = {"hours": "hours", "weeklyClosed": "hours", "lastEntry": "hours", "fees": "fees", "payment": "fees"}
CHECK = {"en": "Check at the place before you go.", "hi": "जाने से पहले स्थल पर पुष्टि करें।"}
EVERYONE = {"en": "Everyone", "hi": "सभी"}
# Fact 2 (Priyangi, closed desk record): Jai Vilas keeps its conflicting hours, no definitive price and her advisory.
# New Jai Vilas findings go to the teammate sheet for the counter visit instead.
KEEP = {("gwalior", "jai-vilas", f) for f in ("hours", "fees", "weeklyClosed")}


def rank(f):
    if not f or (f.get("v") is None and not f.get("s")):
        return 0
    return RANK.get(f.get("s"), 0)


def iso(d):
    return d if isinstance(d, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", d) else None


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:40]


def fixed(open_, close, brk=None):
    # The planner works within one day: a close at or after midnight is read as 23:59.
    if close <= open_:
        close = "23:59"
    out = {"kind": "fixed", "open": open_, "close": close}
    if brk:
        out["brk"] = brk
    return out


def season_now(seasons):
    m = date.today().month
    for s in seasons:
        a, b = s["months"].split("-")
        names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        lo, hi = names.index(a) + 1, names.index(b) + 1
        if (lo <= m <= hi) if lo <= hi else (m >= lo or m <= hi):
            return s
    return seasons[0]


def norm_value(field, v, unit):
    """Turn the ledger's value into the app's shape (types.ts), or None."""
    if v is None:
        return None
    if field == "hours":
        if isinstance(v, dict) and "kind" in v:
            return v if v["kind"] == "sun" else fixed(v["open"], v["close"], v.get("brk"))
        if isinstance(v, dict) and "open" in v:
            return fixed(v["open"], v["close"], v.get("brk"))
        if isinstance(v, dict) and "seasons" in v:
            s = season_now(v["seasons"])
            return fixed(s["hi"].split("-")[0], s["en"].split("-")[1])
        return None
    if field == "weeklyClosed":
        if v == "none":
            return []
        return v if isinstance(v, list) else None
    if field == "fees":
        ticket = unit.get("ticket") or "ticket"
        if isinstance(v, dict) and "rows" in v:
            return {**v, "ticket": ticket}
        if v == 0:
            return {"ticket": ticket, "rows": [{"who": w, "label": EVERYONE, "any": 0} for w in ("indian", "foreign", "child")]}
        if isinstance(v, dict) and "indianAdult" in v:
            return {"ticket": ticket, "rows": [
                {"who": "indian", "label": {"en": "Indian adult", "hi": "भारतीय वयस्क"}, "any": v["indianAdult"]},
                {"who": "foreign", "label": {"en": "Foreign adult", "hi": "विदेशी वयस्क"}, "any": v["foreignAdult"]},
                {"who": "child", "label": {"en": "Indian child 5–12", "hi": "भारतीय बच्चा 5–12"}, "any": v["indianChild"]}]}
        if isinstance(v, dict) and "indian" in v:
            child = 0 if v.get("under15") == 0 else None
            child_label = {"en": "Children up to 15", "hi": "15 वर्ष तक के बच्चे"} if child == 0 else {"en": "Children", "hi": "बच्चे"}
            return {"ticket": ticket, "rows": [
                {"who": "indian", "label": {"en": "Indian", "hi": "भारतीय"}, "any": v["indian"]},
                {"who": "foreign", "label": {"en": "Foreign", "hi": "विदेशी"}, "any": v["foreign"]},
                {"who": "child", "label": child_label, "any": child}]}
        return None
    return v


def add_sources(data, x):
    """Register the finding's sources in data.sources and return the key for its src."""
    srcs = data["sources"]
    links = [s for s in x.get("sources", []) if s.get("name")]
    key = x.get("src")
    if key and key in srcs:
        if links:
            srcs[key].setdefault("links", [])
            for s in links:
                if s not in srcs[key]["links"]:
                    srcs[key]["links"].append(s)
        return key
    if not links:
        return None
    key = key or f"web-{x['place']}-{x['field']}".lower()
    dates = [iso(s.get("date")) for s in links if iso(s.get("date"))]
    srcs[key] = {
        "name": "; ".join(s["name"] for s in links[:3]) + (f" and {len(links) - 3} more" if len(links) > 3 else ""),
        "type": "official page" if x["label"] == "officially confirmed" else "visitor report",
        "evidence": " | ".join(f"{s['name']}: {s.get('says', '')} {s.get('url', '')}".strip() for s in links),
        "date": max(dates) if dates else x.get("found", ""),
        "links": links,
    }
    return key


def alts(data, x):
    out = []
    for a in x.get("alt", []):
        key = "alt-" + slug(a.get("src", "source"))
        data["sources"].setdefault(key, {"name": a.get("src", ""), "type": "visitor report",
                                         "evidence": a.get("url", ""), "date": x.get("found", "")})
        t = a["t"] if isinstance(a["t"], dict) else {"en": a["t"], "hi": a["t"]}
        out.append({"t": t, "s": "unverified", "src": key, "ver": x.get("found", "")})
    return out


def build_fact(data, x, cls, unit):
    lab = x["label"]
    if lab == "unavailable":
        return {"v": None, "why": x["t"], "cls": cls}
    dates = [iso(s.get("date")) for s in x.get("sources", []) if iso(s.get("date"))]
    f = {"v": norm_value(x["field"], x.get("value"), unit or {}), "t": x["t"], "s": lab,
         "src": add_sources(data, x), "ver": max(dates) if dates else x.get("found"), "cls": cls}
    if f["src"] is None:
        del f["src"]
    a = alts(data, x)
    if a:
        f["alt"] = a
    if lab in ("conflicting", "unverified"):
        f["why"] = CHECK
    return f


def locate(data, pid):
    """A ledger place id is a place id, or a unit id inside a place (the fort's sections)."""
    for p in data["places"]:
        if p["id"] == pid:
            return p, (p["units"][0] if len(p["units"]) == 1 else None)
        for u in p["units"]:
            if u["id"] == pid:
                return p, u
    return None, None


VERSION = __import__("datetime").datetime.now().strftime("%Y-%m-%dT%H:%M")


def main():
    dry = "--dry" in sys.argv
    D = {c: json.loads((APP / "src" / "data" / f"{c}.json").read_text(encoding="utf-8")) for c in CITIES}
    L = [json.loads(l) for l in LEDGER.read_text(encoding="utf-8").splitlines() if l.strip()]
    done, skipped = [], []
    for x in L:
        data = D[x["city"]]
        field = x["field"]
        if field == "altversion":
            skipped.append((x, "unofficial version against an official rule, report only"))
            continue
        if field == "site-check":
            skipped.append((x, "site check, teammate sheet only"))
            continue
        if field == "newplace":
            skipped.append((x, "candidate place, teammate sheet only"))
            continue
        place, unit = locate(data, x["place"])
        if not place:
            skipped.append((x, "place not in app data"))
            continue
        if field == "note":
            if any(n.get("t", {}).get("en") == x["t"]["en"] for n in place["notes"]):
                continue
            place["notes"].append(build_fact(data, x, "status", unit))
            done.append((x, "note added"))
            continue
        if field == "activity":
            # value: {"id", "name", "kind", "price"}; the text says what, when and how much as published.
            v = x.get("value") or {}
            acts = place.setdefault("activities", [])
            acts[:] = [a for a in acts if a["id"] != v["id"]]
            a = build_fact(data, x, "fees", unit)
            a.pop("v", None)
            acts.append({"id": v["id"], "name": v["name"], "kind": v.get("kind", "other"), "price": v.get("price"), **a})
            done.append((x, f"activity {v['id']}"))
            continue
        if field == "rule":
            if x["label"] == "unavailable" or any(r.get("t", {}).get("en") == x["t"]["en"] for r in place["rules"]):
                continue
            place["rules"].append({**build_fact(data, x, "rules", unit), "kind": x.get("kind", "courtesy")})
            done.append((x, "rule added"))
            continue
        if field in ("contact", "accessibility", "facilities", "summary", "dress"):
            # Place-level facts. The dress rule only exists on worship and contested places.
            if field == "dress":
                if not place.get("sensitive"):
                    skipped.append((x, "not a worship or contested place"))
                    continue
                holder, key = place["sensitive"], "dress"
            else:
                holder, key = place, field
            old = holder.get(key) or {}
            if rank(old) > RANK[x["label"]] or (x["label"] == "unavailable" and rank(old) > 0):
                skipped.append((x, f"kept stronger {field} ({old.get('s')})"))
                continue
            new = build_fact(data, x, {"summary": "history", "facilities": "hours"}.get(field, "rules"), unit)
            if new.get("v") is None and x["label"] != "unavailable":
                new["v"] = True  # text facts: the value is the text itself
            holder[key] = new
            done.append((x, f"{field}: {old.get('s') or 'unknown'} -> {x['label']}"))
            continue
        if (x["city"], x["place"], field) in KEEP:
            skipped.append((x, "Fact 2 record kept as closed, finding goes to the teammate sheet"))
            continue
        if unit is None:
            skipped.append((x, "place has several units, ledger names none"))
            continue
        old = unit.get(field)
        if rank(old) > RANK[x["label"]] and x["label"] != "conflicting" or (rank(old) == 4 and RANK[x["label"]] < 4):
            skipped.append((x, f"kept stronger {field} ({old.get('s')})"))
            continue
        new = build_fact(data, x, CLS.get(field, "rules"), unit)
        if old and old.get("t") == new.get("t"):
            # Already applied on an earlier run: keep the versions that run carried over.
            new["alt"] = [a for a in old.get("alt", []) if a not in new.get("alt", [])] + new.get("alt", [])
            if not new["alt"]:
                del new["alt"]
            if old.get("why"):
                new["why"] = old["why"]
        elif x["label"] == "conflicting" and old and old.get("s") == "conflicting" and old.get("why"):
            new["why"] = old["why"]
        if x["label"] == "conflicting" and new.get("v") is None and old and old.get("v") is not None and old.get("t") != new.get("t"):
            # Keep the old value as one of the versions rather than dropping it.
            new.setdefault("alt", []).insert(0, {"t": old.get("t") or {"en": "Earlier record", "hi": "पिछला रिकॉर्ड"},
                                                 "s": old.get("s", "unverified"), "src": old.get("src", ""),
                                                 "ver": old.get("ver", ""), "v": old.get("v")})
        unit[field] = new
        done.append((x, f"{field}: {(old or {}).get('s') or 'unknown'} -> {x['label']}"))

    for x, what in done:
        print(f"APPLIED {x['city']}/{x['place']}: {what}")
    for x, why_ in skipped:
        print(f"SKIPPED {x['city']}/{x['place']} {x['field']} ({x['label']}): {why_}")
    print(f"{len(done)} applied, {len(skipped)} skipped, {len(L)} findings")
    if not dry:
        for c in CITIES:
            D[c]["city"]["readAt"] = max(D[c]["city"].get("readAt", ""), "2026-10-25")
            # A new dataVersion makes the live server re-import the file on its next request (cities.py).
            # A version that changes whenever the data changes (date and minute), so every deploy of new data re-imports.
            D[c]["city"]["dataVersion"] = VERSION
            (APP / "src" / "data" / f"{c}.json").write_text(json.dumps(D[c], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        # FAQs are answered from the facts just written, so they are rebuilt on every run.
        sys.path.insert(0, str(Path(__file__).parent))
        import build_faqs
        build_faqs.main()


if __name__ == "__main__":
    main()
