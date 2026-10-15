# Interview 2 — Gwalior resident: evidence notes (15 Oct 2026)

Raw file: `sources/interview2_gwalior_resident.txt` (verbatim, unedited).

## Record
- Interviewer: Priyangi. Respondent: local resident of Gwalior (no respondent number given).
- Interview date: 14 Oct 2026. Answers: written (text), recorded exactly as given. Consent: taken (confirmed by Aditya, 15 Oct 2026). Received by the team: 15 Oct 2026.
- Label: [FIELD], n = 1. Answers are the respondent's own estimates; none is verified.

## What the respondent actually answered
The questionnaire has 7 sections (~30 questions). The respondent did not answer them one by one. The reply is:
1. A list of 12 old/historic places worth seeing: Gwalior Fort; Sas-Bahu Temple; Gujari Mahal (Archaeological Museum); Tansen tomb; Gurudwara Data Bandi Chhod; Rani Laxmibai Samadhi; Gopachal Jain Parvat; Jiwajirao Scindia Museum; Sun Temple; Mitawali and Bateshwar temples; Shani Dev Mandir; Maa Pitambara Peeth, Datia.
2. Groupings by distance: 1–5 "ek hi jagha hai fort ke aas paas" (one cluster around the fort); 6–8 in the city, short distance, can be covered together; Sun Temple on a different side; 10–11 are 40–60 km away, same direction, need a full day; 12 is about 70–80 km away.
3. Auto fare rule of thumb: about ₹15 per km.
4. "Baki details toh tere ko online bhi mil jayegi" (other details you'll find online).

## Where it can help (not yet applied to any document)
| Use | What it adds | Caveat |
|---|---|---|
| PS-3 / plan builder (SRS FR-PL, §12.2) | A resident's clustering of places into same-trip groups, and distance bands for the far sites | Estimates, not measured; leg times still come from the routing API or are labelled "estimated" |
| PS-3 fares | Local rule of thumb ≈ ₹15/km for autos | One person's estimate; no official fare chart exists (validation Q17). Store as "estimated / locally reported", never as a fare |
| PS-2 discovery | What a resident considers worth seeing, including places outside the SRS seed list (Gopachal, Samadhi, Mitawali/Bateshwar, Shani Dev, Pitambara Peeth) | Says what is worth seeing, not why visitors skip it; does not test awareness vs time |
| SRS §12.2 seed / Decision 25 | Candidate places for later releases | Under Decision 25, Gopachal and Rani Laxmibai Samadhi stay out at Level 1 until a custodian publication shows them open and ticketed; active places of worship are never Level 1 |

## Conflict to resolve before using the grouping
- The respondent puts the Tansen tomb in the fort cluster ("ye sb fort me hi hai"). Desk records (validation Q25, Q34) list the Tansen tomb at Ghauspura as a separate ASI entry, not inside the fort. Treat the grouping of item 4 as unverified.

## What it does not give us
- No answers on resident burden (PS-4 section 4): parking, noise, litter, places locals don't want tourists, unstaffed sites. This remains the biggest evidence gap.
- No answers on wrong online information, separate fort tickets, overcharging, buses, Urwai Gate, vendors, guides, stay length, evenings or change over time.
- "Details are online" is the respondent's opinion; it does not contradict PS-1's desk evidence (wrong and conflicting online facts) but it is not support for it either.
