// Load sanity check: a production build of the Hub and a throwaway Postgres 17 on this
// machine, hit with a busy-booth peak far above expected traffic. Nothing touches the live site.
//
//   npm run test:load     (SKIP_BUILD=1 to reuse the last build)
//
// Scenario (all at once, per phase):
//   1. 400 visitors register through the public form, 25 at a time
//   2. 10 staff sign in and log 300 interactions, 10 at a time
//   3. 6 game screens (one shared game account) look up badges and sync 300 rounds
//      (12 answers each) in batches of 5, plus content refreshes
//   4. one full Excel export
// Reports latency (p50 / p95 / max) and errors per phase. Pass = no server errors.
import { execSync, spawn } from 'node:child_process';
import { randomBytes, scrypt } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import postgres from 'postgres';
import { migrate, setHubApiPassword } from '../../scripts/migrate.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const TMP = path.join(ROOT, '.tmp/load');
const PG_PORT = 54332, APP_PORT = 3108, B = `http://localhost:${APP_PORT}`;
const OWNER_URL = `postgres://postgres:load-owner@localhost:${PG_PORT}/postgres`;
const APP_URL = `postgres://hub_api:load-app@localhost:${PG_PORT}/postgres`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function hash(password) {   // same format as lib/password.ts
  const salt = randomBytes(16);
  return new Promise((res, rej) => scrypt(password, salt, 64, { N: 2 ** 15, r: 8, p: 1, maxmem: 128 * 2 ** 15 * 8 * 2 },
    (e, k) => (e ? rej(e) : res(['scrypt', 15, 8, 1, salt.toString('base64url'), k.toString('base64url')].join('$')))));
}

/** Run tasks with at most `limit` in flight. Returns [{ms, status}]. */
async function pool(tasks, limit) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (i < tasks.length) {
      const t = tasks[i++], t0 = performance.now();
      let status = 0;
      try { status = (await t()).status; } catch { status = -1; }
      out.push({ ms: performance.now() - t0, status });
    }
  }));
  return out;
}
function report(name, rs, okStatuses = [200, 201]) {
  const ms = rs.map((r) => r.ms).sort((a, b) => a - b);
  const q = (p) => Math.round(ms[Math.min(ms.length - 1, Math.floor(p * ms.length))]);
  const bad = rs.filter((r) => !okStatuses.includes(r.status));
  const byStatus = bad.reduce((m, r) => ({ ...m, [r.status]: (m[r.status] ?? 0) + 1 }), {});
  console.log(`${bad.length ? 'FAIL' : 'PASS'}  ${name.padEnd(46)} ${String(rs.length).padStart(4)} requests   p50 ${String(q(0.5)).padStart(4)} ms   p95 ${String(q(0.95)).padStart(4)} ms   max ${String(Math.round(ms.at(-1))).padStart(5)} ms${bad.length ? `   errors ${JSON.stringify(byStatus)}` : ''}`);
  return bad.length === 0;
}
const post = (url, body, headers = {}) => fetch(B + url, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: B, ...headers }, body: JSON.stringify(body) });

fs.mkdirSync(TMP, { recursive: true });
const pgDir = path.join(TMP, 'pg');
fs.rmSync(pgDir, { recursive: true, force: true });
const pg = new EmbeddedPostgres({ databaseDir: pgDir, port: PG_PORT, user: 'postgres', password: 'load-owner', persistent: false, onLog: () => {} });
let server, sql, ok = true;
try {
  await pg.initialise(); await pg.start();
  sql = postgres(OWNER_URL, { max: 1, onnotice: () => {} });
  await migrate(sql, { log: () => {} });
  await setHubApiPassword(sql, 'load-app');
  const pw = await hash('load-pass-123');
  for (let i = 1; i <= 10; i++) await sql`insert into hub.app_users (email, display_name, role, password_hash) values (${`staff${i}@mresult.com`}, ${`Staff ${i}`}, 'staff', ${pw})`;
  await sql`insert into hub.app_users (email, display_name, role, password_hash) values ('game@mresult.com', 'Game', 'game', ${pw})`;
  await sql`update hub.app_users set password_hash = ${pw} where email = 'mayank.srivastava@mresult.com'`;
  const [{ v: consentVersion }] = await sql`select consent_version as v from hub.settings`;

  if (!process.env.SKIP_BUILD) { console.log('Building the Hub (production)…'); execSync('npm run -s build', { cwd: ROOT, stdio: 'ignore', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } }); }
  server = spawn(process.execPath, [path.join(ROOT, 'node_modules/next/dist/bin/next'), 'start', '-p', String(APP_PORT)], {
    cwd: ROOT, stdio: 'ignore', env: { ...process.env, DATABASE_URL: APP_URL, IP_HASH_SECRET: 'load', NEXT_TELEMETRY_DISABLED: '1' } });
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`${B}/login`)).ok) break; } catch {} await sleep(250); }
  await fetch(`${B}/register`); await fetch(`${B}/api/game/content`);   // warm up

  // Each simulated visitor phone has its own IP (as on mobile data).
  const ip = (i) => ({ 'x-forwarded-for': `10.${(i >> 8) & 255}.${i & 255}.7` });
  console.log('\nPhase 1: visitor registrations');
  ok = report('register (public form)', await pool(Array.from({ length: 400 }, (_, i) => () => post('/api/public/register', {
    badgeId: `LOAD-${String(i).padStart(4, '0')}`, fullName: `Visitor ${i}`, company: 'Example Co', jobTitle: 'Director',
    email: `v${i}@example.com`, consent: true, marketingOptIn: i % 2 === 0, consentVersion }, ip(i))), 25)) && ok;

  console.log('\nPhase 2: staff logging interactions');
  const cookies = [];
  for (let i = 1; i <= 10; i++) {
    const r = await post('/api/auth/login', { email: `staff${i}@mresult.com`, password: 'load-pass-123' }, ip(1000 + i));
    cookies.push(/hub_session=([^;]+)/.exec(r.headers.get('set-cookie'))[1]);
  }
  const ids = await sql`select id from hub.app_users where role = 'staff' order by email`;
  ok = report('log interaction (conversation)', await pool(Array.from({ length: 300 }, (_, i) => () => post('/api/interactions', {
    type: 'conversation', badgeId: `LOAD-${String(i % 400).padStart(4, '0')}`, metBy: ids[i % 10].id, problemStatement: 'Wants faster trial start-up',
    domainTags: ['Clinical Trials'], interestLevel: ['hot', 'warm', 'cold'][i % 3], nextStep: 'Send a case summary' },
    { cookie: `hub_session=${cookies[i % 10]}` })), 10)) && ok;
  ok = report('visitor page lookups (summary)', await pool(Array.from({ length: 200 }, (_, i) => () =>
    fetch(`${B}/api/visitors/LOAD-${String(i).padStart(4, '0')}/summary`, { headers: { cookie: `hub_session=${cookies[i % 10]}` } })), 10)) && ok;

  console.log('\nPhase 3: 6 game screens on one game account');
  const g = await post('/api/auth/login', { email: 'game@mresult.com', password: 'load-pass-123' }, ip(2000));
  const game = { cookie: `hub_session=${/hub_session=([^;]+)/.exec(g.headers.get('set-cookie'))[1]}` };
  ok = report('content refresh', await pool(Array.from({ length: 60 }, () => () => fetch(`${B}/api/game/content`, { headers: game })), 6)) && ok;
  ok = report('badge lookup (within the per-minute limit)', await pool(Array.from({ length: 55 }, (_, i) => () =>
    post('/api/game/lookup', { badgeId: `LOAD-${String(i).padStart(4, '0')}` }, { ...game, ...ip(3000 + i) })), 6)) && ok;
  const qs = await sql`select id from hub.questions`;
  const round = (n) => ({ round: { roundId: `load${String(n).padStart(6, '0')}`, ts: Date.now(), date: '2026-11-02', displayName: `Player ${n}`,
    visitorId: `LOAD-${String(n % 400).padStart(4, '0')}`, badgeConfirmed: true, domainId: 'clinical', score: 400 + n, questions: 12, correct: 8,
    longestStreak: 4, endReason: 'time' }, plays: Array.from({ length: 12 }, (_, k) => ({ ts: Date.now(), questionId: qs[k % qs.length].id, result: k % 3 ? 'correct' : 'wrong', msToSlice: 1500 })) });
  ok = report('round sync (batches of 5 rounds)', await pool(Array.from({ length: 60 }, (_, b) => () =>
    post('/api/game/rounds', { items: Array.from({ length: 5 }, (_, k) => round(b * 5 + k)) }, game)), 6)) && ok;

  console.log('\nPhase 4: Excel export of everything');
  const a = await post('/api/auth/login', { email: 'mayank.srivastava@mresult.com', password: 'load-pass-123' }, ip(4000));
  const adminCookie = `hub_session=${/hub_session=([^;]+)/.exec(a.headers.get('set-cookie'))[1]}`;
  let size = 0;
  ok = report('full Excel export', await pool([async () => { const r = await fetch(`${B}/api/admin/export`, { headers: { cookie: adminCookie } }); size = (await r.arrayBuffer()).byteLength; return r; }], 1)) && ok;

  const [c] = await sql`select (select count(*)::int from hub.visitors) as visitors, (select count(*)::int from hub.interactions) as interactions,
    (select count(*)::int from hub.game_rounds) as rounds, (select count(*)::int from hub.game_plays) as plays`;
  const expected = { visitors: 400, interactions: 300, rounds: 300, plays: 3600 };
  const match = JSON.stringify(c) === JSON.stringify(expected);
  console.log(`\n${match ? 'PASS' : 'FAIL'}  everything stored exactly once: ${JSON.stringify(c)}   export file ${(size / 1024).toFixed(0)} KB`);
  ok = ok && match;
} catch (e) {
  ok = false; console.log('FAIL  load run:', e.message);
} finally {
  server?.kill('SIGKILL');
  await sql?.end();
  await pg.stop().catch(() => {});
}
console.log(ok ? '\nLoad check passed' : '\nLoad check FAILED');
process.exit(ok ? 0 : 1);
