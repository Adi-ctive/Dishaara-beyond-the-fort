# Dishaara app (Round 2 rebuild)

Live test deploy: https://dishaara.vercel.app (Vercel CLI from this folder, not GitHub). Current state and how to deploy, reload data and manage accounts: `../HANDOFF.md`. Not pushed to GitHub before the event (see `../CLAUDE.md`). Plan and decisions: `../07_round2/`.

## Run it
| What | Command | Launch config (`C:\.claude\launch.json`) | Port |
|---|---|---|---|
| App on its own (demo state in the browser) | `npm run dev` | `dishaara-app` | 5174 |
| Backend | `backend\.venv\Scripts\python -m uvicorn app.main:app --app-dir backend --port 8010` | `dishaara-api` | 8010 |
| App talking to the backend | `npm run dev:api` (reads `.env.api`) | `dishaara-app-api` | 5175 |
| Production build, offline test | `npm run build`, then `npm run preview` | `dishaara-preview` | 4174 |
| Tests | `npm test` (63 pass, 1 live Groq test skipped without a key) and `npm run test:api` (46 pass, 1 live skipped) | | |
| Deploy | `vercel deploy --prod --yes` | | |

Keys go in the backend's environment only, never in a file that is committed: `GROQ_KEY` (chat and voice input), `ELEVENLABS_KEY` (read-aloud). Without them everything still works, using rule answers and the browser voice. For a quick check without the backend, a Groq key can be pasted in Settings > AI replies; it stays in that browser.

Add `?instant` to any address to skip animations (used for automated testing in a background tab).

Deep links for demos: `/?open=place.sas-bahu`, `/?open=passport`, `/?open=duel`, `/?open=diagram`; tabs by hash, `#roadmap`, `#map`, `#m-twist`.

## What is in it
- **Data and rules:** the Round 1 rules engine (`src/core`, tested) and checked Gwalior data (`src/data/gwalior.json`). Jai Vilas is "Sources disagree" with Priyangi's advisory. Indore has names only. Everything else is labelled Sample or Demo (`src/data/demo.ts`).
- **Sign-in rule (23 Oct, Aditya):** guests can plan a trip (chat, 3-tap plan, roadmap, map, place pages, Bazaar and feed to read, emergency). Everything that needs to know who you are asks for sign-in first: stamps, points, badges, levels, passport, quests, rewards, avatars, feedback, still-true taps, comments, likes, saves, follows, posts, becoming a saarthi, and the saarthi, business and moderator views. `src/ui/SignIn.tsx` (`useGate`, `MembersOnly`); guests never earn points (`award()` in `src/store.tsx`).
- **Social and Bazaar (23 Oct):** every Bazaar listing opens a page (storefront art, owner details, comments, follow, posts, show on map). A feed of saarthi and shop posts with likes, saves and follows: Bazaar tab > posts, Chat home, place pages, saarthi Posts tab (with a composer). Saarthi profile pages. Map: tap any pin for a preview card, swipe the place strip to fly to a place, shops on the map, "Show on map" from place and listing pages.
- **Art (23 Oct):** every place has its own illustrated cover and colours (`src/art/PlaceCover.tsx`, fort sections too). Eight avatars, six avatar frames, six profile banners (`src/art/Avatars.tsx`), badge medals (`src/art/Medal.tsx`), inked passport stamps, a level-up celebration (`src/ui/LevelUp.tsx`) and a Customise page. All drawn in code; this session has no image generator, so there are no photos.
- **Place stories (23 Oct):** tapping any place opens a full-screen story of 8 or 9 cards (`src/screens/raahi/PlaceStory.tsx`): cover, rules first where needed, today, tickets, time, good to know, unknowns, who checked, actions. Tap or swipe to move. Disputed facts say "not confirmed". Deep link `?open=story.<id>`.
- **Painted art (23 Oct):** place covers, profile banners and avatars painted with a free local image model and checked against each real place (`public/art/`, list in `src/art/painted.ts`, how they were made in `C:\projects\imagegen`). Anything without a painting keeps its drawn art.
- **Looks:** themes (`src/theme`), one-tap switch with a circle reveal, Marigold base in light and dark, Diwali, Sandstone, Royal (level 3), Peacock (level 5), Gwalior night (Gwalior gold passport). Ornaments, particles, the self-drawing fort, stamps, the app icon, all drawn in code.
- **Raahi:** onboarding, plan in 3 taps, chat (rules, or Groq on top of our facts with checks), voice in and out, place page (rules first, trust chips, what we don't know, still true taps, saarthi story), roadmap (drag, tick, running late, budget, share), live map (MapLibre with free OpenFreeMap tiles in the theme's colours, OSRM road route, location dot) plus an offline sketch map, Bazaar, alerts, emergency (112 call, alert moderators), passport, stamps with layered anti-cheat, quests, rewards, personalisation editor, history, settings.
- **Saarthi, business, moderator:** data form, verify queue, tickets, posts and rewards; business page, comments, sponsor request; queues, twist panel, SOS feed, news approvals. Switch in Settings > Demo: view as.
- **Event tools:** Baseline Duel (three AIs' fee claims against our checked record) and a printable system diagram. Settings > Event tools.
- **Backend:** `backend/` FastAPI with every endpoint in `docs/API.md`, server-side stamp checks, chat retrieval and checks, voice proxies.
- **Offline:** installable (manifest, icons from `scripts/make_icons.py`), service worker caches the app, data and map tiles. Tested with the server stopped.
- **Hindi:** every screen.

## Not real yet (needs a person or a key)
- Google sign-in: needs an OAuth client ID.
- AI chat, voice input, read-aloud: need `GROQ_KEY` and `ELEVENLABS_KEY` on the server. Mocked in tests, never called live from this machine.
- Saarthi photos and videos, business photos: buttons only.
- 112 integration beyond the phone call: needs a government partnership.
- The backend keeps state in memory; Pranjal's version needs a database.
