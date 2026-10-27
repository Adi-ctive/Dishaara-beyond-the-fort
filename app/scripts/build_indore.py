"""Builds src/data/indore.json from what was found on 22 Oct 2026. Run: python scripts/build_indore.py

Rules (same as Gwalior): official pages are "officially confirmed" with their date (or the date
read when undated). Travel sites are "recently reported". When sources disagree the fact is
"conflicting" and the app shows no number, only the advice. Anything not found is unavailable
with a reason. Map positions come from OpenStreetMap; visit lengths are team estimates.
Level 1 needs the custodian's own publication: only the Central Museum has one so far. A saarthi's
photo of a ticket board at the site (locally verified) is what unlocks the others.
"""
import json
from pathlib import Path

READ = "2026-10-22"
OUT = Path(__file__).resolve().parents[1] / "src" / "data" / "indore.json"

SOURCES = {
    "mpt-indore": {"name": "MP Tourism, \"Regal Indore\" destination page", "type": "official page", "evidence": "Undated (footer copyright 2020), read 22 Oct 2026", "date": READ},
    "mpt-central": {"name": "MP Tourism, Central Museum Indore page", "type": "official page", "evidence": "Undated, read 22 Oct 2026. Gives 10:00 to 17:00, closed Mondays and govt holidays, Rs 20 Indians, Rs 400 foreigners", "date": READ},
    "ii-indore": {"name": "Incredible India (Ministry of Tourism), Top ten places to see in Indore", "type": "official page", "evidence": "Undated, read 22 Oct 2026. Says Lal Bagh Palace is closed on Mondays", "date": READ},
    "wiki-rajwada": {"name": "Wikipedia, Rajwada", "type": "visitor report", "evidence": "Says Indore Municipal Corporation renovated it 2017 to 2023 and it reopened in Feb 2023", "date": READ},
    "travel-rajwada": {"name": "Travel sites on Rajwada (TravelTriangle, Tripp Diary, chalbanjare, YoMetro)", "type": "visitor report", "evidence": "Indian fee given as Rs 5, Rs 10, Rs 30 or free; hours 10:00-17:00 or 11:00-19:00; closed Monday, Sunday or never", "date": READ},
    "travel-lalbagh": {"name": "Travel sites on Lal Bagh Palace (YoMetro, TravelTriangle, mnmtravels, chalbanjare)", "type": "visitor report", "evidence": "Hours mostly 10:00-17:00; Indian fee given as Rs 10, 20, 25, 30 or 50", "date": READ},
    "travel-sarafa": {"name": "Travel sites on Sarafa Bazaar (travell.cc, airial, indoreonline)", "type": "visitor report", "evidence": "Food stalls from about 20:00 to 21:00 until about 01:00 to 02:00; one older guide says 22:00 to 04:00", "date": READ},
    "travel-khajrana": {"name": "Temple listings on Khajrana Ganesh (yatradham, templepurohit, bharattemples)", "type": "visitor report", "evidence": "Darshan about 05:00-12:00 and 16:00-20:00 or 21:00; no official timetable found", "date": READ},
    "wiki-chhatri": {"name": "Wikipedia and Wikidata, Krishnapura Chhatri", "type": "visitor report", "evidence": "Holkar cenotaphs on the Khan river; Wikidata Q60751126 gives the position", "date": READ},
    "travel-chhatri": {"name": "Travel sites on Krishnapura Chhatris (yometro, indorecity, travejar, airial)", "type": "visitor report", "evidence": "Entry free; hours given as 9:00-17:00, 5:00-19:00 or 6:00-20:00", "date": READ},
    "osm": {"name": "OpenStreetMap (Nominatim search)", "type": "official page", "evidence": "Map positions looked up 22 Oct 2026", "date": READ},
    "team-estimate": {"name": "Argus team estimate (not sourced)", "type": "team observation", "evidence": "Planning default; replace with a surveyed value", "date": READ},
}


def L(en, hi):
    return {"en": en, "hi": hi}


def none(cls, en, hi):
    return {"v": None, "cls": cls, "why": L(en, hi)}


NOT_FOUND = lambda cls: none(cls, "No official source found yet", "अभी कोई आधिकारिक स्रोत नहीं मिला")


def est_visit(lo, hi):
    return {"v": lo, "rec": hi, "s": "estimated", "src": "team-estimate", "ver": READ, "cls": "hours"}


def free_unverified(src, label_en="Everyone", label_hi="सभी"):
    rows = [{"who": w, "label": L(label_en, label_hi), "any": 0} for w in ("indian", "foreign", "child")]
    return {"v": {"ticket": "free", "rows": rows}, "t": L("Free entry (not confirmed by an official source)", "प्रवेश निःशुल्क (आधिकारिक स्रोत से पुष्ट नहीं)"), "s": "recently reported", "src": src, "ver": READ, "cls": "fees"}


def place(pid, name, type_, tags, units, *, guard, summary, rules=(), sensitive=None, lesser=False):
    p = {"id": pid, "name": name, "type": type_, "tags": list(tags), "lesserKnown": lesser, "insideFort": False,
         "guardrail": guard, "summary": summary,
         "contact": none("rules", "Contact not found", "संपर्क नहीं मिला"),
         "accessibility": none("rules", "No sourced accessibility information", "पहुँच-योग्यता की कोई स्रोतित जानकारी नहीं"),
         "facilities": NOT_FOUND("hours"), "rules": list(rules), "notes": [], "units": units}
    if sensitive:
        p["sensitive"] = sensitive
    return p


def unit(uid, name, coord, *, custodian, hours, closed, fees, visit, last=None, ticket=None):
    return {"id": uid, "name": name, "custodian": custodian, "coord": coord, "hours": hours, "weeklyClosed": closed,
            "lastEntry": last or none("hours", "Last entry not published", "अंतिम प्रवेश प्रकाशित नहीं"),
            "ticket": ticket or uid, "fees": fees, "payment": none("fees", "Payment modes not stated", "भुगतान के तरीके नहीं बताए गए"),
            "minVisit": visit}


WORSHIP = {"kind": "worship",
           "dress": none("rules", "Not yet sourced from the temple. Ask at the site before you go.", "मंदिर से अभी प्राप्त नहीं। जाने से पहले स्थल पर पूछें।"),
           "worship": none("rules", "Not yet sourced from the temple. Ask at the site before you go.", "मंदिर से अभी प्राप्त नहीं। जाने से पहले स्थल पर पूछें।")}
NOT_ELIGIBLE_WORSHIP = {"status": "notEligible", "dailyLimit": None, "reason": L("Active place of worship: never Level 1", "सक्रिय पूजा स्थल: कभी स्तर 1 नहीं")}
NO_PUBLICATION = {"status": "level1", "dailyLimit": None,
                  "publication": none("fees", "No custodian publication of hours and tickets found yet. A saarthi's photo of the ticket board will unlock planning.", "संरक्षक का समय और टिकट का प्रकाशन अभी नहीं मिला। साथी की टिकट बोर्ड की फ़ोटो से प्लानिंग खुलेगी।")}

places = [
    place("rajwada", L("Rajwada", "राजवाड़ा"), L("Holkar palace in the old city", "पुराने शहर में होलकर महल"), ["architecture", "royal"],
          [unit("rajwada", L("Rajwada", "राजवाड़ा"), [22.7180, 75.8548],
                custodian=none("rules", "Custodian not confirmed (one encyclopedia says Indore Municipal Corporation renovated it)", "संरक्षक पुष्ट नहीं (एक विश्वकोश के अनुसार इंदौर नगर निगम ने मरम्मत की)"),
                hours={"v": None, "s": "conflicting", "cls": "hours", "src": "travel-rajwada", "ver": READ,
                       "why": L("Travel sites disagree (10:00 to 17:00, or 11:00 to 19:00). No official timing found. Check at the gate.", "यात्रा साइटें अलग-अलग समय बताती हैं। आधिकारिक समय नहीं मिला। गेट पर पूछें।")},
                closed={"v": None, "s": "conflicting", "cls": "hours", "src": "travel-rajwada", "ver": READ,
                        "why": L("Travel sites say closed Monday, closed Sunday, or open daily. Check before going.", "यात्रा साइटें सोमवार, रविवार या रोज़ खुला बताती हैं। जाने से पहले पता करें।")},
                fees={"v": None, "s": "conflicting", "cls": "fees", "src": "travel-rajwada", "ver": READ,
                      "why": L("Travel sites give different prices, and one says free. No official price found. Check at the counter.", "यात्रा साइटें अलग-अलग कीमत बताती हैं, एक निःशुल्क कहती है। आधिकारिक कीमत नहीं मिली। काउंटर पर पूछें।")},
                visit=est_visit(45, 60))],
          guard=NO_PUBLICATION,
          summary={"t": L("Popularly known as the Holkar Palace, a 7-storeyed structure built by the Holkars, near Khajuri Bazar.", "होलकर महल के नाम से प्रसिद्ध, होलकरों का बनवाया 7 मंज़िला भवन, खजूरी बाज़ार के पास।"), "s": "officially confirmed", "src": "mpt-indore", "ver": READ, "cls": "history"}),
    place("lal-bagh", L("Lal Bagh Palace", "लाल बाग पैलेस"), L("Holkar palace, part of it a museum", "होलकर महल, एक हिस्सा संग्रहालय"), ["architecture", "royal", "museums"],
          [unit("lal-bagh", L("Lal Bagh Palace", "लाल बाग पैलेस"), [22.7025, 75.8468],
                custodian=none("rules", "Custodian not confirmed from an official page", "संरक्षक आधिकारिक पेज से पुष्ट नहीं"),
                hours={"v": {"kind": "fixed", "open": "10:00", "close": "17:00"}, "t": L("10:00–17:00", "10:00–17:00"), "s": "recently reported", "src": "travel-lalbagh", "ver": READ, "cls": "hours"},
                closed={"v": [1], "t": L("Closed Mondays", "सोमवार को बंद"), "s": "officially confirmed", "src": "ii-indore", "ver": READ, "cls": "hours"},
                fees={"v": None, "s": "conflicting", "cls": "fees", "src": "travel-lalbagh", "ver": READ,
                      "why": L("Travel sites give five different prices for Indians. No official price found. Check at the counter.", "यात्रा साइटें भारतीयों के लिए पाँच अलग कीमतें बताती हैं। आधिकारिक कीमत नहीं मिली। काउंटर पर पूछें।")},
                visit=est_visit(60, 90))],
          guard=NO_PUBLICATION,
          summary={"t": L("A European-styled palace of the Holkars, now housing paintings and a coin collection.", "होलकरों का यूरोपीय शैली का महल, अब इसमें चित्र और सिक्कों का संग्रह है।"), "s": "officially confirmed", "src": "ii-indore", "ver": READ, "cls": "history"}),
    place("central-museum", L("Central Museum, Indore", "केंद्रीय संग्रहालय, इंदौर"), L("State museum of sculpture, coins and inscriptions", "मूर्तियों, सिक्कों और शिलालेखों का राज्य संग्रहालय"), ["museums", "architecture"],
          [unit("central-museum", L("Central Museum, Indore", "केंद्रीय संग्रहालय, इंदौर"), [22.7052, 75.8793],
                custodian=none("rules", "Custodian not named on the page found", "मिले पेज पर संरक्षक का नाम नहीं"),
                hours={"v": {"kind": "fixed", "open": "10:00", "close": "17:00"}, "t": L("10:00–17:00", "10:00–17:00"), "s": "officially confirmed", "src": "mpt-central", "ver": READ, "cls": "hours"},
                closed={"v": [1], "t": L("Closed Mondays and government holidays", "सोमवार और सरकारी छुट्टियों पर बंद"), "s": "officially confirmed", "src": "mpt-central", "ver": READ, "cls": "hours"},
                fees={"v": {"ticket": "central-museum", "rows": [
                    {"who": "indian", "label": L("Indian", "भारतीय"), "any": 20},
                    {"who": "foreign", "label": L("Foreign", "विदेशी"), "any": 400},
                    {"who": "child", "label": L("Children", "बच्चे"), "any": None}]},
                      "s": "officially confirmed", "src": "mpt-central", "ver": READ, "cls": "fees"},
                visit=est_visit(45, 75),
                last={"v": "none", "t": L("No separate last entry published", "अलग अंतिम प्रवेश प्रकाशित नहीं"), "s": "officially confirmed", "src": "mpt-central", "ver": READ, "cls": "hours"})],
          guard={"status": "level1", "dailyLimit": None,
                 "publication": {"t": L("MP Tourism page: open 10:00 to 17:00, Rs 20 for Indians", "MP टूरिज़्म पेज: 10:00 से 17:00 खुला, भारतीयों के लिए ₹20"), "s": "officially confirmed", "src": "mpt-central", "ver": READ, "cls": "fees"}},
          summary={"t": L("Near GPO Square. One of the best collections of ancient and medieval Hindu and Jain sculptures from Madhya Pradesh.", "GPO चौराहे के पास। मध्य प्रदेश की प्राचीन और मध्यकालीन हिंदू और जैन मूर्तियों का बेहतरीन संग्रह।"), "s": "officially confirmed", "src": "mpt-central", "ver": READ, "cls": "history"},
          lesser=True),
    place("sarafa", L("Sarafa Bazaar", "सराफ़ा बाज़ार"), L("Jewellery market by day, street-food market by night", "दिन में ज़ेवर बाज़ार, रात में खाने का बाज़ार"), ["food", "markets"],
          [unit("sarafa", L("Sarafa Bazaar", "सराफ़ा बाज़ार"), [22.7179, 75.8519],
                custodian=none("rules", "Public street market, no custodian", "सार्वजनिक बाज़ार, कोई संरक्षक नहीं"),
                hours={"v": {"kind": "fixed", "open": "20:00", "close": "23:59"}, "t": L("Food stalls from about 20:00 to 21:00, until late night", "खाने के ठेले लगभग 20:00–21:00 से देर रात तक"), "s": "recently reported", "src": "travel-sarafa", "ver": READ, "cls": "hours"},
                closed=none("hours", "No weekly closing found for the food stalls", "खाने के ठेलों की साप्ताहिक बंदी नहीं मिली"),
                fees=free_unverified("travel-sarafa", "Free to walk in, you pay for food", "घूमना मुफ़्त, खाने का पैसा"),
                visit=est_visit(45, 90))],
          guard={"status": "notEligible", "dailyLimit": None, "reason": L("Unticketed public market: never Level 1", "बिना टिकट का सार्वजनिक बाज़ार: कभी स्तर 1 नहीं")},
          summary={"t": L("A glistening jewellery market during the day and a chat food bazaar by night, close to Rajwada.", "दिन में चमकता ज़ेवर बाज़ार और रात में चाट का बाज़ार, राजवाड़ा के पास।"), "s": "officially confirmed", "src": "mpt-indore", "ver": READ, "cls": "history"},
          rules=[{"kind": "safety", "t": L("Very crowded late at night. Keep your phone and wallet close.", "देर रात बहुत भीड़। फ़ोन और बटुआ संभालकर रखें।"), "s": "estimated", "src": "team-estimate", "ver": READ, "cls": "rules"}]),
    place("kanch-mandir", L("Kanch Mandir", "कांच मंदिर"), L("Jain temple made of glass and mirrors", "कांच और शीशों से बना जैन मंदिर"), ["spiritual", "architecture"],
          [unit("kanch-mandir", L("Kanch Mandir", "कांच मंदिर"), [22.7165, 75.8490],
                custodian=none("rules", "Managing trust not found", "प्रबंधक ट्रस्ट नहीं मिला"),
                hours=NOT_FOUND("hours"), closed=none("hours", "Not found", "नहीं मिला"), fees=NOT_FOUND("fees"), visit=est_visit(20, 30))],
          guard=NOT_ELIGIBLE_WORSHIP, sensitive=WORSHIP,
          summary={"t": L("Built by Sir Hukamchand Seth in the early 20th century, made entirely of glass and mirrors.", "20वीं सदी की शुरुआत में सर हुकुमचंद सेठ ने बनवाया, पूरा कांच और शीशों से बना।"), "s": "officially confirmed", "src": "mpt-indore", "ver": READ, "cls": "history"}),
    place("khajrana", L("Khajrana Ganesh Temple", "खजराना गणेश मंदिर"), L("Ganesh temple built by Rani Ahilyabai Holkar", "रानी अहिल्याबाई होलकर का बनवाया गणेश मंदिर"), ["spiritual", "temples"],
          [unit("khajrana", L("Khajrana Ganesh Temple", "खजराना गणेश मंदिर"), [22.7312, 75.9081],
                custodian=none("rules", "Managing trust not confirmed", "प्रबंधक ट्रस्ट पुष्ट नहीं"),
                hours={"v": None, "s": "conflicting", "cls": "hours", "src": "travel-khajrana", "ver": READ,
                       "why": L("Temple listings give darshan in the morning and evening, with different closing times. No official timetable found.", "मंदिर सूचियाँ सुबह और शाम दर्शन बताती हैं, बंद होने का समय अलग-अलग। आधिकारिक समय-सारणी नहीं मिली।")},
                closed=none("hours", "No weekly closing found", "साप्ताहिक बंदी नहीं मिली"), fees=NOT_FOUND("fees"), visit=est_visit(30, 45))],
          guard=NOT_ELIGIBLE_WORSHIP, sensitive=WORSHIP,
          summary={"t": L("Rani Ahilyabai Holkar built the Khajrana Ganesha Temple of Indore.", "रानी अहिल्याबाई होलकर ने इंदौर का खजराना गणेश मंदिर बनवाया।"), "s": "officially confirmed", "src": "mpt-indore", "ver": READ, "cls": "history"}),
    place("bada-ganpati", L("Bada Ganpati", "बड़ा गणपति"), L("Temple with one of the largest Ganesh idols", "सबसे बड़ी गणेश प्रतिमाओं में से एक वाला मंदिर"), ["spiritual", "temples"],
          [unit("bada-ganpati", L("Bada Ganpati", "बड़ा गणपति"), [22.7205, 75.8419],
                custodian=none("rules", "Managing trust not found", "प्रबंधक ट्रस्ट नहीं मिला"),
                hours=NOT_FOUND("hours"), closed=none("hours", "Not found", "नहीं मिला"), fees=NOT_FOUND("fees"), visit=est_visit(20, 30))],
          guard=NOT_ELIGIBLE_WORSHIP, sensitive=WORSHIP,
          summary={"t": L("Has one of the biggest statues of Lord Ganpati, 25 feet from crown to foot.", "भगवान गणपति की सबसे बड़ी प्रतिमाओं में से एक, मुकुट से पैर तक 25 फ़ुट।"), "s": "officially confirmed", "src": "mpt-indore", "ver": READ, "cls": "history"}),
    place("annapurna", L("Annapurna Mandir", "अन्नपूर्णा मंदिर"), L("Temple complex of Annapurna Devi", "अन्नपूर्णा देवी का मंदिर परिसर"), ["spiritual", "temples"],
          [unit("annapurna", L("Annapurna Mandir", "अन्नपूर्णा मंदिर"), [22.6901, 75.8382],
                custodian=none("rules", "Managing trust not found", "प्रबंधक ट्रस्ट नहीं मिला"),
                hours=NOT_FOUND("hours"), closed=none("hours", "Not found", "नहीं मिला"), fees=NOT_FOUND("fees"), visit=est_visit(20, 40))],
          guard=NOT_ELIGIBLE_WORSHIP, sensitive=WORSHIP,
          summary={"t": L("The complex's main temple is devoted to Annapurna Devi, near Lal Bagh Palace.", "परिसर का मुख्य मंदिर अन्नपूर्णा देवी को समर्पित है, लाल बाग पैलेस के पास।"), "s": "officially confirmed", "src": "mpt-indore", "ver": READ, "cls": "history"}),
    place("krishnapura-chhatri", L("Krishnapura Chhatris", "कृष्णपुरा छत्री"), L("Holkar cenotaphs on the Khan river", "खान नदी किनारे होलकर छत्रियाँ"), ["architecture", "royal"],
          [unit("krishnapura-chhatri", L("Krishnapura Chhatris", "कृष्णपुरा छत्री"), [22.7189, 75.8581],
                custodian=none("rules", "Custodian not confirmed", "संरक्षक पुष्ट नहीं"),
                hours={"v": None, "s": "conflicting", "cls": "hours", "src": "travel-chhatri", "ver": READ,
                       "why": L("Travel sites give three different timings. No official timing found. Go in daylight.", "यात्रा साइटें तीन अलग समय बताती हैं। आधिकारिक समय नहीं मिला। दिन के उजाले में जाएँ।")},
                closed=none("hours", "No weekly closing found", "साप्ताहिक बंदी नहीं मिली"),
                fees=free_unverified("travel-chhatri"),
                visit=est_visit(20, 40))],
          guard={"status": "notEligible", "dailyLimit": None, "reason": L("Unticketed memorial: never Level 1", "बिना टिकट का स्मारक: कभी स्तर 1 नहीं")},
          summary={"t": L("A group of Holkar-era cenotaphs on the bank of the Khan river, about half a kilometre from Rajwada.", "खान नदी के किनारे होलकर काल की छत्रियों का समूह, राजवाड़ा से लगभग आधा किलोमीटर।"), "s": "recently reported", "src": "wiki-chhatri", "ver": READ, "cls": "history"},
          lesser=True),
    place("56-dukan", L("56 Dukan", "56 दुकान"), L("Food street", "खाने की गली"), ["food", "markets"],
          [unit("56-dukan", L("56 Dukan", "56 दुकान"), [22.7240, 75.8845],
                custodian=none("rules", "Public food street, no custodian", "सार्वजनिक खाने की गली, कोई संरक्षक नहीं"),
                hours=none("hours", "Shop hours vary and no source gives them", "दुकानों का समय अलग-अलग, किसी स्रोत में नहीं"),
                closed=none("hours", "No weekly closing found", "साप्ताहिक बंदी नहीं मिली"),
                fees={"v": {"ticket": "free", "rows": [{"who": w, "label": L("Free to walk in, you pay for food", "घूमना मुफ़्त, खाने का पैसा"), "any": 0} for w in ("indian", "foreign", "child")]},
                      "t": L("Free to walk in", "घूमना मुफ़्त"), "s": "estimated", "src": "team-estimate", "ver": READ, "cls": "fees"},
                visit=est_visit(30, 60))],
          guard={"status": "notEligible", "dailyLimit": None, "reason": L("Unticketed public market: never Level 1", "बिना टिकट का सार्वजनिक बाज़ार: कभी स्तर 1 नहीं")},
          summary={"t": L("A popular street in Indore which is always thronged by foodies.", "इंदौर की मशहूर गली, जहाँ हमेशा खाने के शौकीनों की भीड़ रहती है।"), "s": "officially confirmed", "src": "mpt-indore", "ver": READ, "cls": "history"}),
]

data = {
    "city": {"id": "indore", "name": L("Indore", "इंदौर"), "dataVersion": READ, "readAt": READ, "tz": 5.5, "center": [22.7196, 75.8577]},
    "emergency": "112",
    "sources": SOURCES,
    "landmarks": [
        {"id": "station", "name": L("Indore Junction", "इंदौर जंक्शन"), "coord": [22.7170, 75.8685]},
        {"id": "rajwada", "name": L("Rajwada", "राजवाड़ा"), "coord": [22.7180, 75.8548]},
    ],
    "fares": [],
    "stationFares": [],
    "places": places,
}
OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"wrote {OUT} with {len(places)} places")
