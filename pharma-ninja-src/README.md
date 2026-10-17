# Pharma Ninja: source

Booth quiz game for MResult, Global Pharma Partnering Summit 2026 (Booth G1).
Built into one self-contained offline HTML page. It works standalone (opened as a file) or served by the
Booth Visitor Hub at `/play`, where it also syncs with the Hub.

## Layout
- `src/app.js`: all game code, in numbered sections:
  - 0 Settings
  - 1 Brand art
  - 2 Utilities
  - 3 Store (IndexedDB, localStorage fallback)
  - 4 Sound (Web Audio)
  - 5 Leaderboard
  - 6 Stage (Phaser scene)
  - 7 Input (Pointer Events, slicing)
  - 8 Round (rules)
  - 9 Screens (DOM)
  - 10 Admin
  - 11 Boot & recovery
  - 12 Hub sync
- `src/data.js`: seed domains (8) and TEST questions (45). Used on a device's first run, and as the fallback when
  the Hub has never been reached.
- `src/index.template.html`: HTML and CSS; the build fills in the placeholders.
- `src/sw.template.js`: the offline service worker for `/play` (Hub mode only).
- `src/validate.js`: capsule-rule checks on the seed questions (run by the build). The Hub applies the same rules
  to every question it saves (`lib/questions.ts`; a test proves the two agree).
- `vendor/`: Phaser 3.90.0 (MIT) and Barlow / Barlow Condensed WOFF2 (SIL OFL). Pinned; do not upgrade casually.
- `assets/`: MResult logo, reversed for the dark stage.

## Build
Requires Python 3 and Node.js.

    python3 build.py                 # standalone: dist/pharma-ninja.html (no network at all)
    python3 build.py --hub ../public # Hub mode: pharma-ninja.html + play-sw.js (the Hub's `npm run build:game` does this)

Never edit a built file by hand. Change `src/` and rebuild. The build fails if any seed question breaks the
rules, or if the game's code contains any absolute web address (the game only talks to the site it was opened from).

## Hub mode in one paragraph
Open the Hub on any device and sign in. A **Game screen** account goes straight to `/play`; admin and staff can use
"Play Pharma Ninja" on the Hub home page.

**Badge ID is required to play.** On "Choose domain" the badge is checked with the Hub:
- **Registered:** "Welcome, <first name> — is this you?". Yes fills in the display name.
- **Not registered:** the Hub's registration form (`/register?kiosk=1`) opens over the game, with the badge filled
  in. The game page stays open, so the music keeps playing. Saving brings the player straight back with their
  first name as the display name and the badge confirmed. Autofill is off on that form, so the next visitor never
  sees the previous visitor's details.
- **Hub unreachable, or the screen not signed in:** the player plays anyway and the badge is kept unconfirmed,
  because the game never blocks on the network.

New builds reach a running screen automatically. It checks every 5 minutes and reloads itself while idle on the
attract screen, never mid-round or mid-form.

The game uses the sign-in to:
- fetches enabled domains and questions at start and every 5 minutes, keeping them for offline use;
- looks up a typed badge ID and asks "Welcome, <first name> — is this you?";
- saves every finished round and its plays locally first, then sends them to the Hub until each is acknowledged.
  The Hub ignores round ids it already has, so nothing is ever counted twice.

If the device is not signed in, or offline, the game plays normally with the questions it last saved (or the seed)
and keeps every result until it can send it. The leaderboard is still computed only from the device's own rounds.
Nothing in the game waits for the network.
