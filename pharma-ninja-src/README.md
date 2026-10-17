# Pharma Ninja — source (Milestone 1)

Booth quiz game for MResult, Global Pharma Partnering Summit 2026 (Booth G1).
The built file `dist/pharma-ninja.html` is one self-contained offline HTML page.

## Layout
- `src/app.js` — all game code, in numbered sections: 0 Settings, 1 Brand art, 2 Utilities,
  3 Store (IndexedDB, localStorage fallback), 4 Sound (Web Audio), 5 Leaderboard,
  6 Stage (Phaser scene), 7 Input (Pointer Events, slicing), 8 Round (rules),
  9 Screens (DOM), 10 Admin (stub), 11 Boot & recovery.
- `src/data.js` — seed domains (8) and TEST questions (45). Loaded only on a machine's first run.
- `src/index.template.html` — HTML and CSS; placeholders are filled by the build.
- `src/validate.js` — capsule-rule checks on the seed questions (run by the build).
- `vendor/` — Phaser 3.90.0 (MIT) and Barlow / Barlow Condensed WOFF2 (SIL OFL). Pinned; do not upgrade casually.
- `assets/` — MResult logo, reversed for the dark stage.

## Build
Requires Python 3 and Node.js.

    python3 build.py

Never edit `dist/pharma-ninja.html` by hand. Change `src/` and rebuild.
