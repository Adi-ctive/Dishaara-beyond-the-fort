"""Seasonal events per city (29 Oct 2026): fairs, festivals and seasons a raahi planning ahead should know about.

Only events with a source we read. Exact dates when a source gives them for a year (`from`/`to`), otherwise a yearly
window (`window`, "MM-DD" to "MM-DD", may wrap over New Year) labelled historical pattern. Writes data.events and the
sources into src/data/<city>.json and bumps city.dataVersion so the live server re-imports.
  python scripts/build_events.py
"""
import json
from datetime import datetime
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "src" / "data"

SOURCES = {
    "gwalior": {
        "zee-tradefair-2024": {"name": "Zee News (Hindi), Gwalior trade fair will run from 25 December to 25 February", "type": "news report",
                               "evidence": "Published 4 Nov 2024 for the 2024-25 fair: 25 Dec to 25 Feb, about 104 acres near Sagar Taal ground, 50% road tax rebate on vehicles bought at the fair", "date": "2024-11-04"},
        "wiki-tradefair": {"name": "Wikipedia, Gwalior trade fair", "type": "encyclopedia", "evidence": "Mela Ground, Race Course Road, 104 acres, run by the Gwalior Trade Fair Authority, started 1905. Read 29 Oct 2026", "date": "2026-10-29"},
        "mpt-tansen-2026": {"name": "MP Tourism, 102nd Tansen Sangeet Samaroh 2026", "type": "official page",
                            "evidence": "14 to 19 December 2026 at Tansen Samadhi Sthal, Gwalior, no entry fee. Organised by Ustad Alauddin Khan Sangeet Evam Kala Akademi (MP Department of Culture). Read 29 Oct 2026", "date": "2026-10-29"},
        "ii-tansen-2026": {"name": "Incredible India, Tansen Music Festival", "type": "official page", "evidence": "14-19 Dec 2026. Read 29 Oct 2026", "date": "2026-10-29"},
    },
    "indore": {
        "ii-rangpanchami-2027": {"name": "Incredible India, Rangpanchami Ger Mahotsav", "type": "official page",
                                 "evidence": "27 March 2027 at Rajwada, Indore: the Ger procession of the Holkar era, five days after Holi. Read 29 Oct 2026", "date": "2026-10-29"},
        "indore-nic-festivals": {"name": "Indore district (indore.nic.in), Festivals", "type": "official page",
                                 "evidence": "Rangpanchami in March, five days after Holi; Anant Chaturdashi in September, the last day of Ganesh Chaturthi. Page updated 24 May 2019", "date": "2019-05-24"},
        "ind24-jhanki-2026": {"name": "Ind24, Indore Anant Chaturdashi 2026 jhanki", "type": "news report", "evidence": "The jhanki procession on 25 September 2026", "date": "2026-09"},
        "travel-gulawat-season": {"name": "TravelTriangle and Veena World, Gulawat Lotus Valley", "type": "travel sites",
                                  "evidence": "Lotus bloom given as September to November by most, some say to February. No official source. Read 25 Oct 2026", "date": "2026-10-25"},
    },
}

EVENTS = {
    "gwalior": [
        {"id": "trade-fair", "name": {"en": "Gwalior Trade Fair (Vyapar Mela)", "hi": "ग्वालियर व्यापार मेला"},
         "about": {"en": "One of India's biggest trade fairs, running since 1905: hundreds of stalls, rides and food. Vehicles bought here have had a 50% road tax rebate.",
                   "hi": "1905 से लगने वाला देश के सबसे बड़े व्यापार मेलों में से एक: सैकड़ों दुकानें, झूले और खाना। यहाँ ख़रीदी गाड़ियों पर रोड टैक्स में 50% छूट मिलती रही है।"},
         "where": {"en": "Mela Ground, Race Course Road", "hi": "मेला मैदान, रेस कोर्स रोड"},
         "from": "2024-12-25", "to": "2025-02-25", "recurring": "yearly", "series": "trade-fair",
         "s": "recently reported", "src": "zee-tradefair-2024", "ver": "2024-11-04", "crowd": True,
         "watch": {"en": "Each season's dates are fixed by the Gwalior Trade Fair Authority; stall tenders open in early November, so local papers carry the dates then.",
                   "hi": "हर साल की तारीख़ें ग्वालियर व्यापार मेला प्राधिकरण तय करता है; नवंबर की शुरुआत में दुकानों के टेंडर खुलते हैं, तब स्थानीय अख़बारों में तारीख़ें आती हैं।"},
         "tip": {"en": "Evenings are very crowded and Race Course Road traffic slows.",
                 "hi": "शाम को बहुत भीड़ रहती है और रेस कोर्स रोड पर ट्रैफ़िक धीमा रहता है।"}},
        {"id": "tansen-samaroh-2026", "name": {"en": "Tansen Sangeet Samaroh (102nd)", "hi": "तानसेन संगीत समारोह (102वाँ)"},
         "about": {"en": "India's oldest classical music festival, held at Tansen's tomb. No entry fee.",
                   "hi": "देश का सबसे पुराना शास्त्रीय संगीत समारोह, तानसेन के मक़बरे पर। प्रवेश मुफ़्त।"},
         "where": {"en": "Tansen Samadhi Sthal (Tomb of Tansen)", "hi": "तानसेन समाधि स्थल"}, "place": "tansen-tomb",
         "from": "2026-12-14", "to": "2026-12-19", "recurring": "yearly", "series": "tansen-samaroh",
         "s": "officially confirmed", "src": "mpt-tansen-2026", "ver": "2026-10-29", "crowd": True,
         "watch": {"en": "Held every December. MP Tourism and the MP Department of Culture publish the dates and the line-up.",
                   "hi": "हर दिसंबर होता है। एमपी टूरिज़्म और संस्कृति विभाग तारीख़ें और कलाकारों की सूची जारी करते हैं।"},
         "tip": {"en": "Daily concert times are not published yet. Visiting the tomb itself may be busier those days.",
                 "hi": "रोज़ के कार्यक्रम का समय अभी प्रकाशित नहीं है। उन दिनों मक़बरे पर भीड़ ज़्यादा हो सकती है।"}},
    ],
    "indore": [
        {"id": "rangpanchami-2027", "name": {"en": "Rangpanchami Ger", "hi": "रंगपंचमी गेर"},
         "about": {"en": "The Holkar-era colour procession through the old city, five days after Holi.",
                   "hi": "होलकर काल से चली आ रही रंगों की गेर, होली के पाँच दिन बाद पुराने शहर में।"},
         "where": {"en": "Rajwada and the old city", "hi": "राजवाड़ा और पुराना शहर"}, "place": "rajwada",
         "from": "2027-03-27", "to": "2027-03-27", "recurring": "yearly-lunar", "series": "rangpanchami",
         "s": "officially confirmed", "src": "ii-rangpanchami-2027", "ver": "2026-10-29", "crowd": True,
         "watch": {"en": "Always five days after Holi, so the date moves each year with the Hindu calendar.",
                   "hi": "हमेशा होली के पाँच दिन बाद, इसलिए तारीख़ हर साल हिंदू पंचांग से बदलती है।"},
         "tip": {"en": "The old city around Rajwada is packed and soaked in colour: wear clothes you do not mind ruining.",
                 "hi": "राजवाड़ा के आसपास भारी भीड़ और रंग: ऐसे कपड़े पहनें जो ख़राब होने से फ़र्क़ न पड़े।"}},
        {"id": "anant-chaturdashi", "name": {"en": "Anant Chaturdashi jhanki procession", "hi": "अनंत चतुर्दशी झाँकी"},
         "about": {"en": "Night procession of lit tableaux on the last day of Ganesh Chaturthi, a 100-year tradition.",
                   "hi": "गणेश चतुर्थी के आख़िरी दिन रोशन झाँकियों का रात का जुलूस, सौ साल पुरानी परंपरा।"},
         "where": {"en": "Old city route, Rajwada area", "hi": "पुराने शहर का रास्ता, राजवाड़ा क्षेत्र"},
         "from": "2026-09-25", "to": "2026-09-25", "recurring": "yearly-lunar", "series": "anant-chaturdashi",
         "s": "recently reported", "src": "ind24-jhanki-2026", "ver": "2026-09", "crowd": True,
         "watch": {"en": "The last day of Ganesh Chaturthi, in September (Indore district site). The date follows the Hindu calendar.",
                   "hi": "गणेश चतुर्थी का आख़िरी दिन, सितंबर में (इंदौर ज़िला साइट)। तारीख़ हिंदू पंचांग से तय होती है।"},
         "tip": {"en": "Roads in the old city close for the night.", "hi": "रात को पुराने शहर की सड़कें बंद रहती हैं।"}},
        {"id": "gulawat-bloom", "name": {"en": "Lotus bloom at Gulawat", "hi": "गुलावट में कमल खिलना"},
         "about": {"en": "The lotus ponds of Gulawat are at their best.", "hi": "गुलावट के कमल तालाब सबसे सुंदर रहते हैं।"},
         "where": {"en": "Gulawat Lotus Valley", "hi": "गुलावट लोटस वैली"}, "place": "gulawat-lotus-valley",
         "window": {"start": "09-01", "end": "11-30"}, "recurring": "yearly", "s": "unverified", "src": "travel-gulawat-season", "ver": "2026-10-25", "crowd": False,
         "tip": {"en": "Travel sites disagree on how long the bloom lasts. No official source.", "hi": "फूल कब तक रहते हैं, इस पर यात्रा साइटें अलग बताती हैं। कोई आधिकारिक स्रोत नहीं।"}},
    ],
}

if __name__ == "__main__":
    version = datetime.now().strftime("%Y-%m-%dT%H:%M")
    for city, events in EVENTS.items():
        path = DATA / f"{city}.json"
        d = json.loads(path.read_text(encoding="utf-8"))
        d["events"] = events
        d["sources"].update(SOURCES[city])
        d["city"]["dataVersion"] = version
        path.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(city, len(events), "events")
