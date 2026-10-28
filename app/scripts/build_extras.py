"""Adds places beyond heritage (nature, modern city, markets, activities) to the city data files.
Run: python scripts/build_extras.py   (safe to rerun: it replaces its own places). Rerun it after build_indore.py.

Same rules as the heritage data: descriptions quote MP Tourism where it has them, otherwise
OpenStreetMap says what the place is. Hours and fees are unavailable unless an official page gives
them. Unticketed places are never Level 1 (Decision 25): they show in search, maps, stories and chat,
and a raahi adds them to the day by hand. The fort's Light and Sound Show has official times and fees.
"""
import json
from pathlib import Path

READ = "2026-10-23"
DATA = Path(__file__).resolve().parents[1] / "src" / "data"


def L(en, hi):
    return {"en": en, "hi": hi}


def none(cls, en, hi):
    return {"v": None, "cls": cls, "why": L(en, hi)}


SOURCES = {
    "gwalior": {
        "mpt-gwalior": {"name": "MP Tourism, Gwalior destination page", "type": "official page", "evidence": "Undated, read 23 Oct 2026", "date": READ},
        "mpt-lightsound": {"name": "MP Tourism, Light and Sound Show at Gwalior Fort", "type": "official page", "evidence": "Hindi 19:30-20:05, English 20:20-20:55; adults Rs 250 Indian, Rs 700 foreign; children 5-12 Rs 100 / Rs 350; seasonal changes possible. Read 23 Oct 2026", "date": READ},
        "osm-places": {"name": "OpenStreetMap", "type": "official page", "evidence": "Place type and position, read 23 Oct 2026", "date": READ},
        "mpt-mitawali": {"name": "MP Tourism, Mitawali, Padavali, Bateshwar", "type": "official page", "evidence": "https://www.mptourism.com/mitawali-padavali-bateshwar.html, dated 1 Apr 2020, read 25 Oct 2026", "date": "2020-04-01"},
        "mpt-gwl-fort": {"name": "MP Tourism, Gwalior Fort", "type": "official page", "evidence": "https://www.mptourism.com/gwalior-fort-madhya-pradesh-historical-place.html, dated 7 Dec 2022, read 25 Oct 2026", "date": "2022-12-07"},
        "nic-gwl-zoo": {"name": "Gwalior district site, Gwalior Zoo (Gandhi Zoological Park)", "type": "official page", "evidence": "https://gwalior.nic.in/en/tourist-place/gwalior-zoo-gandhi-zoological-park/, updated 18 Dec 2023", "date": "2023-12-18"},
        "ii-gwl-guide": {"name": "Incredible India, Gwalior travel guide", "type": "official page", "evidence": "https://www.incredibleindia.gov.in/en/madhya-pradesh/gwalior/gwalior-travel-guide, read 25 Oct 2026", "date": "2026-10-25"},
        "mpa-gwl-fort": {"name": "MP Directorate of Archaeology, Monuments of Gwalior Fort", "type": "official page", "evidence": "https://archaeology.mp.gov.in/monumentsgwaliorfort, read 25 Oct 2026", "date": "2026-10-25"},
        "wiki-maharaj-bada": {"name": "Wikipedia, Maharaj Bada, Gwalior", "type": "visitor report", "evidence": "https://en.wikipedia.org/wiki/Maharaj_Bada,_Gwalior; position Wikidata Q18351583. Read 25 Oct 2026", "date": "2026-10-25"},
        "wiki-gohad": {"name": "Wikipedia, Gohad Fort", "type": "visitor report", "evidence": "https://en.wikipedia.org/wiki/Gohad_Fort; position Wikidata Q5577562. Read 25 Oct 2026", "date": "2026-10-25"},
        "nic-chhatris": {"name": "Gwalior district site, Chhatris of Scindia Dynasty", "type": "official page", "evidence": "https://gwalior.nic.in/en/tourist-place/chhatris-of-scindia-dynasty/: first built 1817 for Jayaji Rao Scindia; timings 5:30-11:30 am, 4:30-9:30 pm. Updated 20 Dec 2023", "date": "2023-12-20"},
        "nic-italian": {"name": "Gwalior district site, Italian Garden", "type": "official page", "evidence": "https://gwalior.nic.in/en/tourist-place/italian-garden/: timings 6:00-8:00 am, 5:00-8:00 pm. Updated 20 Dec 2023", "date": "2023-12-20"},
        "nic-samadhi": {"name": "Gwalior district site, Samadhi of Rani Lakshmi Bai", "type": "official page", "evidence": "https://gwalior.nic.in/en/tourist-place/samadhi-of-rani-lakshmi-bai/: 8 m metal statue, fair every June. Updated 20 Dec 2023", "date": "2023-12-20"},
        "asi-abul-fazal": {"name": "ASI Bhopal Circle, Tomb of Abul Fazal, Antri", "type": "official page", "evidence": "asibhopal.nic.in monument page (saved copy): 17th century tomb; No Entry Fees; facilities: signage. Monuments open sunrise to sunset (AMASR rules)", "date": "2026-10-25"},
        "mpcci-attr": {"name": "MPCCI Gwalior (Chamber of Commerce), Gwalior attractions", "type": "visitor report", "evidence": "https://mpcci.in/gwalior-attractions.php: Rani Laxmi Bai samadhi 24 hours, free; Sarod Ghar 10-6 closed Sunday, Rs 20 / Rs 100; lists Sarafa Bazar. Undated, read 25 Oct 2026", "date": "2026-10-25"},
        "ii-sarod": {"name": "Incredible India, Gwalior travel guide (Sarod Ghar)", "type": "official page", "evidence": "https://www.incredibleindia.gov.in/en/madhya-pradesh/gwalior/gwalior-travel-guide: Sarod Ghar on Haafiz Ali Khan Marg. Read 25 Oct 2026", "date": "2026-10-25"},
        "gmaps": {"name": "Google Maps listings", "type": "visitor report", "evidence": "Pins and listed hours read in Chrome on 25 Oct 2026. Owner or visitor edited", "date": "2026-10-25"},
        "wiki-ghatigaon": {"name": "Wikipedia, Ghatigaon Wildlife Sanctuary", "type": "visitor report", "evidence": "https://en.wikipedia.org/wiki/Ghatigaon_Wildlife_Sanctuary; position Wikidata Q5555916. Read 25 Oct 2026", "date": "2026-10-25"},
    },
    "indore": {
        "osm-places": {"name": "OpenStreetMap", "type": "official page", "evidence": "Place type and position, read 23 Oct 2026", "date": READ},
        "wiki-zoo": {"name": "Wikipedia, Kamla Nehru Prani Sangrahalay", "type": "visitor report", "evidence": "Municipal zoo on Old A.B. Road; online booking at knpsi.in. https://en.wikipedia.org/wiki/Kamla_Nehru_Prani_Sangrahalay; position from OpenStreetMap. Read 25 Oct 2026", "date": "2026-10-25"},
        "wiki-regional-park": {"name": "Wikipedia, Atal Bihari Vajpayee Regional Park", "type": "visitor report", "evidence": "Lakeside park at Pipliyapala; position from OpenStreetMap and Wikidata Q24942300. https://en.wikipedia.org/wiki/Atal_Bihari_Vajpayee_Regional_Park. Read 25 Oct 2026", "date": "2026-10-25"},
        "ot-gandhi-hall": {"name": "Outlook Traveller, An architectural trail in Indore", "type": "visitor report", "evidence": "Gandhi Hall, built as King Edward Hall from 1904, Indo-Gothic, red sandstone and white marble, clock tower. https://www.outlooktraveller.com/experiences/heritage/an-architectural-trail-in-indore; position from OpenStreetMap. Read 25 Oct 2026", "date": "2026-10-25"},
        "wiki-bhim": {"name": "Wikipedia, Bhim Janmabhoomi", "type": "visitor report", "evidence": "Memorial at Ambedkar's birthplace in Mhow (Dr. Ambedkar Nagar); built 1994-2007, opened 14 Apr 2008; architect E.D. Nimgade. https://en.wikipedia.org/wiki/Bhim_Janmabhoomi; position from OpenStreetMap (Dr. Bhimrao Ambedkar Janmsthali). Read 25 Oct 2026", "date": "2026-10-25"},
        "wiki-sirpur": {"name": "Wikipedia, Sirpur Lake", "type": "visitor report", "evidence": "https://en.wikipedia.org/wiki/Sirpur_Lake: 800 acres, Indore Municipal Corporation, Ramsar site 7 Jan 2022; position Wikidata Q55633279. Read 25 Oct 2026", "date": "2026-10-25"},
        "wiki-jamgate": {"name": "Wikipedia, Jam Gate", "type": "visitor report", "evidence": "https://en.wikipedia.org/wiki/Jam_Gate: built by Ahilyabai Holkar in 1791, about 50 km from Indore; position OSM and Wikidata Q61438361. Read 25 Oct 2026", "date": "2026-10-25"},
        "nic-pitra": {"name": "Indore district site, Pitra Parwat", "type": "official page", "evidence": "https://indore.nic.in/en/tourist-place/pitra-parwat/: Pitreshwar Hanuman, 72 ft ashtadhatu statue, Bijasan Road. Read 25 Oct 2026", "date": "2026-10-25"},
        "tt-gommatgiri": {"name": "TravelTriangle, Gommatagiri Digambar Jain Temple", "type": "visitor report", "evidence": "https://traveltriangle.com/blog/gommatagiri-digambar-jain-temple: 21 ft Bahubali statue, 24 marble temples, built 1981, 6 AM to 7 PM", "date": "2026-10-25"},
        "gmaps": {"name": "Google Maps listings", "type": "visitor report", "evidence": "Pins and listed hours read in Chrome on 25 Oct 2026. Owner or visitor edited", "date": "2026-10-25"},
        "wiki-bijasan": {"name": "Wikipedia, Bijasan Mata Temple, Indore", "type": "visitor report", "evidence": "Hilltop Devi temple near the airport, Navratri fair. https://en.wikipedia.org/wiki/Bijasan_Mata_Temple,_Indore; position from Wikidata Q4907186. Read 25 Oct 2026", "date": "2026-10-25"},
    },
}

UNTICKETED = {"status": "notEligible", "dailyLimit": None, "reason": L("Unticketed place: add it to your day by hand", "बिना टिकट की जगह: दिन में खुद जोड़ें")}
NO_HOURS = none("hours", "No official opening hours found", "आधिकारिक समय नहीं मिला")
NO_CLOSED = none("hours", "No weekly closing found", "साप्ताहिक बंदी नहीं मिली")
NO_FEES = none("fees", "No official price found", "आधिकारिक कीमत नहीं मिली")


def place(pid, name, type_, tags, coord, summary, src, *, visit=(45, 90), lesser=False, guard=UNTICKETED, hours=NO_HOURS, closed=NO_CLOSED, fees=NO_FEES, rules=(), far=None):
    summ = {"t": summary, "s": "officially confirmed" if src.startswith("mpt") else "recently reported", "src": src, "ver": READ, "cls": "history"}
    notes = [{"t": far, "s": "officially confirmed", "src": src, "ver": READ, "cls": "fare"}] if far else []
    return {
        "id": pid, "name": name, "type": type_, "tags": tags, "lesserKnown": lesser, "insideFort": False, "extra": True,
        "guardrail": guard, "summary": summ,
        "contact": none("rules", "Contact not found", "संपर्क नहीं मिला"),
        "accessibility": none("rules", "No sourced accessibility information", "पहुँच-योग्यता की कोई स्रोतित जानकारी नहीं"),
        "facilities": none("hours", "No official source found", "कोई आधिकारिक स्रोत नहीं मिला"),
        "rules": list(rules), "notes": notes,
        "units": [{"id": pid, "name": name, "custodian": none("rules", "Owner or custodian not confirmed", "मालिक या संरक्षक पुष्ट नहीं"), "coord": coord,
                   "hours": hours, "weeklyClosed": closed, "lastEntry": none("hours", "Not published", "प्रकाशित नहीं"),
                   "ticket": pid, "fees": fees, "payment": none("fees", "Payment modes not stated", "भुगतान के तरीके नहीं बताए गए"),
                   "minVisit": {"v": visit[0], "rec": visit[1], "s": "estimated", "src": "team-estimate", "ver": READ, "cls": "hours"}}],
    }


NOT_PUB = {"status": "notEligible", "dailyLimit": None, "reason": L("No custodian publication of hours and fees found", "संरक्षक का समय और शुल्क प्रकाशन नहीं मिला")}
WORSHIP = {"status": "notEligible", "dailyLimit": None, "reason": L("Place of worship: never auto-planned (Decision 25)", "पूजा स्थल: अपने आप योजना में नहीं (निर्णय 25)")}
DRESS_UNKNOWN = {"kind": "worship", "dress": none("rules", "Not yet sourced. Ask at the site before you go.", "अभी प्राप्त नहीं। जाने से पहले स्थल पर पूछें।")}

GWALIOR_MORE = [
    # Added 25 Oct 2026 from the official lists (MP Tourism, district site, Incredible India). Facts come from the ledger.
    place("gwalior-zoo", L("Gwalior Zoo (Gandhi Zoological Park)", "ग्वालियर चिड़ियाघर (गांधी प्राणी उद्यान)"), L("City zoo inside Phool Bagh", "फूल बाग के अंदर शहर का चिड़ियाघर"), ["nature", "activities"],
          [26.20926, 78.16794], L("Set up in 1922 by the Scindias, part of Phool Bagh. Known for its white tigers.", "1922 में सिंधिया परिवार ने बनवाया, फूल बाग का हिस्सा। सफ़ेद बाघों के लिए जाना जाता है।"), "nic-gwl-zoo", visit=(60, 120), guard=NOT_PUB),
    place("chaturbhuj-temple", L("Chaturbhuj Temple (Temple of Zero)", "चतुर्भुज मंदिर (शून्य का मंदिर)"), L("Rock-cut temple in the fort with the earliest known written zero", "किले में चट्टान काटकर बना मंदिर, सबसे पुराना लिखा शून्य"), ["architecture"],
          [26.23088, 78.16993], L("A small rock-cut temple in Gwalior Fort. Its inscription of 875 CE has the earliest known written zero.", "ग्वालियर किले में चट्टान काटकर बना छोटा मंदिर। इसके 875 ई. के शिलालेख में सबसे पुराना ज्ञात लिखा हुआ शून्य है।"), "mpa-gwl-fort", visit=(15, 30), lesser=True, guard=NOT_PUB),
    place("gopachal", L("Gopachal Jain rock sculptures", "गोपाचल जैन शैल प्रतिमाएँ"), L("Giant Jain figures carved in the fort's cliffs", "किले की चट्टानों में बनी विशाल जैन प्रतिमाएँ"), ["architecture", "spiritual"],
          [26.21478, 78.1675], L("Huge Jain Tirthankara figures cut into the cliffs of the fort hill, seen near Urwahi Gate. One Adinath figure is 17 m tall.", "किले की पहाड़ी की चट्टानों में कटी विशाल जैन तीर्थंकर प्रतिमाएँ, उरवाई गेट के पास। आदिनाथ की एक प्रतिमा 17 मीटर ऊँची है।"), "mpt-gwl-fort", visit=(20, 40), lesser=True, guard=WORSHIP),
    place("assi-khamba-bawri", L("Assi Khamba Bawri", "अस्सी खंभा बावड़ी"), L("Stepwell of eighty pillars in the fort", "किले में अस्सी खंभों की बावड़ी"), ["architecture"],
          [26.22923, 78.16849], L("A stepwell near Man Singh Palace, where Guru Hargobind is said to have been confined.", "मान सिंह महल के पास बावड़ी, जहाँ कहा जाता है गुरु हरगोबिंद को रखा गया था।"), "ii-gwl-guide", visit=(10, 20), lesser=True, guard=NOT_PUB),
    place("moti-mahal", L("Moti Mahal", "मोती महल"), L("Scindia-era palace, now government offices", "सिंधिया काल का महल, अब सरकारी दफ़्तर"), ["royal", "architecture"],
          [26.20761, 78.17304], L("A Scindia-era palace listed among Gwalior's sights by MP Tourism.", "एमपी टूरिज़्म की ग्वालियर की देखने लायक जगहों में शामिल सिंधिया काल का महल।"), "mpt-gwalior", visit=(15, 30), guard=NOT_PUB),
    place("maharaj-bada", L("Maharaj Bada", "महाराज बाड़ा"), L("Old city square ringed by heritage buildings", "विरासत इमारतों से घिरा पुराना चौक"), ["markets", "architecture"],
          [26.1994, 78.1487], L("The main square of Lashkar, with Victoria Hall, Town Hall and other old buildings around it, and busy markets.", "लश्कर का मुख्य चौक, चारों ओर विक्टोरिया हॉल, टाउन हॉल जैसी पुरानी इमारतें और बाज़ार।"), "wiki-maharaj-bada", visit=(30, 60)),
    place("bateshwar", L("Bateshwar temples", "बटेश्वर मंदिर समूह"), L("About 200 sandstone temples, 35 km out", "लगभग 200 बलुआ पत्थर के मंदिर, 35 किमी दूर"), ["architecture", "temples"],
          [26.42706, 78.19674], L("A cluster of almost 200 small sandstone temples to Shiva and Vishnu over 25 acres, from the 8th to 10th century.", "25 एकड़ में शिव और विष्णु के लगभग 200 छोटे बलुआ पत्थर के मंदिर, 8वीं से 10वीं सदी के।"), "mpt-mitawali", visit=(60, 120), lesser=True, guard=NOT_PUB),
    place("padavali", L("Padavali Fort", "पढ़ावली गढ़ी"), L("18th century fort with a carved temple hall", "नक्काशीदार मंदिर मंडप वाली 18वीं सदी की गढ़ी"), ["architecture"],
          [26.43136, 78.20172], L("An 18th century fort built by the Jat Ranas of Dhaulpur around a richly carved older Shiva temple hall.", "धौलपुर के जाट राणाओं की 18वीं सदी की गढ़ी, पुराने नक्काशीदार शिव मंदिर मंडप के चारों ओर।"), "mpt-mitawali", visit=(30, 60), lesser=True, guard=NOT_PUB),
    place("mitaoli", L("Chausath Yogini Temple, Mitaoli", "चौंसठ योगिनी मंदिर, मितावली"), L("Round hilltop temple, about 100 steps up", "पहाड़ी पर गोल मंदिर, लगभग 100 सीढ़ियाँ"), ["architecture", "temples"],
          [26.4368, 78.2352], L("A round 11th century temple on a hilltop, reached by about 100 steps. Inscriptions credit Maharaja Devapala.", "पहाड़ी पर 11वीं सदी का गोल मंदिर, लगभग 100 सीढ़ियों से। शिलालेख महाराजा देवपाल को श्रेय देते हैं।"), "mpt-mitawali", visit=(45, 90), lesser=True, guard=NOT_PUB),
    place("gohad-fort", L("Gohad Fort", "गोहद किला"), L("Jat fort of 1505, 45 km out", "1505 का जाट किला, 45 किमी दूर"), ["royal", "architecture"],
          [26.42611, 78.44694], L("A fort built in 1505 by Singhandev II of Gohad State, about 45 km from Gwalior in Bhind district.", "गोहद राज्य के सिंघनदेव द्वितीय ने 1505 में बनवाया किला, भिंड ज़िले में ग्वालियर से लगभग 45 किमी।"), "wiki-gohad", visit=(60, 90), lesser=True, guard=NOT_PUB),
    place("ghatigaon", L("Ghatigaon Wildlife Sanctuary", "घाटीगाँव वन्यजीव अभयारण्य"), L("Grassland sanctuary west of the city", "शहर के पश्चिम में घास का अभयारण्य"), ["nature"],
          [26.05, 77.93333], L("A 511 sq km sanctuary west of Gwalior that reaches up to Tighra Dam.", "ग्वालियर के पश्चिम में 511 वर्ग किमी का अभयारण्य, तिघरा बाँध तक फैला।"), "wiki-ghatigaon", visit=(90, 180)),
    place("geoscience-museum", L("Geoscience Museum", "जियोसाइंस संग्रहालय"), L("Earth science museum near Maharaj Bada", "महाराज बाड़ा के पास भू-विज्ञान संग्रहालय"), ["museums"],
          [26.19862, 78.14848], L("A geoscience museum near Maharaj Bada, marked on OpenStreetMap.", "महाराज बाड़ा के पास भू-विज्ञान संग्रहालय, OpenStreetMap पर।"), "osm-places", visit=(30, 60), guard=NOT_PUB),
]
for p in GWALIOR_MORE:
    if p["id"] == "gopachal":
        p["sensitive"] = DRESS_UNKNOWN

# Moti Mahal, 28 Oct 2026: the custodian's own board at the gate (Commissioner, Archaeology, Archives and Museums, MP,
# photographed on Aditya's field visit) shows it a State Protected Monument, open sunrise to sunset and ticketed
# (Indian Rs 20). That is a custodian publication, so Level 1 (Decision 25), decided by Aditya on 28 Oct. Hours and
# prices themselves change only through the saarthi entries filed with the same photos.
SOURCES["gwalior"]["mpaam-moti-board"] = {"name": "MP Archaeology, Archives and Museums, board at the Moti Mahal gate", "type": "official page",
                                          "evidence": "State Protected Monument board, photographed by Team Argus on 28 Oct 2026: Indian Rs 20, foreigner Rs 400, timing sunrise to sunset", "date": "2026-10-28"}
for p in GWALIOR_MORE:
    if p["id"] == "moti-mahal":
        p["guardrail"] = {"status": "level1", "dailyLimit": None, "publication": {
            "t": L("State Protected Monument board at the gate (MP Archaeology): open sunrise to sunset, ticketed", "राज्य संरक्षित स्मारक बोर्ड (म.प्र. पुरातत्व): सूर्योदय से सूर्यास्त, टिकट सहित"),
            "s": "officially confirmed", "src": "mpaam-moti-board", "ver": "2026-10-28", "cls": "fees"}}

def H(o, c, src, en, hi, s, brk=None, ver=READ):
    v = {"kind": "fixed", "open": o, "close": c}
    if brk:
        v["brk"] = {"from": brk[0], "to": brk[1]}
    return {"v": v, "t": L(en, hi), "s": s, "src": src, "ver": ver, "cls": "hours"}


def FREE(pid, src, s="officially confirmed", ver=READ):
    return {"v": {"ticket": pid, "rows": [{"who": w, "label": L("Everyone", "सभी"), "any": 0} for w in ("indian", "foreign", "child")]},
            "t": L("No entry fee", "प्रवेश निःशुल्क"), "s": s, "src": src, "ver": ver, "cls": "fees"}


# Added 25 Oct 2026 (late): spots on the official lists that had no map position before. Pins from Google Maps
# (read in Chrome), descriptions from the district site, ASI or MP Tourism.
GWALIOR_MORE += [
    place("rani-samadhi", L("Samadhi of Rani Lakshmi Bai", "रानी लक्ष्मीबाई की समाधि"), L("Memorial of the queen of Jhansi with an 8 m statue", "झाँसी की रानी का स्मारक, 8 मीटर की प्रतिमा"), ["royal"],
          [26.21206, 78.17344], L("Built in honour of Rani Lakshmi Bai, the warrior queen of Jhansi. It has an 8 metre metal statue of her, and a fair is held here every June.", "झाँसी की वीर रानी लक्ष्मीबाई के सम्मान में बनी समाधि। यहाँ उनकी 8 मीटर ऊँची धातु की प्रतिमा है और हर जून मेला लगता है।"), "nic-samadhi", visit=(15, 30),
          hours=H("00:00", "23:59", "mpcci-attr", "Open 24 hours, free (MPCCI list). Not from the custodian.", "24 घंटे खुला, निःशुल्क (MPCCI सूची)। संरक्षक से नहीं।", "unverified", ver="2026-10-25")),
    place("scindia-chhatris", L("Chhatris of the Scindia Dynasty", "सिंधिया वंश की छतरियाँ"), L("Sandstone memorials of the Scindia rulers", "सिंधिया शासकों के बलुआ पत्थर के स्मारक"), ["royal", "architecture"],
          [26.20267, 78.14354], L("Memorials to the Scindia rulers, the first built in 1817 for Jayaji Rao Scindia. Domes and pavilions in pink and yellow sandstone among green lawns.", "सिंधिया शासकों के स्मारक, पहला 1817 में जयाजी राव सिंधिया के लिए बना। हरे लॉन के बीच गुलाबी और पीले बलुआ पत्थर के गुंबद और मंडप।"), "nic-chhatris", visit=(30, 45), lesser=True, guard=NOT_PUB,
          hours=H("05:30", "21:30", "nic-chhatris", "5:30 to 11:30 and 16:30 to 21:30 (district site)", "5:30 से 11:30 और 16:30 से 21:30 (ज़िला साइट)", "officially confirmed", brk=("11:30", "16:30"), ver="2023-12-20")),
    place("italian-garden", L("Italian Garden", "इटैलियन गार्डन"), L("Small formal garden next to Phool Bagh", "फूल बाग के पास छोटा बगीचा"), ["nature"],
          [26.20916, 78.17033], L("A quiet garden in the heart of the city that blends Italian garden design with Indian planting.", "शहर के बीच शांत बगीचा, इटैलियन बनावट और भारतीय हरियाली का मेल।"), "nic-italian", visit=(20, 40), lesser=True,
          hours=H("06:00", "20:00", "nic-italian", "6:00 to 8:00 and 17:00 to 20:00 (district site)", "6:00 से 8:00 और 17:00 से 20:00 (ज़िला साइट)", "officially confirmed", brk=("08:00", "17:00"), ver="2023-12-20")),
    place("sarod-ghar", L("Sarod Ghar", "सरोद घर"), L("Music museum on Haafiz Ali Khan Marg", "हाफ़िज़ अली ख़ान मार्ग पर संगीत संग्रहालय"), ["music", "museums"],
          [26.20752, 78.14614], L("A museum of music on Haafiz Ali Khan Marg in Gwalior.", "ग्वालियर के हाफ़िज़ अली ख़ान मार्ग पर संगीत का संग्रहालय।"), "ii-sarod", visit=(30, 60), lesser=True, guard=NOT_PUB,
          hours=H("10:00", "16:00", "mpcci-attr", "Not settled. MPCCI: 10:00 to 18:00, closed Sunday, Rs 20 / Rs 100. Google Maps: Tue to Sat 10:00 to 16:00. A visitor marked it temporarily closed. Working window 10:00 to 16:00.", "पक्का नहीं। MPCCI: 10:00-18:00, रविवार बंद, ₹20 / ₹100। गूगल मैप्स: मंगल-शनि 10:00-16:00। एक आगंतुक ने अस्थायी रूप से बंद बताया। कार्य समय 10:00-16:00।", "conflicting", ver="2026-10-25"),
          closed={"v": [0], "t": L("Closed Sunday (MPCCI and Google Maps)", "रविवार बंद (MPCCI और गूगल मैप्स)"), "s": "unverified", "src": "mpcci-attr", "ver": "2026-10-25", "cls": "hours"}),
    place("sarafa-gwalior", L("Sarafa Bazar, Gwalior", "सराफ़ा बाज़ार, ग्वालियर"), L("Old market lane in Lashkar", "लश्कर की पुरानी बाज़ार गली"), ["markets", "food"],
          [26.20207, 78.15218], L("An old market in Lashkar near Maharaj Bada, on the MPCCI list of places to visit.", "महाराज बाड़ा के पास लश्कर का पुराना बाज़ार, MPCCI की घूमने की जगहों की सूची में।"), "mpcci-attr", visit=(30, 60)),
    place("abul-fazal-tomb", L("Tomb of Abul Fazal, Antri", "अबुल फ़ज़ल का मकबरा, आंतरी"), L("Small 17th century tomb, 25 km south", "17वीं सदी का छोटा मकबरा, 25 किमी दक्षिण"), ["architecture"],
          [26.06019, 78.20995], L("A small 17th century tomb of Abul Fazl, Akbar's minister, killed here by Bir Singh Bundela of Orchha at Prince Salim's urging.", "अकबर के मंत्री अबुल फ़ज़ल का 17वीं सदी का छोटा मकबरा, जिन्हें शहज़ादे सलीम के कहने पर ओरछा के बीर सिंह बुंदेला ने यहाँ मारा।"), "asi-abul-fazal", visit=(15, 30), lesser=True,
          hours={"v": {"kind": "sun"}, "t": L("Sunrise to sunset (ASI monument)", "सूर्योदय से सूर्यास्त (ASI स्मारक)"), "s": "officially confirmed", "src": "asi-abul-fazal", "ver": "2026-10-25", "cls": "hours"},
          fees=FREE("abul-fazal-tomb", "asi-abul-fazal", ver="2026-10-25")),
]

GWALIOR = [
    place("light-sound-show", L("Light and Sound Show, Gwalior Fort", "लाइट एंड साउंड शो, ग्वालियर किला"), L("Evening show at Man Singh Palace", "मान सिंह महल में शाम का शो"), ["activities", "royal", "music"],
          [26.2309, 78.1692], L("As the sun sets behind the walls of Gwalior Fort, a light and sound show tells its story.", "सूरज ढलते ही ग्वालियर किले की दीवारों पर रोशनी और आवाज़ से उसकी कहानी सुनाई जाती है।"), "mpt-lightsound",
          visit=(35, 35),
          guard={"status": "level1", "dailyLimit": None, "publication": {"t": L("MP Tourism: daily shows with published times and fees", "MP टूरिज़्म: रोज़ के शो, समय और शुल्क प्रकाशित"), "s": "officially confirmed", "src": "mpt-lightsound", "ver": READ, "cls": "fees"}},
          hours={"v": {"kind": "fixed", "open": "19:30", "close": "20:55"}, "t": L("Hindi 19:30–20:05, English 20:20–20:55 (can change by season)", "हिंदी 19:30–20:05, अंग्रेज़ी 20:20–20:55 (मौसम से बदल सकता है)"), "s": "officially confirmed", "src": "mpt-lightsound", "ver": READ, "cls": "hours"},
          fees={"v": {"ticket": "light-sound-show", "rows": [
              {"who": "indian", "label": L("Indian adult", "भारतीय वयस्क"), "any": 250},
              {"who": "foreign", "label": L("Foreign adult", "विदेशी वयस्क"), "any": 700},
              {"who": "child", "label": L("Indian child 5–12", "भारतीय बच्चा 5–12"), "any": 100}]},
              "s": "officially confirmed", "src": "mpt-lightsound", "ver": READ, "cls": "fees"}),
    place("tighra-dam", L("Tighra Dam", "तिघरा बाँध"), L("Lake and picnic spot, 35 km out", "झील और पिकनिक स्पॉट, 35 किमी दूर"), ["nature"],
          [26.22096, 78.00314], L("One of the most preferred picnic spots, 35 km from Gwalior.", "सबसे पसंदीदा पिकनिक स्थलों में से एक, ग्वालियर से 35 किमी।"), "mpt-gwalior", visit=(60, 120)),
    place("db-city-mall", L("DB City Mall", "डीबी सिटी मॉल"), L("Shopping mall", "शॉपिंग मॉल"), ["modern", "food"],
          [26.20268, 78.21332], L("A shopping mall in the city, marked as DB City on OpenStreetMap.", "शहर का शॉपिंग मॉल, OpenStreetMap पर DB City नाम से।"), "osm-places", visit=(60, 120)),
    place("phool-bagh", L("Phool Bagh", "फूल बाग"), L("City park", "शहर का पार्क"), ["nature"],
          [26.21122, 78.1697], L("A park in the city, marked on OpenStreetMap.", "शहर का पार्क, OpenStreetMap पर।"), "osm-places", visit=(30, 60)),
]

INDORE = [
    # Renamed by its owner on 1 Aug 2026 (official site; the research ledger has the source). The id stays.
    place("phoenix-citadel", L("Phoenix Pride of India (formerly Phoenix Citadel)", "फ़ीनिक्स प्राइड ऑफ़ इंडिया (पहले फ़ीनिक्स सिटाडेल)"), L("Large shopping mall at MR 10 Junction", "एमआर 10 जंक्शन पर बड़ा शॉपिंग मॉल"), ["modern", "food"],
          [22.74681, 75.93608], L("The large mall at MR 10 Junction on the Indore bypass, called Phoenix Citadel until its owner renamed it in August 2026.", "इंदौर बायपास पर एमआर 10 जंक्शन का बड़ा मॉल, जिसे अगस्त 2026 तक फ़ीनिक्स सिटाडेल कहा जाता था।"), "phoenix-site", visit=(90, 180)),
    place("treasure-island", L("Treasure Island Mall", "ट्रेज़र आइलैंड मॉल"), L("Shopping mall on MG Road", "एमजी रोड पर शॉपिंग मॉल"), ["modern", "food"],
          [22.72157, 75.87862], L("Treasure Island (TI) mall on Mahatma Gandhi Marg, per OpenStreetMap.", "महात्मा गांधी मार्ग पर ट्रेज़र आइलैंड (TI) मॉल, OpenStreetMap के अनुसार।"), "osm-places", visit=(60, 120)),
    place("meghdoot-garden", L("Meghdoot Garden", "मेघदूत गार्डन"), L("City garden", "शहर का बगीचा"), ["nature"],
          [22.75066, 75.89202], L("A garden in the city, marked on OpenStreetMap.", "शहर का बगीचा, OpenStreetMap पर।"), "osm-places", visit=(30, 60)),
    place("mrignayani", L("Mrignayani Emporium", "मृगनयनी एम्पोरियम"), L("MP handicrafts and handlooms shop", "मध्य प्रदेश हस्तशिल्प और हथकरघा दुकान"), ["markets"],
          [22.71974, 75.85895], L("An exquisite collection of handicrafts and handlooms from across Madhya Pradesh, on MG Road.", "पूरे मध्य प्रदेश के हस्तशिल्प और हथकरघा का शानदार संग्रह, एमजी रोड पर।"), "mpt-indore", visit=(30, 60)),
    place("gulawat-lotus-valley", L("Gulawat Lotus Valley", "गुलावट लोटस वैली"), L("Lotus lake with a long bridge", "लंबे पुल वाली कमल झील"), ["nature"],
          [22.78503, 75.6946], L("A panoramic view of the lake and its surfaced lotuses, with a 100-metre bridge across the lake.", "झील और खिले कमलों का सुंदर नज़ारा, झील पर 100 मीटर का पुल।"), "mpt-indore", visit=(45, 90), lesser=True),
    place("ralamandal", L("Ralamandal Wildlife Sanctuary", "रालामंडल वन्यजीव अभयारण्य"), L("Forest sanctuary for walks and treks", "पैदल और ट्रेक के लिए जंगल"), ["nature", "activities"],
          [22.64347, 75.92003], L("A visual delight for nature lovers and trekkers.", "प्रकृति प्रेमियों और ट्रेकर्स के लिए सुंदर जगह।"), "mpt-indore", visit=(90, 180), lesser=True),
    place("patalpani", L("Patalpani Waterfall", "पातालपानी झरना"), L("Waterfall and picnic spot, 33 km out", "झरना और पिकनिक स्पॉट, 33 किमी दूर"), ["nature"],
          [22.50386, 75.79871], L("A popular picnic spot near Indore, 33 km from the city.", "इंदौर के पास लोकप्रिय पिकनिक स्पॉट, शहर से 33 किमी।"), "mpt-indore", visit=(60, 120)),
    place("choral-dam", L("Choral Dam", "चोरल बाँध"), L("Quiet reservoir in Mhow, 40 km out", "महू में शांत जलाशय, 40 किमी दूर"), ["nature"],
          [22.40373, 75.75166], L("Quiet and tranquil, 40 km from Indore in Mhow, an ideal weekend getaway.", "शांत और सुकून भरा, इंदौर से 40 किमी महू में, सप्ताहांत के लिए बढ़िया।"), "mpt-indore", visit=(60, 120)),
    # Added 25 Oct 2026 (deep search). Facts on hours and fees come from the research ledger via apply_research.py.
    place("indore-zoo", L("Indore Zoo (Kamla Nehru Prani Sangrahalaya)", "इंदौर चिड़ियाघर (कमला नेहरू प्राणी संग्रहालय)"), L("City zoo run by the municipal corporation", "नगर निगम का चिड़ियाघर"), ["nature", "activities"],
          [22.70099, 75.88127], L("The city zoo on Old A.B. Road, run by the Indore Municipal Corporation. Tickets can be booked online.", "पुराने ए.बी. रोड पर शहर का चिड़ियाघर, इंदौर नगर निगम द्वारा संचालित। टिकट ऑनलाइन बुक हो सकते हैं।"), "wiki-zoo", visit=(90, 150),
          guard={"status": "notEligible", "dailyLimit": None, "reason": L("No custodian publication of hours and fees found", "संरक्षक का समय और शुल्क प्रकाशन नहीं मिला")}),
    place("regional-park", L("Regional Park, Pipliyapala", "रीजनल पार्क, पिपलियापाला"), L("Lakeside park with boating", "नौका विहार वाला झील किनारे पार्क"), ["nature", "activities"],
          [22.677, 75.85613], L("Atal Bihari Vajpayee Regional Park, a lakeside park at Pipliyapala with gardens and boating.", "अटल बिहारी वाजपेयी रीजनल पार्क, पिपलियापाला में झील किनारे बगीचे और नौका विहार।"), "wiki-regional-park", visit=(60, 120)),
    place("gandhi-hall", L("Gandhi Hall", "गांधी हॉल"), L("Indo-Gothic town hall with a clock tower", "घंटाघर वाला इंडो-गॉथिक टाउन हॉल"), ["architecture", "royal"],
          [22.72025, 75.86688], L("Built as King Edward Hall from 1904, in red sandstone and white marble with a clock tower. Renamed Gandhi Hall after independence.", "1904 से किंग एडवर्ड हॉल के रूप में बना, लाल बलुआ पत्थर और सफ़ेद संगमरमर, घंटाघर के साथ। आज़ादी के बाद गांधी हॉल नाम मिला।"), "ot-gandhi-hall", visit=(15, 30), lesser=True),
    place("bhim-janmabhoomi", L("Bhim Janmabhoomi, Mhow", "भीम जन्मभूमि, महू"), L("Memorial at Dr. Ambedkar's birthplace", "डॉ. आंबेडकर के जन्मस्थान पर स्मारक"), ["museums"],
          [22.56893, 75.76089], L("Memorial and museum where Dr. B. R. Ambedkar was born in 1891, in Mhow (Dr. Ambedkar Nagar). Built 1994 to 2007, opened in 2008.", "महू (डॉ. आंबेडकर नगर) में 1891 में डॉ. बी. आर. आंबेडकर के जन्मस्थान पर स्मारक और संग्रहालय। 1994 से 2007 में बना, 2008 में खुला।"), "wiki-bhim", visit=(30, 60)),
    place("bijasan-mata", L("Bijasan Mata Temple", "बिजासन माता मंदिर"), L("Hilltop Devi temple near the airport", "हवाई अड्डे के पास पहाड़ी पर देवी मंदिर"), ["temples", "spiritual"],
          [22.73036, 75.79827], L("Hilltop temple of Bijasan Mata near the airport, with a fair every Navratri.", "हवाई अड्डे के पास पहाड़ी पर बिजासन माता का मंदिर, हर नवरात्रि में मेला।"), "wiki-bijasan", visit=(30, 60),
          guard={"status": "notEligible", "dailyLimit": None, "reason": L("Place of worship: never auto-planned (Decision 25)", "पूजा स्थल: अपने आप योजना में नहीं (निर्णय 25)")}),
]
INDORE += [
    place("pitra-parvat", L("Pitru Parvat (Pitreshwar Hanuman)", "पितृ पर्वत (पितरेश्वर हनुमान)"), L("Hill with a 72 ft Hanuman statue", "72 फ़ीट हनुमान प्रतिमा वाली पहाड़ी"), ["temples", "spiritual", "nature"],
          [22.75747, 75.77257], L("A hill on Bijasan Road with a 72 ft ashtadhatu statue of Hanuman in a meditative form, visible from far away.", "बिजासन रोड पर पहाड़ी, जहाँ हनुमान जी की 72 फ़ीट ऊँची अष्टधातु प्रतिमा ध्यान मुद्रा में है, दूर से दिखती है।"), "nic-pitra", visit=(30, 60), guard=WORSHIP,
          hours=H("06:00", "22:00", "gmaps", "About 6:00 to 22:00 (Google Maps listing)", "लगभग 6:00 से 22:00 (गूगल मैप्स सूची)", "unverified", ver="2026-10-25")),
    place("gommatgiri", L("Gommatgiri", "गोम्मटगिरी"), L("Jain hill shrine with a Bahubali statue", "बाहुबली प्रतिमा वाला जैन पहाड़ी तीर्थ"), ["temples", "spiritual"],
          [22.74569, 75.77331], L("A Digambar Jain hill shrine near the airport with a 21 ft statue of Bahubali and 24 small marble temples, built in 1981.", "हवाई अड्डे के पास दिगंबर जैन पहाड़ी तीर्थ, बाहुबली की 21 फ़ीट प्रतिमा और 24 छोटे संगमरमर मंदिर, 1981 में बना।"), "tt-gommatgiri", visit=(30, 60), guard=WORSHIP,
          hours=H("06:00", "19:00", "tt-gommatgiri", "About 6:00 to 19:00 (travel site)", "लगभग 6:00 से 19:00 (यात्रा साइट)", "unverified", ver="2026-10-25")),
    place("sirpur-lake", L("Sirpur Lake", "सिरपुर तालाब"), L("Wetland and bird area on Dhar Road", "धार रोड पर आर्द्रभूमि और पक्षी क्षेत्र"), ["nature"],
          [22.70056, 75.81278], L("An 800 acre lake and protected wetland run by the Indore Municipal Corporation, a Ramsar site since 2022.", "इंदौर नगर निगम का 800 एकड़ का तालाब और संरक्षित आर्द्रभूमि, 2022 से रामसर स्थल।"), "wiki-sirpur", visit=(45, 90), lesser=True),
    place("jam-gate", L("Jam Gate", "जाम गेट"), L("Ahilyabai's hill gateway and picnic spot, 50 km out", "अहिल्याबाई का पहाड़ी द्वार और पिकनिक स्थल, 50 किमी दूर"), ["nature", "royal"],
          [22.35718, 75.73542], L("A gateway on the Mhow to Mandleshwar road built by Ahilyabai Holkar in 1791, now a picnic spot with valley views.", "महू-मंडलेश्वर मार्ग पर अहिल्याबाई होलकर का 1791 का द्वार, अब घाटी के नज़ारों वाला पिकनिक स्थल।"), "wiki-jamgate", visit=(45, 90)),
]
for p in INDORE:
    if p["id"] in ("pitra-parvat", "gommatgiri"):
        p["sensitive"] = DRESS_UNKNOWN
    if p["id"] == "bijasan-mata":
        p["sensitive"] = {"kind": "worship", "dress": none("rules", "Not yet sourced from the temple. Ask at the site before you go.", "मंदिर से अभी प्राप्त नहीं। जाने से पहले स्थल पर पूछें।")}

GWALIOR += GWALIOR_MORE

# Baija Taal, 28 Oct 2026: named by the Gwalior resident Aditya interviewed in Round 1, who took him there (Decision 28
# record rule). Only its position is filled here. What Aditya saw on his visit goes in as his saarthi entries, so a second
# person reviews it before it changes the record.
SOURCES["gwalior"]["osm-baija"] = {"name": "OpenStreetMap, Baija Taal", "type": "official page", "evidence": "Pond, OSM way 1082100658, read 28 Oct 2026", "date": "2026-10-28"}
GWALIOR.append(place("baija-taal", L("Baija Taal", "बैजा ताल"), L("Lake next to Moti Mahal", "मोती महल के पास झील"), ["nature"],
                     [26.20802, 78.17128], L("A lake marked on OpenStreetMap, about 200 m west of Moti Mahal.", "OpenStreetMap पर दर्ज झील, मोती महल से लगभग 200 मीटर पश्चिम।"), "osm-baija",
                     visit=(30, 60), lesser=True, guard=NOT_PUB))

# Indore had no fare data. The only published rate found (28 Oct 2026) is the 2019 meter chart: Rs 14 for the first km,
# Rs 12 per km after. Bands below are that rate worked out by distance, labelled potentially outdated: meters are rarely used.
FPJ = "https://www.freepressjournal.in/indore/taxi-auto-fares-hiked-in-the-city"
SOURCES["indore"]["fpj-auto-2019"] = {"name": "Free Press Journal, Taxi, auto fares hiked in the City (Indore meter rate)", "type": "visitor report",
                                      "evidence": f"Rs 14 first km, Rs 12 per km after, from 1 Jul 2019. {FPJ}", "date": "2019-06-01"}


def meter_band(max_km, lo_km):
    fare = lambda k: 14 + 12 * max(0, k - 1)
    return {"mode": "auto", "maxKm": max_km, "min": fare(lo_km), "max": fare(max_km), "src": "fpj-auto-2019", "s": "potentially outdated", "ver": "2019-06-01", "cls": "fare",
            "t": L(f"Auto by the 2019 meter rate, {lo_km}–{max_km} km (meters are rarely used: agree the price first)",
                   f"2019 के मीटर रेट से ऑटो, {lo_km}–{max_km} किमी (मीटर कम चलते हैं: पहले दाम तय करें)")}


INDORE_FARES = [meter_band(2, 1), meter_band(5, 2), meter_band(10, 5), meter_band(20, 10), meter_band(60, 20)]

for city, extras in (("gwalior", GWALIOR), ("indore", INDORE)):
    path = DATA / f"{city}.json"
    d = json.loads(path.read_text(encoding="utf-8"))
    ids = {p["id"] for p in extras}
    d["places"] = [p for p in d["places"] if p["id"] not in ids] + extras
    d["sources"].update(SOURCES[city])
    d.pop("tips", None)  # city tips come only from approved saarthi entries (server side)
    d["sources"].pop("field-28oct", None)  # dropped 28 Oct: field facts go in as saarthi entries instead
    if city == "indore" and not [f for f in d.get("fares", []) if f.get("src") != "fpj-auto-2019"]:
        d["fares"] = INDORE_FARES
    path.write_text(json.dumps(d, ensure_ascii=False, indent=1), encoding="utf-8")
    print(city, len(d["places"]), "places")
