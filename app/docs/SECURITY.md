# Dishaara security rules

Written for OWASP ASVS 5.0 (Level 1 documentation requirements V2.1.1, V6.1.1, V8.1.1, V15.1.1). The rules below are
enforced in `backend/app` and covered by `backend/tests/test_security.py`.

## Who can do what (V8.1.1)
| Role | How they sign in | Can | Cannot |
|---|---|---|---|
| Guest | none | read places, the feed and the Bazaar; chat (rate-limited) | post, comment, save, stamp, file facts |
| Raahi (traveller) | Google, or an email test login | chat, plans, stamps, posts, comments, likes, feedback | see anyone else's chats, plans or stamps; file facts |
| Saarthi | as raahi, role granted by a moderator | file dated facts with proof; verify other saarthis' entries | approve their own entry; see proofs of other regions |
| Business | as raahi, shop approved by a moderator | edit only their own shop page and offers | edit another shop |
| Moderator | team username and password (never a test login) | review queues, twists, SOS, news, bans | approve their own fact entry |
Every rule is checked on the server (`need()` and owner checks on every record), never only in the app.
Records are found by id **and** owner: another user's id returns 404, not their data (BOLA / IDOR).

## Input rules (V2.1.1)
Every request body is a typed Pydantic model with length limits: chat text 1,000 characters, names 40, posts 1,000, comments 300,
up to 4 media per post, SOS latitude -90..90 and longitude -180..180, dates as YYYY-MM-DD with the end after the start,
labels only from the eight fact labels. HTML tags are stripped from every JSON body before it is read (`no_html_in`).
Uploads: photos JPEG, PNG or WebP up to 2 MB; clips and voice notes MP4, WebM, OGG, MP3, AAC, WAV up to 4 MB; the type is
checked against the file's own first bytes, not only the name or header.

## Sign-in, sessions and abuse limits (V6.1.1)
- Raahis sign in with Google (no password stored by us). Test and team logins use bcrypt-hashed passwords.
- Sign-in locks for 15 minutes after 8 wrong passwords for an account.
- Sessions: signed HS256 tokens, 30 days, each with its own id; signing out revokes it on the server at once.
- Rate limits (per account, or per network address for guests): chat 60 an hour signed in, 20 a guest; translate 60 an
  hour; read-aloud 40 an hour per address and 400 a day for the whole app; voice input 30 and 300; uploads 20 to 40 a day.
  Emergency messages are never rate-limited.

## The AI guide (OWASP Top 10 for LLM Applications 2025)
The model gets only a FACTS pack from our records and writes the words. Every number, place name and label in its reply is
checked against that pack before it is shown; a reply that fails is replaced by the plain answer from our records. It has no
tools that act (no booking, paying, messaging or deleting). Tested with 24 attacks across LLM01-LLM10:
`07_round2/security_standards/llm_top10_test.py`.

## Third-party components (V15.1.1)
- `npm audit --omit=dev` and `pip-audit` before every release.
- Critical or high: fix within 7 days, or record why it cannot be reached. Moderate: 30 days. Low: next planned update.
- Accepted on 30 Oct 2026: maplibre-gl 4.7.1, GHSA-jrc7-96c5-q579 (critical XSS in its HTML sanitizer). Not reachable here:
  the app never passes HTML to MapLibre (no popups, no `setHTML`, no custom attribution; pins are DOM elements we build).
  Version 6 (the fix) stopped rendering our map; upgrade after the event with a map test.
- Test-only tools (pytest, pip) are not deployed.
