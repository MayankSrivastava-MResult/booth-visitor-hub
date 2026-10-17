// Local development database: a real Postgres 17 inside .tmp/pg-dev (kept
// between runs), with all migrations applied. Nothing is installed system-wide.
//
// Usage: npm run dev:db        (leave it running; Ctrl+C stops it)
// Then run the app against it in another terminal:
//   DATABASE_URL=postgres://hub_api:dev-only@localhost:54330/postgres npm run dev
import fs from 'node:fs';
import EmbeddedPostgres from 'embedded-postgres';
import postgres from 'postgres';
import { migrate, setHubApiPassword } from './migrate.mjs';

const dir = '.tmp/pg-dev', port = 54330;
const pg = new EmbeddedPostgres({ databaseDir: dir, port, user: 'postgres', password: 'dev-owner', persistent: true, onLog: () => {} });
if (!fs.existsSync(dir)) await pg.initialise();
await pg.start();

const sql = postgres(`postgres://postgres:dev-owner@localhost:${port}/postgres`, { max: 1, onnotice: () => {} });
await migrate(sql);
await setHubApiPassword(sql, 'dev-only');
await sql.end();

console.log(`\nLocal Postgres running on port ${port}.`);
console.log(`  App:        DATABASE_URL=postgres://hub_api:dev-only@localhost:${port}/postgres`);
console.log(`  Migrations: MIGRATION_DATABASE_URL=postgres://postgres:dev-owner@localhost:${port}/postgres`);
console.log('Ctrl+C to stop.');
const stop = async () => { await pg.stop(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);
