"""Questions people ask about each place, answered only from that place's stored facts.

Run after apply_research.py (it calls this itself): python scripts/build_faqs.py
Each answer keeps the label and source of the fact it came from. Unknown facts say so with the reason.
Disputed facts never give the disputed values (Priyangi, Fact 2): only "sources disagree" and the advisory.
The FAQs go into the city files, so the app shows them, the database stores them on import, and Yatra
searches them (backend/app/rag.py) and sees them in each place's facts pack.
"""
import json
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "src" / "data"
DAYS = {"en": ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        "hi": ["रविवार", "सोमवार", "मंगलवार", "बुधवार", "गुरुवार", "शुक्रवार", "शनिवार"]}
LABEL = {"en": {"officially confirmed": "official", "locally verified": "checked on site", "recently reported": "recently reported",
                "estimated": "estimate", "historical pattern": "past pattern", "unverified": "not verified", "potentially outdated": "may be outdated"},
         "hi": {"officially confirmed": "आधिकारिक", "locally verified": "मौके पर जाँचा", "recently reported": "हाल की रिपोर्ट",
                "estimated": "अनुमान", "historical pattern": "पुराना पैटर्न", "unverified": "असत्यापित", "potentially outdated": "पुराना हो सकता है"}}


def unknown(f):
    return not f or (f.get("v") is None and not f.get("s") and not f.get("t"))


def say(f, lang, value_text=None):
    """One fact as an answer sentence in one language."""
    if unknown(f):
        why = (f or {}).get("why", {}).get(lang)
        return ("Not known yet." if lang == "en" else "अभी पता नहीं।") + (f" {why}." if why and not why.endswith(".") else f" {why}" if why else "")
    if f.get("s") == "conflicting":
        adv = (f.get("why") or {}).get(lang) or ("Check at the place before you go." if lang == "en" else "जाने से पहले स्थल पर पुष्टि करें।")
        return ("Not confirmed: published sources disagree. " if lang == "en" else "पक्का नहीं: प्रकाशित स्रोत अलग-अलग हैं। ") + adv
    text = value_text or (f.get("t") or {}).get(lang)
    if not text:
        return "Not known yet." if lang == "en" else "अभी पता नहीं।"
    lab = LABEL[lang].get(f.get("s"), f.get("s") or "")
    date = f.get("ver") or ""
    return f"{text.rstrip('.')}. ({lab}{', ' + date if date else ''})"


def hours_text(u, lang):
    v = (u.get("hours") or {}).get("v")
    if not v:
        return None
    if v.get("kind") == "sun":
        return "Sunrise to sunset" if lang == "en" else "सूर्योदय से सूर्यास्त तक"
    return f"{v['open']} to {v['close']}" if lang == "en" else f"{v['open']} से {v['close']}"


def closed_text(u, lang):
    f = u.get("weeklyClosed") or {}
    if (f.get("t") or {}).get(lang):
        return None  # the stored text says it best
    v = f.get("v")
    if v is None:
        return None
    if not v:
        return "Open every day" if lang == "en" else "हर दिन खुला"
    days = ", ".join(DAYS[lang][d] for d in v)
    return f"Closed {days}" if lang == "en" else f"{days} को बंद"


def money(n, lang):
    if n is None:
        return "not known" if lang == "en" else "पता नहीं"
    return ("free" if lang == "en" else "निःशुल्क") if n == 0 else f"₹{n}"


def fees_text(u, lang):
    f = u.get("fees") or {}
    if (f.get("t") or {}).get(lang) or not f.get("v"):
        return None
    parts = []
    for r in f["v"].get("rows", []):
        if "any" in r:
            parts.append(f"{r['label'][lang]}: {money(r.get('any'), lang)}")
        else:
            parts.append(f"{r['label'][lang]}: {money(r.get('cash'), lang)} {'cash' if lang == 'en' else 'नकद'}, {money(r.get('online'), lang)} {'online' if lang == 'en' else 'ऑनलाइन'}")
    return "; ".join(parts) or None


def per_unit(p, key, q_en, q_hi, text_fn=None):
    """One FAQ for a unit fact; places with several sections answer per section."""
    out = []
    for u in p["units"]:
        f = u.get(key)
        pre = {"en": "", "hi": ""}
        if len(p["units"]) > 1:
            pre = {"en": f"{u['name']['en']}: ", "hi": f"{u['name']['hi']}: "}
        a = {lang: pre[lang] + say(f, lang, text_fn(u, lang) if text_fn else None) for lang in ("en", "hi")}
        out.append((a, f))
    a = {lang: " ".join(x[0][lang] for x in out) for lang in ("en", "hi")}
    best = next((f for _, f in out if f and f.get("s") and f.get("s") != "conflicting"), out[0][1] if out else None)
    return {"q": {"en": q_en, "hi": q_hi}, "a": a, "f": best, "from": key}


def faqs(p):
    name = p["name"]
    items = [
        per_unit(p, "hours", f"When is {name['en']} open?", f"{name['hi']} कब खुलता है?", hours_text),
        per_unit(p, "weeklyClosed", f"Which day is {name['en']} closed?", f"{name['hi']} किस दिन बंद रहता है?", closed_text),
        per_unit(p, "fees", f"What is the entry fee at {name['en']}?", f"{name['hi']} का प्रवेश शुल्क क्या है?", fees_text),
        per_unit(p, "lastEntry", f"What is the last entry time at {name['en']}?", f"{name['hi']} में आख़िरी प्रवेश कब तक?"),
        per_unit(p, "payment", f"Can I pay by UPI or card at {name['en']}?", f"क्या {name['hi']} में UPI या कार्ड से भुगतान हो सकता है?"),
    ]
    for key, q_en, q_hi in (("accessibility", f"Is {name['en']} wheelchair accessible?", f"क्या {name['hi']} व्हीलचेयर से जा सकते हैं?"),
                            ("facilities", f"Are there toilets and parking at {name['en']}?", f"क्या {name['hi']} में शौचालय और पार्किंग है?"),
                            ("contact", f"How do I contact {name['en']}?", f"{name['hi']} से संपर्क कैसे करें?")):
        f = p.get(key)
        items.append({"q": {"en": q_en, "hi": q_hi}, "a": {l: say(f, l) for l in ("en", "hi")}, "f": f, "from": key})
    if p.get("sensitive"):
        f = p["sensitive"].get("dress")
        items.append({"q": {"en": f"Is there a dress code at {name['en']}?", "hi": f"क्या {name['hi']} में पहनावे का नियम है?"},
                      "a": {l: say(f, l) for l in ("en", "hi")}, "f": f, "from": "dress"})
    rules = [r for r in p.get("rules", []) if not unknown(r)]
    if rules:
        items.append({"q": {"en": f"What rules should I follow at {name['en']}?", "hi": f"{name['hi']} में किन नियमों का पालन करें?"},
                      "a": {l: " ".join(say(r, l) for r in rules) for l in ("en", "hi")}, "f": rules[0], "from": "rules"})
    acts = [a for a in p.get("activities", []) or [] if not unknown(a)]
    if acts:
        items.append({"q": {"en": f"What can I do at {name['en']}?", "hi": f"{name['hi']} में क्या कर सकते हैं?"},
                      "a": {l: " ".join(f"{a['name'][l]}: {say(a, l)}" for a in acts) for l in ("en", "hi")}, "f": acts[0], "from": "activities"})
    lvl = p["guardrail"]["status"]
    auto = lvl in ("level1", "level2")
    items.append({"q": {"en": f"Will Dishaara put {name['en']} in my day plan by itself?", "hi": f"क्या दिशारा {name['hi']} को अपने आप मेरी योजना में डालेगा?"},
                  "a": {"en": "Yes, when it fits your time: its custodian publishes it as open and ticketed." if auto else
                        f"No. {(p['guardrail'].get('reason') or {}).get('en', 'It is not cleared for automatic plans')}. You can add it to your day yourself.",
                        "hi": "हाँ, अगर आपके समय में फिट हो: इसका संरक्षक इसे खुला और टिकट वाला प्रकाशित करता है।" if auto else
                        f"नहीं। {(p['guardrail'].get('reason') or {}).get('hi', 'यह अपने आप योजना के लिए मंज़ूर नहीं')}। आप इसे खुद दिन में जोड़ सकते हैं।"},
                  "f": None, "from": "guardrail"})
    out = []
    for it in items:
        f = it.pop("f") or {}
        if f.get("s"):
            it["s"] = f["s"]
        if f.get("src"):
            it["src"] = f["src"]
        if f.get("ver"):
            it["ver"] = f["ver"]
        out.append(it)
    return out


def main():
    for c in ("gwalior", "indore"):
        path = DATA / f"{c}.json"
        d = json.loads(path.read_text(encoding="utf-8"))
        n = 0
        for p in d["places"]:
            p["faqs"] = faqs(p)
            n += len(p["faqs"])
        path.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"{c}: {n} FAQs for {len(d['places'])} places")


if __name__ == "__main__":
    main()
