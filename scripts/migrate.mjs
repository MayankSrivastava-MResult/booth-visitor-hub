// Applies db/migrations/*.sql in filename order, each in its own transaction,
// recording what has run in hub.schema_migrations. Plain Postgres: works the
// same against Supabase today and Postgres on EC2 later.
//
// Usage: npm run db:migrate
//   Connects with MIGRATION_DATABASE_URL (owner / postgres role; local machine only).
//   Afterwards sets the hub_api role's password to the one inside DATABASE_URL,
//   so the password lives only in your environment variables, never in the repo.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import postgres from 'postgres';

const DIR = path.resolve(import.meta.dirname, '../db/migrations');

/** Apply pending migrations using an owner connection. Returns the list applied. */
export async function migrate(sql, { log = console.log } = {}) {
  await sql`create schema if not exists hub`;
  await sql`create table if not exists hub.schema_migrations (version text primary key, applied_at timestamptz not null default now())`;
  const done = new Set((await sql`select version from hub.schema_migrations`).map((r) => r.version));
  const files = fs.readdirSync(DIR).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
  const applied = [];
  for (const f of files) {
    if (done.has(f)) continue;
    const body = fs.readFileSync(path.join(DIR, f), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into hub.schema_migrations (version) values (${f})`;
    });
    log(`applied ${f}`);
    applied.push(f);
  }
  if (!applied.length) log('database is up to date');
  return applied;
}

/** Set the hub_api login password (value never logged). */
export async function setHubApiPassword(sql, password) {
  const [{ stmt }] = await sql`select format('alter role hub_api with password %L', ${password}::text) as stmt`;
  await sql.unsafe(stmt);
}

async function main() {
  const ownerUrl = process.env.MIGRATION_DATABASE_URL;
  if (!ownerUrl) throw new Error('MIGRATION_DATABASE_URL is not set (see .env.example)');
  const sql = postgres(ownerUrl, { prepare: false, max: 1, onnotice: () => {} });
  try {
    await migrate(sql);
    const appUrl = process.env.DATABASE_URL;
    if (appUrl) {
      const pw = decodeURIComponent(new URL(appUrl).password || '');
      if (pw) { await setHubApiPassword(sql, pw); console.log('hub_api password set from DATABASE_URL'); }
    } else {
      console.log('DATABASE_URL not set: hub_api password left unchanged');
    }
  } finally {
    await sql.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
