# MResult Booth Visitor Hub

One hosted system for MResult's booth (Global Pharma Partnering Summit 2026, Booth G1): every visitor is identified by
their organiser-issued **badge ID**, and every touchpoint is recorded against it: registration, conversations,
podcast guests, demos, notes and Pharma Ninja game rounds. Admins export everything to Excel.

Next.js (App Router, TypeScript) on Vercel; Postgres on Supabase (used as plain Postgres, no Supabase Auth).

## Map

| Path | What it is |
|---|---|
| `app/register` | **Public** registration form (QR code). |
| `app/login` | Team sign-in (email + password). |
| `app/(team)/…` | Signed-in pages for admin and staff: home, log interaction, visitors, staff-assisted registration, podcast list, admin (export, game content, team, settings). |
| `app/api/…` | JSON API. Each route file starts with a comment giving its request and response shapes. |
| `app/api/game/…` | The API Pharma Ninja uses: content, badge lookup (first name only), round sync. Any signed-in account; this is ALL a **Game screen** account can reach. |
| `/play` | Pharma Ninja, built from `pharma-ninja-src/` by `npm run build:game` (runs automatically before `dev` and `build`). |
| `lib/questions.ts` | Game content rules (same as the game's `validate.js`) and the CSV layout. |
| `components/` | Shared client components: registration form, interaction form. |
| `lib/db.ts` | Database access. Every request runs as a low-privilege role, so row-level security applies. |
| `lib/session.ts`, `lib/password.ts` | Sessions (httpOnly cookie → `hub.sessions`) and scrypt password hashing. |
| `lib/validation.ts` | All input rules (zod). |
| `lib/data/` | Queries: visitors, interactions, team & settings, Excel export. |
| `db/migrations/` | Plain SQL: schema, roles/grants/RLS, functions, seed. Runs on any Postgres 16+. |
| `scripts/` | `migrate.mjs`, `gen-seed.mjs` (seed from the game's `data.js`), `set-password.mjs`, `dev-db.mjs`. |
| `tests/` | Database-policy and API tests against a real throwaway Postgres 17. |
| `pharma-ninja-src/` | The game's source (see its own README). Served at `/play`. |

**Running the booth:** see [docs/booth-runbook.md](docs/booth-runbook.md): setup, daily routine, what to do when
something breaks, paid plans, moving to EC2.

## Security model (short)

- Three kinds of account: **admin**, **staff**, and **game** (a public game screen: can only run Pharma Ninja).
- The server connects as `hub_api`, which can do almost nothing itself. Each request switches to `hub_user` (signed-in
  admin/staff), `hub_public` (registration form) or `hub_game` (Pharma Ninja's sync calls) inside a transaction.
- Row-level security on every table. Staff vs admin is read live from `hub.app_users`, so removing someone or changing
  their role works immediately. Those changes also delete the person's sessions.
- The `hub` schema is not exposed through Supabase's Data API.

## Develop locally

```bash
nvm use                      # Node 22
npm install
npm test                     # starts a throwaway Postgres 17, applies migrations, runs all tests
npm run test:e2e             # the real game in Chrome against a production build (offline test included)
npm run test:load            # busy-booth load check on this machine
npm run dev:db               # local Postgres on :54330 (leave running)
DATABASE_URL=postgres://hub_api:dev-only@localhost:54330/postgres npm run dev
```

## Deploy

1. Copy `.env.example` to `.env.local` and fill it in (never commit it).
2. `npm run db:migrate` applies migrations to Supabase and sets the `hub_api` password from `DATABASE_URL`.
3. `npm run admin:set-password -- mayank.srivastava@mresult.com` sets the first admin's password (it asks for it on screen).
4. In Vercel, set `DATABASE_URL` and `IP_HASH_SECRET` (never `MIGRATION_DATABASE_URL`). Functions run in `bom1` (Mumbai).

Moving to Postgres on EC2 later: run the same migrations against the new database, point `DATABASE_URL` at it, redeploy.
