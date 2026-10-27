"""Photos and official links for each place.

Photo: the place's Wikidata image (P18) from Wikimedia Commons, with the author and licence shown in the app.
A Wikidata item is used only when its name matches and its position is within 1.5 km of ours, so a wrong
photo is never attached. Places without a match keep the painted or drawn art.
Official links: the official pages we opened for that place (district site, MP Tourism, Incredible India,
the custodian's own site). "Read more" in the app opens them.
Run: python scripts/build_media.py   (safe to rerun; results cached in scripts/media_cache.json)
"""
import json
import math
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
CACHE = Path(__file__).with_name("media_cache.json")
H = {"User-Agent": "Dishaara-research/1.0 (adictiveofficial@gmail.com)"}

OFFICIAL = {
    "gwalior": {
        "gwalior-fort": [("Gwalior district: The Fort", "https://gwalior.nic.in/en/tourist-place/the-fort/"), ("MP Tourism: Gwalior Fort", "https://www.mptourism.com/gwalior-fort-madhya-pradesh-historical-place.html"), ("Incredible India: Gwalior Fort", "https://www.incredibleindia.gov.in/en/madhya-pradesh/gwalior/gwalior-fort")],
        "sas-bahu": [("MP Tourism: Sas Bahu Temple", "https://www.mptourism.com/sas-bahu-temple-in-gwalior.html")],
        "teli-ka-mandir": [("MP Tourism: Teli ka Mandir", "https://www.mptourism.com/teli-ka-mandir-a-must-visit-in-gwalior.html")],
        "jai-vilas": [("Jai Vilas Palace (official site)", "https://jaivilaspalace.in/aboutjvp/"), ("Gwalior district: Jai Vilas Palace", "https://gwalior.nic.in/en/tourist-place/jai-vilas-palace-and-museum/"), ("MP Tourism: Jai Vilas Palace", "https://www.mptourism.com/jai-vilas-palace-museum.html")],
        "tansen-tomb": [("MP Tourism: The legend of Tansen", "https://www.mptourism.com/the-legend-of-tansen.html")],
        "ghaus-tomb": [("Gwalior district: Ghaus Mohammed's Tomb", "https://gwalior.nic.in/en/tourist-place/ghaus-mohammeds-tomb/")],
        "sun-temple": [("Gwalior district: Sun Temple", "https://gwalior.nic.in/en/tourist-place/sun-temple/")],
        "light-sound-show": [("MP Tourism: Gwalior Fort (show times and tickets)", "https://www.mptourism.com/gwalior-fort-madhya-pradesh-historical-place.html")],
        "tighra-dam": [("Gwalior district: Tighra Dam", "https://gwalior.nic.in/en/tourist-place/tighra-dam/")],
        "phool-bagh": [("Gwalior district: Gwalior Zoo in Phool Bagh", "https://gwalior.nic.in/en/tourist-place/gwalior-zoo-gandhi-zoological-park/")],
        "gwalior-zoo": [("Gwalior district: Gwalior Zoo", "https://gwalior.nic.in/en/tourist-place/gwalior-zoo-gandhi-zoological-park/")],
        "bateshwar": [("MP Tourism: Mitawali, Padavali, Bateshwar", "https://www.mptourism.com/mitawali-padavali-bateshwar.html")],
        "padavali": [("MP Tourism: Mitawali, Padavali, Bateshwar", "https://www.mptourism.com/mitawali-padavali-bateshwar.html")],
        "mitaoli": [("MP Tourism: Mitawali, Padavali, Bateshwar", "https://www.mptourism.com/mitawali-padavali-bateshwar.html")],
        "gopachal": [("MP Tourism: Gwalior Fort", "https://www.mptourism.com/gwalior-fort-madhya-pradesh-historical-place.html")],
        "chaturbhuj-temple": [("MP Archaeology: Monuments of Gwalior Fort", "https://archaeology.mp.gov.in/monumentsgwaliorfort")],
        "assi-khamba-bawri": [("Incredible India: Gwalior travel guide", "https://www.incredibleindia.gov.in/en/madhya-pradesh/gwalior/gwalior-travel-guide")],
        "moti-mahal": [("MP Tourism: Gwalior", "https://www.mptourism.com/destination-gwalior.php")],
    },
    "indore": {
        "rajwada": [("MP Archaeology (custodian): Rajwada", "https://archaeology.mp.gov.in/RajwadaandCenotaphsofHolkars"), ("Indore district: Rajwada", "https://indore.nic.in/en/tourist-place/rajwada/"), ("MP Tourism: Rajwada Palace", "https://www.mptourism.com/rajwada-palace-in-indore.html")],
        "lal-bagh": [("MP Archaeology (custodian): Lalbag Palace", "https://archaeology.mp.gov.in/lalbagpalaceindore"), ("MP Tourism: Lal Bagh Palace", "https://www.mptourism.com/lal-bagh-palace-indore.html"), ("Indore district: Lalbagh Palace", "https://indore.nic.in/en/tourist-place/lalbag-palace/")],
        "sirpur-lake": [("Indore Municipal Corporation lake (Wikipedia on its Ramsar status)", "https://en.wikipedia.org/wiki/Sirpur_Lake")],
        "central-museum": [("MP Tourism: Central Museum", "https://www.mptourism.com/central-museum-indore.html")],
        "kanch-mandir": [("Indore district: Kanch Mandir", "https://indore.nic.in/en/tourist-place/kanch-mandir/")],
        "khajrana": [("Khajrana Ganesh Mandir (official site)", "https://shreeganeshkhajrana.com/"), ("Indore district: Khajrana Temple", "https://indore.nic.in/en/tourist-place/khajrana-temple/")],
        "annapurna": [("Incredible India: Maa Annapurna Temple", "https://www.incredibleindia.gov.in/en/madhya-pradesh/indore/maa-annapurna-temple"), ("Indore district: Annapurna Temple", "https://indore.nic.in/en/tourist-place/annapurna-temple/")],
        "gulawat-lotus-valley": [("Indore district: Gulawat", "https://indore.nic.in/en/tourist-place/gulawat/")],
        "patalpani": [("MP Tourism: Patalpani Waterfall", "https://www.mptourism.com/patalpani-waterfall-place-to-visit-near-indore-in-madhya-pradesh.html"), ("Indore district: Patal Paani", "https://indore.nic.in/en/tourist-place/patal-paani/")],
        "choral-dam": [("Indore district: Choral Dam", "https://indore.nic.in/en/tourist-place/choral-dam/")],
        "indore-zoo": [("Indore Zoo ticket booking (official)", "https://knpsi.in/")],
        "bhim-janmabhoomi": [("Indore district: Dr. Babasaheb Ambedkar birth place", "https://indore.nic.in/en/tourist-place/bhim-janmabhoomi-dr-babasaheb-ambedkar/")],
    },
}


def get(url):
    for i in range(3):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=H), timeout=20))
        except Exception:
            time.sleep(2 + i * 3)
    return None


def km(a, b):
    r = math.pi / 180
    d = math.sin((b[0] - a[0]) * r / 2) ** 2 + math.cos(a[0] * r) * math.cos(b[0] * r) * math.sin((b[1] - a[1]) * r / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(d))


STOP = {"the", "of", "and", "temple", "mandir", "palace", "tomb", "garden", "dam", "indore", "gwalior", "shri", "sri", "mata", "show", "mall", "park"}


def key_words(name):
    return {w for w in re.findall(r"[a-z]+", name.lower()) if len(w) > 2 and w not in STOP}


def wikidata_image(name, coord, city):
    """(qid, file, km) of the Wikidata item for this place that has an image. Its name must share a key word
    with ours, and it must sit within 1.5 km of our position (or, with no position, name the city)."""
    names = [name, re.sub(r"\s*\(.*?\)", "", name)]
    want = key_words(name) or set(re.findall(r"[a-z]+", name.lower()))
    best = None
    for q in dict.fromkeys(names):
        res = get("https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode({"action": "wbsearchentities", "format": "json", "language": "en", "limit": 7, "search": q})) or {}
        for r in res.get("search", []):
            label = (r.get("label") or "") + " " + " ".join(a for a in (r.get("aliases") or []) if isinstance(a, str))
            if not (want & set(re.findall(r"[a-z]+", label.lower()))):
                continue
            e = (get(f"https://www.wikidata.org/wiki/Special:EntityData/{r['id']}.json") or {}).get("entities", {}).get(r["id"], {})
            c = e.get("claims", {})
            if "P18" not in c:
                continue
            lw = set(re.findall(r"[a-z]+", (r.get("label") or "").lower()))
            exact = lw == set(re.findall(r"[a-z]+", q.lower()))
            if "P625" in c:
                v = c["P625"][0]["mainsnak"]["datavalue"]["value"]
                d = km(coord, [v["latitude"], v["longitude"]])
                if d > (3 if exact else 1.5):
                    continue
            elif city in (r.get("description") or "").lower():
                d = 1.0
            else:
                continue
            # The closest name wins (Gwalior Fort itself, not a temple inside it), then the closest position.
            score = (exact, len(want & lw) / max(len(lw), 1), -d)
            if not best or score > best[3]:
                best = (r["id"], c["P18"][0]["mainsnak"]["datavalue"]["value"], d, score)
        time.sleep(0.5)
    return best


def commons(file):
    res = get("https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({"action": "query", "format": "json", "prop": "imageinfo", "iiprop": "url|extmetadata", "iiurlwidth": 900, "titles": f"File:{file}"})) or {}
    page = next(iter(res.get("query", {}).get("pages", {}).values()), {})
    info = (page.get("imageinfo") or [{}])[0]
    meta = info.get("extmetadata", {})
    strip = lambda h: re.sub(r"<[^>]+>", "", h or "").strip()
    if not info.get("thumburl"):
        return None
    return {"img": info["thumburl"], "page": info.get("descriptionurl"), "author": strip(meta.get("Artist", {}).get("value"))[:80] or "Unknown",
            "license": strip(meta.get("LicenseShortName", {}).get("value")) or "see Commons"}


def commons_near(name, coord):
    """A Commons photo taken within 1 km of our position whose file name shares a key word with the place name.
    Used when Wikidata has no image."""
    want = key_words(name)
    if not want:
        return None
    res = get("https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({"action": "query", "format": "json", "list": "geosearch", "gsnamespace": 6,
                                                                                    "gscoord": f"{coord[0]}|{coord[1]}", "gsradius": 1000, "gslimit": 100})) or {}
    hits = []
    for r in res.get("query", {}).get("geosearch", []):
        title = r["title"][5:]
        if not re.search(r"\.(jpe?g|png|webp)$", title, re.I):
            continue
        n = len(want & set(re.findall(r"[a-z]+", title.lower())))
        if n:
            hits.append((n, -r["dist"], title, r["dist"]))
    if not hits:
        return None
    hits.sort(reverse=True)
    return hits[0][2], hits[0][3] / 1000


def main():
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    for city in ("gwalior", "indore"):
        path = APP / "src" / "data" / f"{city}.json"
        d = json.loads(path.read_text(encoding="utf-8"))
        found = 0
        for p in d["places"]:
            key = f"{city}:{p['id']}"
            if key not in cache:
                hit = wikidata_image(p["name"]["en"], p["units"][0]["coord"], city)
                cache[key] = {"qid": hit[0], "file": hit[1], "km": round(hit[2], 2), **(commons(hit[1]) or {})} if hit else None
                CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")
            if cache[key] is None:
                # No Wikidata image: try a geotagged Commons photo named after the place (once).
                hit = commons_near(p["name"]["en"], p["units"][0]["coord"])
                cache[key] = {"qid": None, "file": hit[0], "km": round(hit[1], 2), "via": "commons-geo", **(commons(hit[0]) or {})} if hit else {"qid": None, "tried": "commons-geo"}
                CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")
                time.sleep(0.5)
            m = cache[key]
            if m and m.get("img"):
                p["photo"] = {k: m[k] for k in ("img", "page", "author", "license")} | ({"wikidata": m["qid"]} if m.get("qid") else {})
                found += 1
            else:
                p.pop("photo", None)
            p["official"] = [{"name": n, "url": u} for n, u in OFFICIAL[city].get(p["id"], [])]
        path.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(city, f"{found}/{len(d['places'])} photos,", sum(1 for p in d["places"] if p["official"]), "with official links")


if __name__ == "__main__":
    main()
