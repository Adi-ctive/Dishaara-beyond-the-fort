# Dishaara API (for Pranjal)

A working version of every endpoint below is in `app/backend` (FastAPI). It is the reference: build the real one to the same shapes, then point the app at it with `VITE_API_URL`. Run the tests with `npm run test:api` (27 tests).

Status 24 Oct 2026: live at https://dishaara.vercel.app/api on MongoDB Atlas (in-memory mongomock when MONGODB_URI is unset). 46 tests.

Added since 23 Oct (see the code for exact shapes):
- Accounts: `POST /auth/google {credential}` (Google ID token, checked server side), `POST /auth/staff {username, password}` (moderators, made with `python -m app.admin staff`), `GET /me`, `POST /me/apply-saarthi`. Sessions are JWT bearer tokens; roles are read from the database on each request.
- Social: `GET /feed`, `POST /posts`, `POST /posts/{id}/like|save {on}`, `GET|POST /posts/{id}/comments`, `POST /follow/{id} {on}`, `POST /report/{id} {kind}`, `GET /saarthis/{id}`, moderator `POST /mod/content/{kind}/{id}`, `POST /mod/users/{id}/ban`, `GET /mod/users`.
- Cities: `GET /cities/nearest?lat&lng`. Gamification: `GET /leaderboard?period=week|all`, `streak` in `/me/progress`.
- Chat now uses search over fact chunks (RAG) and an app guide; `/tts` streams ElevenLabs v3 audio and caches it in Mongo.

Rules that do not change:
- Facts always carry a label (one of 8), a date (`ver`) and a source (`src`). Missing facts have `v: null` and a `why`. Never a guess.
- Visit verdicts and plan timings are rules code (`src/core`, mirrored in `backend/app/rules.py`). The model never decides them.
- The chatbot never reads the database. `retrieve()` builds a facts pack; the model sees only the pack. Every number and place in its reply is checked; one rewrite, then `{ai: false}`.
- A saarthi never verifies their own entry. High-risk fields (fees, hours, weekly closing, last entry, safety) need a second saarthi or an official source.
- Religion is never stored (profile lines that state one are dropped).
- News reaches raahis only after a moderator approves it.

## Environment (server)
| Variable | Meaning | Default |
|---|---|---|
| `GROQ_KEY` | Chat model and voice input. Without it `/chat` returns `{ai: false, note: "no-key"}` and the app uses its rule answers | none |
| `ELEVENLABS_KEY` | Read-aloud voice. Without it `/tts` returns 204 and the app uses the browser voice | none |
| `ELEVENLABS_VOICE` | ElevenLabs voice id | a premade multilingual voice |
| `DWELL_SECONDS` | How long stamp readings must span | 60 |
| `COUNTER_CODE` | Demo counter code for stamps (real ones rotate at the counter) | `DEMO-QR` |
| `CORS_ORIGINS` | Allowed app origins, comma separated | `*` |

Auth: `POST /auth/google` returns a token. Send `Authorization: Bearer <token>`. No token = guest.

## Raahi
| Method and path | Body | Returns |
|---|---|---|
| `GET /health` | | `{ok, ai, tts, stt, today, dwellSeconds}` |
| `GET /cities` | | `[{id, name, places, checked}]` |
| `GET /cities/{id}/data` | | full checked data (Gwalior), names only (Indore) |
| `POST /auth/google` | `{name}` | `{token, user}` (mock until Aditya gives an OAuth client ID) |
| `GET/PUT /me/profile` | `{interests, prefs, prompt[]}` | profile |
| `POST /plans`, `PUT /plans/{id}`, `GET /plans/{id}` | `{input, order, done, added}` | saved plan |
| `POST /chat` | `{text, history[{role,text}], lang, prompt[], roadmap?}` | `{ai: true, text, placeIds}` or `{ai: false, note}` or `{emergency: true}` |
| `POST /stamps` | `{placeId, readings[{lat,lng,accuracy,t}], code?, ipCity?}` | `{status: confirmed/pending/rejected, rarity, points, checks[], testMode}` |
| `GET /me/stamps`, `GET /me/progress` | | stamps; `{points, level, stamps, rare, quiet, gwalior{got,total,tier}}` |
| `POST /feedback` | `{placeId, answers, note, proof?}` | `{ticket, points}` |
| `POST /still-true` | `{placeId, yes}` | counts; disagreement opens a saarthi ticket |
| `GET /alerts` | | approved alerts only |
| `GET /bazaar?route=a,b` | | listings near the route, plus sponsored |
| `POST /sos` | `{lat?, lng?}` | logged for moderators (the 112 call is a phone link) |
| `GET /tts?text=&lang=` | | `audio/mpeg`, or 204 when no key |
| `POST /stt` | multipart `audio`, `lang` | `{text}`, or 503 when no key |

Stamp checks, in order: inside the place boundary (250 m), GPS accuracy (50 m, soft), readings spanning `DWELL_SECONDS`, no impossible travel since the last stamp (over 60 km/h), network city (soft). Counter code confirms on its own. Hard fail = rejected, soft fail = pending.

## Saarthi
| Method and path | Body | Returns |
|---|---|---|
| `GET /saarthi/me` | | profile with due, toVerify, openTickets |
| `POST /facts` | `{placeId, field, value, label, proof[]}` | entry with `risk` and `status: pending` |
| `GET /verify-queue`, `POST /verify/{id}` | `{ok, by, note}` | 403 when verifying your own |
| `GET /tickets`, `POST /tickets/{id}/answer` | `{answer, escalate}` | ticket; escalation goes to moderators |
| `POST /posts` | `{kind: fact/blog/video, text, placeId?}` | post `in review` |

## Business
| Method and path | Body | Returns |
|---|---|---|
| `GET/PUT /business/me` | `{name, kind, tags, details, near}` (other keys ignored) | listing |
| `GET /business/me/comments` | | comments |
| `POST /business/me/sponsor-request` | | request, queued for moderators |

## Moderator
| Method and path | Body | Returns |
|---|---|---|
| `GET /mod/overview` | | counts |
| `GET /mod/queues`, `POST /mod/queues/{id}` | `{approve}` | applications, flags, escalations, listings |
| `GET/PUT /mod/twists` | `{closed[], budgetHalf, rain, festival, testMode}` | twists; raahi apps poll every 5 s and replan |
| `GET /mod/sos` | | emergency presses |
| `GET /mod/news`, `POST /mod/news/{id}` | `{approve}` | news findings |
| `POST /reset` | | demo only: back to seed state |

## Added 25 Oct 2026 (Account A, session 4e9bda71)
| Method | Path | Who | What |
|---|---|---|---|
| POST | /me/read/{placeId} | signed in | Counts a place page read (quest "read 3 place pages"), once per place |
| GET | /me/quests | signed in | Quest progress from recorded events; pays each quest once when done |
| GET | /me/stamps, /me/progress | signed in | Stamps and badge counts (feedback, food, night, cities, indoreStamps) from the server |
| GET | /me/plans | signed in | Saved day plans (travel history) |
| POST | /me/apply-business | signed in | Lists a shop: {name, kind, city, near, details, phone, lat, lng}. Goes to the moderator queue as kind "business" |
| GET/PUT | /business/me | owner / business role | The owner's own shop with followers, commentCount, visits. PUT needs the business role (given on approval) |
| GET | /business/me/comments | business | Comments on the owner's posts and shop |
| GET | /bazaar?city=&route= | anyone | Live shops only (approved by a moderator) |
| GET | /bazaar/{id} | anyone | One shop, with following and visitedToday for the signed-in raahi |
| GET/POST | /bazaar/{id}/comments | read: anyone, write: signed in | Short notes on a shop |
| POST | /bazaar/{id}/visit | signed in | "I visited": 5 points once a day per shop |
| GET | /alerts?city= | anyone | Live weather (Open-Meteo, cached 4 h) and moderator-approved news. Pulls today's news for review once a day per city |
| GET | /weather?city= | anyone | The cached weather reading |
| GET | /mod/news | moderator | Pending news first, both cities |
| POST | /verify/{id} | saarthi | Approving writes the entry into the place record (cities.apply_entry); re-imports keep it |

Removed: all sample seeding (tickets, verify, queue, alerts, news, bazaar, the shared sample business). Old samples are deleted on start.
Chat: the facts pack now carries access, facilities, contact, notes, thingsToDo, questionsPeopleAsk and cityNumbers.

### Added late 25 Oct
| Method | Path | Who | What |
|---|---|---|---|
| POST | /proofs | saarthi | Photo (JPEG, PNG, WebP, 2 MB) or voice note / short video (audio/*, video/mp4, webm, quicktime, 4 MB). Returns {id, type} |
| POST | /business/me/photos | business | Shop photo (2 MB, up to 6). Returns the shop with `photos` |
| DELETE | /business/me/photos/{id} | business | Removes a shop photo |
| GET | /media/{id} | anyone | A shop photo (public, cached 7 days) |
