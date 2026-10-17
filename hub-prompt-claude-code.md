<context>
I'm Mayank Srivastava at MResult Technologies (analytics, technology and consulting for life sciences). MResult is Gold Sponsor at the Global Pharma Partnering Summit 2026, Hyderabad, 2–3 November 2026, Booth G1, with setup on 1 November. MResult attends as one firm; frame nothing around any internal business unit.

Build the BOOTH VISITOR HUB: one hosted system that gives every booth visitor a single identity (their organiser-issued badge ID) and records every touchpoint against it: registration, the PHARMA NINJA game, the Voice of the Industry podcast, experience-center demos, and staff conversation notes. After the event it exports everything to Excel.

PHARMA NINJA already exists. Milestone 1 is built and approved: a single self-contained offline HTML file (Phaser 3.90.0 inlined, IndexedDB storage). You will wire it into the Hub WITHOUT changing its gameplay, look or locked decisions.

In this project folder:
(1) pharma-ninja-src/ — the game's SOURCE: src/app.js, src/data.js, src/index.template.html, src/validate.js, vendored Phaser and fonts, assets/, build.py and README.md. Running `python3 build.py` inside it reproduces the approved build byte for byte. All game changes are made here and rebuilt; never hand-edit a built HTML file.
(2) pharma-ninja-m1.html — the approved Milestone 1 build, for reference only.
(3) handoff-pharma-ninja.md — the Milestone 1 handoff: every gameplay, design and data decision.
Read all three fully before planning.
</context>

<locked_decisions>
Do not reopen these. Do not add features beyond them.

PLATFORM
- Next.js (App Router, TypeScript) deployed on Vercel (Hobby plan for this prototype), with Supabase Postgres and Supabase Auth (Free plan, organisation "MResult-GPPS").
- The Supabase project does NOT exist yet. At the plan checkpoint, give me the exact settings to create it. I intend: name booth-visitor-hub, region South Asia (Mumbai), Data API enabled, "Automatically expose new tables" OFF, "Enable automatic RLS" ON. Because tables are not auto-exposed, your migrations must grant access explicitly and enable row-level security on every table.
- Design so a later move to MResult's AWS (EC2 + Postgres) and to paid plans is a database migration plus redeploy, not a rewrite: standard Postgres schema and SQL migrations in the repo, no Supabase-only features in business logic beyond Auth and row-level security.
- All secrets in environment variables. Never commit keys. Never ask me to paste keys into the chat; tell me which variable to set in .env.local and Vercel.
- Login-code emails: for now use Supabase's built-in email sender. Only my admin account will sign in during the build. A custom SMTP sender (e.g. Resend, on an MResult subdomain) will be added before staff onboard; it must be a configuration change only, with no code changes.

IDENTITY
- The visitor's identity is the unique badge ID printed on their organiser-issued badge. The Hub does NOT generate IDs.
- badge_id is the primary key: unique, stored trimmed and uppercased, validated against a configurable format rule (admin setting; default: 4–20 letters, digits or hyphens).

ROLES
- TWO roles: admin and staff. No visitor accounts.
- Access is by an admin-managed ALLOWLIST, not invitations. An admin adds a person's email and role in User management. That person then opens the Hub login page on their own phone browser, enters their email, receives a 6-digit one-time code by email, and is signed in. No password, no invite email.
- Any email not on the allowlist is refused at login with "Ask the MResult admin to add you." Never reveal which emails are on the list.
- Sessions last the whole event (at least 72 hours) so people don't have to sign in again mid-booth. An admin can remove a person or change their role at any time, and removal ends their active sessions.
- Seed one admin account: mayank.srivastava@mresult.com.
- Every record stores who created it.
- STAFF can: register visitors in staff-assisted mode; search and view visitors and their full timeline; log all interaction types (conversation, podcast guest, demo seen, other); edit or delete only the interactions they created; use the podcast producer view.
- ADMIN can do everything staff can, plus: game content admin (domains, questions, CSV import/export, TEST bulk delete); edit any visitor or interaction; Excel export; settings (badge format, consent text, podcast topics, demo list); device keys; visitor erasure and full purge; User management (allowlist: add or remove a person, set role).
- Enforce roles in row-level security AND in the API, never only in the UI.
- Until custom SMTP is set up, staff sign-in by email cannot be tested end to end. Prove role enforcement with automated tests against the database policies and the API instead, and say clearly in your reports that real staff sign-in is untested.
- Public, unauthenticated pages: ONLY the visitor registration form and the game at /play.

1. VISITOR REGISTRATION (public, mobile-first)
- Reached by a QR code at the booth. Visitors fill it on their own phone.
- Fields: badge ID (required), full name (required), company (required), job title (required), email (required), mobile (optional), LinkedIn URL (optional).
- Consent: one required checkbox, with notice text editable by admin, covering use of the details by MResult for follow-up after the event, display of a first name or nickname on the game leaderboard, and the booth team viewing the record. One separate OPTIONAL checkbox for marketing communications. Store consent text version and timestamp with the record.
- Must take under 60 seconds. Large touch targets. MResult brand: orange #F7943E, charcoal #1F1F1F, white, light grey; fonts Barlow / Barlow Condensed (self-hosted; the WOFF2 files are in pharma-ninja-src/vendor/fonts/).
- If the badge ID already exists: do NOT reveal or overwrite the existing record. Show "This badge is already registered — please see the MResult team." Admins can edit records.
- Success screen: thank-you message, and "Use your badge ID to play Pharma Ninja at the booth."
- Staff-assisted mode: the same form, opened by a signed-in staff member or admin on a booth tablet, so staff can register walk-ins or senior guests who won't fill it themselves. Records created this way store that person's name.

2. TOUCHPOINTS AND CONVERSATIONS (staff and admin, mobile-first)
- A single "Log interaction" page, fast on a phone: enter or paste a badge ID, see the visitor's name, company and title for confirmation, then choose a type:
  a) Conversation: met by (defaults to the signed-in user), problem statement (free text), domain tags (multi-select from the 8 game domains plus "Other"), interest level (Hot / Warm / Cold), next step (free text), follow-up owner (any team member), follow-up date (optional).
  b) Podcast guest: topic (pick from the 8 podcast themes, editable list in admin settings), notes, consent form signed (yes/no).
  c) Demo seen: demo name (pick from an admin-editable list), notes.
  d) Other: free-text note.
- If the badge ID isn't registered, offer to register them on the spot (staff-assisted mode), then continue.
- Visitor detail page: profile plus a timeline of all touchpoints, conversations and game plays.
- Podcast producer view: today's podcast guests with name, title, company and LinkedIn, so the podcast team's daily guest list fills itself.

3. GAME CONTENT ADMIN
- CRUD for domains (id, name, short description, icon key, accent colour, enabled) and questions (id, domainId, questionText, options 4–5, correctIndex, difficulty 1–3, explanation, source, enabled).
- Same validation as the game, enforced on every save and import: exactly one correct option; 4–5 options; each option ≤ 4 words AND ≤ 28 characters; questionText ≤ 120 characters; difficulty 1–3. The game's own rules are in pharma-ninja-src/src/validate.js; match them exactly.
- CSV import and export using EXACTLY this layout, one row per question:
  id, domainId, questionText, option1, option2, option3, option4, option5 (empty for 4-option questions), correctOption (1–5, the option number), difficulty, explanation, source, enabled (yes/no)
- On import, rows that break a rule are listed with the reason and skipped, never silently loaded. Re-importing an existing id updates that question.
- Bulk action: delete all questions whose source starts with "TEST".
- Seed the database with the 8 domains and 45 test questions from pharma-ninja-src/src/data.js, exactly as written.

4. GAME INTEGRATION (wire Pharma Ninja into the Hub)
- Make every game change in pharma-ninja-src/src/ and rebuild with `python3 build.py`. Add the build to the Hub's build process so /play always serves the freshly built file.
- Serve the game from the Hub at /play, same origin as the API. Add a service worker so /play loads and runs fully offline after first load.
- The game STAYS OFFLINE-FIRST. It must never stop or block because the network is down:
  - Content: on start and every 5 minutes when online, fetch enabled domains and questions from the Hub and cache them in IndexedDB. Offline, use the cache. The seed data remains the fallback on a fresh machine with no network.
  - Identity: the name-entry screen's existing Visitor ID field becomes "Badge ID". When the player enters one and the network is up, look it up and show "Welcome, <first name> — is this you?" (Yes / No). On Yes, prefill the display name with the first name (the player can change it). If the lookup fails or the device is offline, the player continues with a typed display name and the badge ID is stored unverified for later matching. A badge ID is optional; anyone can play without one.
  - Plays: every completed round and its per-question play records are written to IndexedDB first, then synced to the Hub via an outbox queue that retries until acknowledged. Sync is idempotent (client-generated round id; the game already generates one per round).
  - Leaderboard: stays computed locally from the device's own data, exactly as Milestone 1 does. The Hub stores a copy for records and export.
- The device authenticates to the API with a device key stored in the game's settings. The key is scoped ONLY to: read enabled game content, look up a badge's first name, and write rounds and plays. It can never read other visitor data.
- The badge lookup returns ONLY {found, firstName}, never other fields. Rate-limit it per device key and per IP to prevent enumeration.
- The game's on-screen admin (3 s top-left press, PIN) is limited to: quiet mode, music and effects on/off and volume, play zone, Hub URL and device key, sync status (queued items, last successful sync), "Refresh content now", leaderboard reset for today, and removing a leaderboard entry. Content editing happens only in the Hub admin.
- Make only the changes needed for this integration. Gameplay, scoring, visuals, sound, layout and all locked Milestone 1 behaviour stay exactly as built. Keep the build script's offline rule, extended only to allow the Hub's own origin.

5. EXPORT (admin)
- One-click Excel (.xlsx) export with these sheets:
  - Visitors: one row per visitor, with profile, consent flags, registration time, created-by, and counts of conversations, podcast, demos and game rounds, plus best game score, latest interest level and latest next step.
  - Conversations
  - Podcast guests
  - Demos
  - Game rounds
  - Game plays
  - Unmatched badge IDs (game plays whose badge ID isn't registered)
- Optional date filter (Asia/Kolkata time).

6. PRIVACY AND SECURITY
- Visitor data is never visible without a staff or admin login. Row-level security on every table.
- HTTPS only, secure session cookies, CSRF protection on admin forms, input validation everywhere.
- Admin actions: delete a visitor and all their records (right-to-erasure); purge all event data, behind a typed confirmation.
- No client names, case-study content or confidential MResult material anywhere in code, seed data or UI.
</locked_decisions>

<task>
Work in this order. Stop at each checkpoint for my confirmation. Output a ✅ line summarising what was completed at the end of each step.

1. PLAN (no code): the schema (tables, keys, indexes, row-level security and explicit grants), API endpoints with request/response shapes, the auth model including the device key, how the game integration works (service worker, cache, outbox, lookup flow, and how the game build plugs into the Hub build), the exact Supabase project settings for me to create, and a deployment and environment checklist (which variables go in .env.local and in Vercel). Also tell me how the GitHub repository should be created: private, under my personal account MayankSrivastava-MResult, because the Vercel Hobby plan cannot deploy private organisation repositories. List genuine conflicts or gaps you see, including anything in the game source that makes the integration harder than described. Wait for my go.

2. MILESTONE A: Hub foundation. Schema and migrations, seed data, allowlist auth with email one-time codes, visitor registration (public and staff-assisted), the log-interaction page, visitor detail, the podcast producer view, and the Excel export. Deployed to a Vercel preview URL.

3. MILESTONE B: game content admin and game integration. Domains and questions CRUD, validation, CSV import/export, TEST bulk delete, /play with service worker, content sync, badge lookup with confirmation, the outbox sync, the device key, and the reduced on-screen game admin.

4. MILESTONE C: hardening and handover. Rate limiting, erasure and purge, an offline test (disconnect mid-round, play 3 rounds offline, reconnect, confirm everything synced exactly once), a load sanity check, and a one-page booth runbook covering how to set up the game device, how the team logs interactions, what to do if the network drops, the daily export, switching on the custom email sender, upgrading to paid plans, and moving to EC2 later.
</task>

<constraints>
- Only build what is specified. Never add features, roles, analytics or integrations beyond this.
- Never change Pharma Ninja's gameplay, visuals or locked decisions. Integration changes only.
- Stop and ask before: deleting or overwriting any data, changing the database schema after Milestone A is approved, rotating keys, or anything that touches production.
- Readable code with comments at the level of "what each module does", so Darshan or another engineer can maintain it.
- Separate evidence from inference in every report: say what you tested and how, and what you did not test.
</constraints>

<done_when>
- A visitor scans the QR, registers with their badge ID in under 60 seconds, and can then play Pharma Ninja by entering the badge ID and seeing "Welcome, <first name>".
- Any staff member can log a conversation against a badge ID from their phone in under 30 seconds.
- The game keeps working with the network disconnected, and every offline round syncs exactly once when the network returns.
- One click produces the Excel export with every visitor and every touchpoint.
- Without a login, nobody can see visitor data.
</done_when>
