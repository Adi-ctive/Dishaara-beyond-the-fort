"""City directory: emergency helplines, hospitals, police, airport, railway, bus, hotels and other numbers.

Built from pages saved in 07_round2/data_research/round2/raw (opened in full, every table row parsed):
- District sites (gwalior.nic.in, indore.nic.in): helplines, hospitals, police stations. Official.
- Airports Authority of India airport pages: official.
- MPCCI Gwalior "Emergency & Important Numbers" (Chamber of Commerce, undated): labelled unverified,
  because a chamber list is not the issuing office and some numbers may be old.
Run: python scripts/build_directory.py   (safe to rerun: it replaces the directory in both city files)
"""
import json
import re
import sys
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
RAW = APP.parent / "07_round2" / "data_research" / "round2" / "raw"
sys.path.insert(0, str(RAW.parent))
READ = "2026-10-25"

CAT = {  # category id -> (en, hi)
    "emergency": ("Emergency helplines", "आपात हेल्पलाइन"), "hospital": ("Hospitals", "अस्पताल"), "police": ("Police", "पुलिस"),
    "transport": ("Airport, railway and bus", "हवाई अड्डा, रेलवे और बस"), "hotel": ("Hotels", "होटल"),
    "utility": ("Electricity, water and gas", "बिजली, पानी और गैस"), "civic": ("City offices", "नगर कार्यालय"), "media": ("News and media", "समाचार और मीडिया"),
}
HELP_HI = {"CM Helpline": "मुख्यमंत्री हेल्पलाइन", "Police Helpline": "पुलिस हेल्पलाइन", "Women Helpline": "महिला हेल्पलाइन", "Child helpline": "चाइल्ड हेल्पलाइन",
           "CHILDREN HELPLINE": "चाइल्ड हेल्पलाइन", "Fire Helpline": "फ़ायर हेल्पलाइन", "FIRE": "फ़ायर ब्रिगेड", "Medical Emergency Helpline": "मेडिकल आपात हेल्पलाइन",
           "AMBULANCE SERVICE": "एम्बुलेंस", "Emergency Number": "आपात नंबर", "INDORE POLICE": "इंदौर पुलिस", "Senior Citizen Helpline": "वरिष्ठ नागरिक हेल्पलाइन",
           "MY Hospital Indore": "एमवाय अस्पताल इंदौर", "Farmer Call Centre": "किसान कॉल सेंटर", "Election Helpline": "चुनाव हेल्पलाइन"}
SKIP_HELP = {"Corona Control Room Gwalior", "Corona Control Room", "DEAD ANIMAL", "Election Helpline", "Farmer Call Centre"}
SOURCES = {
    "gwalior": {
        "nic-helpline": ("Gwalior district site, Helpline", "https://gwalior.nic.in/en/helpline/", "officially confirmed"),
        "nic-hospitals": ("Gwalior district site, Hospitals", "https://gwalior.nic.in/en/public-utility-category/hospitals/", "officially confirmed"),
        "nic-police": ("Gwalior district site, Police stations", "https://gwalior.nic.in/en/police/", "officially confirmed"),
        "aai-airport": ("Airports Authority of India, Gwalior airport", "https://www.aai.aero/en/airports/gwalior", "officially confirmed"),
        "mpcci-numbers": ("MPCCI Gwalior (Chamber of Commerce), Emergency and Important Numbers, undated", "https://mpcci.in/gwalior-emergency-numbers.php", "unverified"),
    },
    "indore": {
        "nic-helpline": ("Indore district site, Helpline", "https://indore.nic.in/en/helpline/", "officially confirmed"),
        "nic-hospitals": ("Indore district site, Government and private hospitals", "https://indore.nic.in/en/public-utility-category/government-hospitals/", "officially confirmed"),
        "aai-airport": ("Airports Authority of India, Indore airport", "https://www.aai.aero/en/airports/indore", "officially confirmed"),
    },
}


def phones(text):
    """Phone numbers in a cell, keeping labels like (O) or (R). Fax numbers are dropped."""
    out = []
    for part in re.split(r",\s*,?|\s{2,}", text):
        part = part.strip(" ,")
        if not part or "fax" in part.lower() or not re.search(r"\d{3}", part):
            continue
        out.append(re.sub(r"\s+", " ", part))
    return out


def entry(cat, name, nums, src, hi=None, **extra):
    return {"id": re.sub(r"[^a-z0-9]+", "-", f"{cat}-{name}".lower()).strip("-")[:60], "cat": cat,
            "name": {"en": name, "hi": hi or name}, "phones": nums, "src": src, **{k: v for k, v in extra.items() if v}}


def textlines(f):
    import subprocess
    return subprocess.run([sys.executable, str(RAW.parent / "textof.py"), str(f), "", "200000"], capture_output=True, text=True, encoding="utf-8").stdout.splitlines()


def helplines(city):
    lines = [l for l in textlines(RAW / f"{city}.nic.in_en_helpline_.html") if l not in ("Share", "Facebook", "X", "-->")]
    i = max(i for i, l in enumerate(lines) if l == "Helpline") + 1
    out = []
    while i + 1 < len(lines) and re.search(r"\d{3}", lines[i + 1]):
        name, num = lines[i], lines[i + 1]
        if name not in SKIP_HELP:
            cat = "hospital" if "Hospital" in name else "emergency"
            out.append(entry(cat, name.title() if name.isupper() else name, [num], "nic-helpline", HELP_HI.get(name)))
        i += 2
    return out


def hospitals(city):
    files = sorted(RAW.glob(f"{city}.nic.in_en_public-utility-category_*hospital*.html"))
    import subprocess
    rows = json.loads(subprocess.run([sys.executable, str(RAW.parent / "nic_utils.py"), *map(str, files)], capture_output=True, text=True, encoding="utf-8").stdout)
    return [entry("hospital", r["name"].title() if r["name"].isupper() else r["name"], phones(r.get("phone", "") + ", " + r.get("mobile", "")),
                  "nic-hospitals", address=r.get("address"), email=r.get("email"), website=r.get("website")) for r in rows]


def police_gwalior():
    t = json.loads((RAW / "gwalior_police_nic.json").read_text(encoding="utf-8"))[0]["rows"][1:]
    return [entry("police", f"{r[1]} police station", [f"0751-{n.strip()}" if len(n.strip()) == 7 else n.strip() for n in r[2].split(",")], "nic-police",
                  f"{r[1]} थाना", email=r[3] if len(r) > 3 else None) for r in t if len(r) >= 3 and r[2].strip()]


def mpcci_gwalior():
    tables = json.loads((RAW / "mpcci-gwalior-emergency-numbers.json").read_text(encoding="utf-8"))
    cat_of = {"Major Hospitals": "hospital", "Airways": "transport", "Railway": "transport", "Bus Stand": "transport", "Police": "police",
              "M.P.E.B": "utility", "Cooking Gas": "utility", "Water Supply": "utility", "Administrative": "civic", "Municipal": "civic",
              "Daily News": "media", "Electronic Media": "media", "Main Hotels": "hotel", "Circuit House": "hotel", "Other Important": "emergency"}
    out = []
    for t in tables[1:]:
        head = t["rows"][0][0]
        cat = next((v for k, v in cat_of.items() if head.startswith(k)), None)
        if not cat:
            continue
        prefix = {"Airways": "Airport: ", "Railway Station": "Railway: ", "Bus Stand": "Bus: ", "M.P.E.B. (Client here for more contacts..)": "Electricity (MPEB): ",
                  "Water Supply": "Water supply: ", "Circuit House": "Circuit House "}.get(head, "")
        for r in t["rows"][1:]:
            if len(r) >= 2 and r[0].strip():
                out.append(entry(cat, prefix + r[0].strip(), phones(r[1]), "mpcci-numbers"))
    return out


def aai(city):
    if city == "gwalior":
        return [entry("transport", "Gwalior airport (Rajmata Vijayaraje Scindia Air Terminal)", ["0751-2470080"], "aai-airport", "ग्वालियर हवाई अड्डा",
                      address="Maharajpura, Gwalior-474020", email="apdgwalior@aai.aero")]
    return [entry("transport", "Indore airport terminal enquiries", ["+91-731-2626326", "+91-731-2626327", "+91-9425057716"], "aai-airport", "इंदौर हवाई अड्डा पूछताछ",
                  address="Devi Ahilya Bai Holkar Airport, Indore 452005", email="apdindore@aai.aero")]


def main():
    for city in ("gwalior", "indore"):
        items = helplines(city) + hospitals(city) + aai(city)
        if city == "gwalior":
            items += police_gwalior() + mpcci_gwalior()
        seen, out = set(), []
        for e in items:  # official entries come first, so a duplicate from the chamber list is dropped
            key = (e["cat"], re.sub(r"[^a-z]", "", e["name"]["en"].lower())[:24])
            if key in seen or not e["phones"] and not e.get("email"):
                continue
            seen.add(key)
            label, = [l for k, (_, _, l) in SOURCES[city].items() if k == e["src"]]
            out.append({**e, "s": label, "ver": READ})
        path = APP / "src" / "data" / f"{city}.json"
        d = json.loads(path.read_text(encoding="utf-8"))
        d["directory"] = out
        d["directoryCats"] = {k: {"en": v[0], "hi": v[1]} for k, v in CAT.items()}
        for k, (name, url, _) in SOURCES[city].items():
            d["sources"][f"dir-{k}"] = {"name": name, "type": "official page" if "nic.in" in url or "aai.aero" in url else "visitor report", "evidence": url, "date": READ}
        for e in out:
            e["src"] = f"dir-{e['src']}"
        path.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        counts = {}
        for e in out:
            counts[e["cat"]] = counts.get(e["cat"], 0) + 1
        print(city, len(out), counts)


if __name__ == "__main__":
    main()
