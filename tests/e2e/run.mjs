// End-to-end tests: the real Pharma Ninja in a real Chrome, against a real production
// build of the Hub and a throwaway Postgres 17. Nothing touches the live site.
//
//   npm run test:e2e            (SKIP_BUILD=1 to reuse the last build; CHROME_PATH if Chrome is elsewhere)
//
// A. Offline (the brief's test): disconnect mid-round, reload with no server (service worker),
//    play 3 rounds offline, reconnect → every round synced exactly once, every play stored.
// B. Register from the game: badge required; unregistered badge → registration form over the
//    game with the badge prefilled, music keeps playing; saved → back with first name, confirmed.
// C. Standalone file (no Hub): zero network requests; badge required; plays unconfirmed.
import { execSync, spawn } from 'node:child_process';
import { randomBytes, scrypt } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import postgres from 'postgres';
import { migrate, setHubApiPassword } from '../../scripts/migrate.mjs';
import { launch } from './cdp.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const TMP = path.join(ROOT, '.tmp/e2e');
const PG_PORT = 54331, APP_PORT = 3107, B = `http://localhost:${APP_PORT}`;
const OWNER_URL = `postgres://postgres:e2e-owner@localhost:${PG_PORT}/postgres`;
const APP_URL = `postgres://hub_api:e2e-app@localhost:${PG_PORT}/postgres`;
const GAME = { email: 'game-e2e@mresult.com', password: 'game-e2e-pass' };

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === undefined ? '' : `  →  ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function hash(password) {   // same format as lib/password.ts
  const salt = randomBytes(16);
  return new Promise((res, rej) => scrypt(password, salt, 64, { N: 2 ** 15, r: 8, p: 1, maxmem: 128 * 2 ** 15 * 8 * 2 },
    (e, k) => (e ? rej(e) : res(['scrypt', 15, 8, 1, salt.toString('base64url'), k.toString('base64url')].join('$')))));
}

let server = null;
async function startServer() {
  server = spawn(process.execPath, [path.join(ROOT, 'node_modules/next/dist/bin/next'), 'start', '-p', String(APP_PORT)], {
    cwd: ROOT, stdio: 'ignore', env: { ...process.env, DATABASE_URL: APP_URL, IP_HASH_SECRET: 'e2e', NEXT_TELEMETRY_DISABLED: '1' } });
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`${B}/login`)).ok) return; } catch {} await sleep(250); }
  throw new Error('server did not start');
}
async function stopServer() {
  if (!server) return;
  server.kill('SIGKILL'); server = null;
  for (let i = 0; i < 40; i++) { try { await fetch(`${B}/login`); } catch { return; } await sleep(100); }
}
async function signIn(email, password) {
  const res = await fetch(`${B}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: B }, body: JSON.stringify({ email, password }) });
  const m = /hub_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '');
  if (!m) throw new Error(`sign-in failed for ${email}: ${res.status}`);
  return m[1];
}
async function browser(name, port, cookie) {
  const dir = path.join(TMP, `chrome-${name}`);
  fs.rmSync(dir, { recursive: true, force: true });
  const c = await launch(dir, { port });
  if (cookie) await c.send('Network.setCookie', { name: 'hub_session', value: cookie, url: B, httpOnly: true });
  return c;
}
const pageErrors = (c) => c.errors().filter((e) => !/favicon|Failed to load resource|ERR_CONNECTION_REFUSED|Failed to fetch|NetworkError/.test(e));

// ---------------------------------------------------------------------------
async function flowOffline(sql, cookie) {
  console.log('\nA. Offline: disconnect mid-round, 3 rounds offline, reconnect, synced exactly once');
  const c = await browser('offline', 9341, cookie);
  try {
    await c.goto(`${B}/play`);
    await c.waitFor('window.PharmaNinja && PharmaNinja.Screens.current === "attract"');
    await c.waitFor('!!navigator.serviceWorker.controller', 15000);
    await c.waitFor('PharmaNinja.Hub.signedIn === true && PharmaNinja.Hub.status.content === "updated"', 15000);
    check('signed-in game screen loads questions from the Hub', true, await c.eval('PharmaNinja.Store.data.questions.length + " questions"'));

    const play = async (name, domain, poke) => {
      await c.eval(`PharmaNinja.Round.start({ displayName: ${JSON.stringify(name)}, visitorId: 'E2E-0001', badgeConfirmed: true }, '${domain}'); true`);
      await c.waitFor('PharmaNinja.Screens.current === "hud"');
      await sleep(1200);
      if (poke) await c.eval('PharmaNinja.Hub.refreshContent(); PharmaNinja.Hub.flush(); PharmaNinja.Hub.lookup("E2E-0001"); true');
      await sleep(1200);
      const during = await c.eval('PharmaNinja.Screens.current');
      await c.eval('PharmaNinja.Round.end("time"); true');
      await c.waitFor('PharmaNinja.Screens.current === "results"', 8000);
      return during;
    };

    // 1) disconnect in the middle of a round
    await c.eval(`PharmaNinja.Round.start({ displayName: 'Midround', visitorId: 'E2E-0001', badgeConfirmed: true }, 'quality'); true`);
    await c.waitFor('PharmaNinja.Screens.current === "hud"');
    await sleep(800);
    await stopServer();
    await sleep(1200);
    const midScreen = await c.eval('PharmaNinja.Screens.current');
    await c.eval('PharmaNinja.Round.end("time"); true');
    await c.waitFor('PharmaNinja.Screens.current === "results"', 8000);
    await sleep(1500);
    check('server stopped mid-round: the round carries on and is kept', midScreen === 'hud' && (await c.eval('PharmaNinja.Store.data.outbox.length')) === 1,
      await c.eval('PharmaNinja.Hub.status.sync'));

    // 2) reload with no server
    await c.goto(`${B}/play`);
    const reloaded = await c.waitFor('window.PharmaNinja && PharmaNinja.Screens.current === "attract"', 15000).catch(() => false);
    check('reload with no server: game served from the offline cache', reloaded);
    check('saved questions and the waiting round survive the reload', (await c.eval('PharmaNinja.Store.data.questions.length')) > 0 && (await c.eval('PharmaNinja.Store.data.outbox.length')) === 1);

    // 3) three rounds offline, forcing network attempts during play
    const screens = [];
    for (const [d, n] of [['clinical', 'Offline 1'], ['genai', 'Offline 2'], ['india', 'Offline 3']]) screens.push(await play(n, d, true));
    check('3 offline rounds, never interrupted by failed network calls', screens.every((s) => s === 'hud'), screens);
    check('4 rounds waiting to send', (await c.eval('PharmaNinja.Store.data.outbox.length')) === 4);
    check('leaderboard works offline', (await c.eval('PharmaNinja.Leaderboard.top(10).length')) >= 4);
    const [{ n: offlineCount }] = await sql`select count(*)::int as n from hub.game_rounds`;
    check('nothing reached the Hub while offline', offlineCount === 0, `${offlineCount} rounds in Hub`);

    // 4) reconnect
    await startServer();
    await c.eval('window.dispatchEvent(new Event("online")); true');
    await c.waitFor('PharmaNinja.Store.data.outbox.length === 0', 30000);
    const [{ n: synced }] = await sql`select count(*)::int as n from hub.game_rounds`;
    check('reconnected: all 4 rounds synced', synced === 4, `${synced} rounds in Hub`);

    // 5) exactly once: send the same 4 again
    const acked = await c.eval(`(async () => {
      const items = PharmaNinja.Store.data.rounds.slice(-4).map(r => ({ round: r, plays: PharmaNinja.Store.data.plays.filter(p => p.roundId === r.roundId)
        .map(p => ({ ts: p.ts, questionId: p.questionId, result: p.result, msToSlice: p.msToSlice })) }));
      const res = await PharmaNinja.Hub.request('POST', '/api/game/rounds', { items }, 10000);
      return (await res.json()).acked.length; })()`);
    const [{ n: after }] = await sql`select count(*)::int as n from hub.game_rounds`;
    const [{ n: dupes }] = await sql`select count(*)::int as n from (select round_id from hub.game_rounds group by 1 having count(*) > 1) d`;
    check('re-sending the same rounds: acknowledged, no duplicates', acked === 4 && after === 4 && dupes === 0, { acked, roundsInHub: after, duplicates: dupes });
    const mismatched = await sql`select r.round_id from hub.game_rounds r left join hub.game_plays p on p.round_id = r.round_id
      group by r.round_id, r.questions having count(p.*) <> r.questions`;
    const [{ n: confirmed }] = await sql`select count(*)::int as n from hub.game_rounds where badge_id = 'E2E-0001' and badge_confirmed`;
    check('every answer stored, rounds matched to the badge', mismatched.length === 0 && confirmed === 4);
    check('no page errors', pageErrors(c).length === 0, pageErrors(c));
  } finally { await c.close(); }
}

// ---------------------------------------------------------------------------
async function flowRegister(sql, cookie) {
  console.log('\nB. Register from inside the game');
  const c = await browser('register', 9342, cookie);
  const music = () => c.eval('!!(PharmaNinja.Sound.ctx && PharmaNinja.Sound.ctx.state === "running" && PharmaNinja.Sound.timer)');
  const typeIn = (field, text) => c.eval(`document.getElementById("${field}").click(); ${JSON.stringify(text)}.split("").forEach(ch => PharmaNinja.NameEntry.type(ch)); true`);
  const reset = () => c.eval('PharmaNinja.NameEntry.vid = ""; PharmaNinja.NameEntry.name = ""; PharmaNinja.NameEntry.badgeChanged(); PharmaNinja.NameEntry.paint(); true');
  const frameDoc = `document.getElementById('reg-frame').contentDocument`;
  const fill = (name, val) => c.eval(`(() => { const d = ${frameDoc}, w = d.defaultView, el = d.querySelector('[name=${name}]');
    w.Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(val)});
    el.dispatchEvent(new w.Event('input', { bubbles: true })); return true; })()`);
  try {
    await c.goto(`${B}/play`);
    await c.waitFor('window.PharmaNinja && PharmaNinja.Screens.current === "attract"');
    await c.eval('PharmaNinja.Sound.unlock(); true'); await sleep(400);
    await c.eval('document.getElementById("cta-play").click(); true');
    await c.waitFor('PharmaNinja.Screens.current === "name"');
    check('the cursor starts in the Badge ID field (shown first)', (await c.eval('PharmaNinja.NameEntry.field')) === 'vid');
    await typeIn('f-name', 'Guest');
    check('badge required: Choose domain disabled with only a name', await c.eval('document.getElementById("name-go").disabled'));
    await reset();

    await typeIn('f-vid', 'e2e-new1');
    await c.eval('document.getElementById("name-go").click(); true');
    await c.waitFor('document.getElementById("s-reg").classList.contains("on")', 8000);
    await c.waitFor(`!!(${frameDoc} && ${frameDoc}.querySelector('[name=fullName]'))`, 15000);
    await sleep(2000);   // form scripts ready
    check('unregistered badge opens the form with the badge filled in', (await c.eval(`${frameDoc}.querySelector('[name=badgeId]').value`)) === 'E2E-NEW1');
    check('autofill is off on the in-game form', (await c.eval(`[...${frameDoc}.querySelectorAll('input[type=text],input[type=email],input[type=tel],input[type=url]')].every(i => i.autocomplete === 'off')`)));
    for (const [k, v] of [['fullName', 'Dr. Ravi Menon'], ['company', 'Example Biologics'], ['jobTitle', 'Head of QA'], ['email', 'ravi@example.com']]) await fill(k, v);
    await c.eval(`${frameDoc}.querySelector('[name=consent]').click(); true`);
    await sleep(300);
    check('music keeps playing while the form is open', await music());
    await c.eval(`${frameDoc}.querySelector('button[type=submit]').click(); true`);
    await c.waitFor('!document.getElementById("s-reg").classList.contains("on")', 10000);
    const back = await c.eval('[PharmaNinja.NameEntry.vid, PharmaNinja.NameEntry.name, PharmaNinja.NameEntry.confirmed]');
    check('saved: back in the game with the badge confirmed and the first name filled in', back[0] === 'E2E-NEW1' && back[1] === 'Ravi' && back[2] === true, back);
    check('music still playing after the form', await music());
    const [v] = await sql`select full_name, registration_mode from hub.visitors where badge_id = 'E2E-NEW1'`;
    check('the visitor is registered in the Hub', v?.full_name === 'Dr. Ravi Menon' && v?.registration_mode === 'self');
    await c.eval('document.getElementById("name-go").click(); true');
    check('Choose domain then goes to the domain picker', await c.waitFor('PharmaNinja.Screens.current === "picker"', 5000).catch(() => false));

    await c.eval('document.getElementById("pk-back").click(); true');
    await c.waitFor('PharmaNinja.Screens.current === "name"');
    await reset(); await typeIn('f-vid', 'E2E-0001');
    await c.eval('document.getElementById("name-go").click(); true');
    await c.waitFor('document.getElementById("name-confirm").classList.contains("on")', 8000);
    check('a registered badge gets the welcome prompt, not the form',
      (await c.eval('document.getElementById("nc-text").textContent')) === 'Welcome, Asha — is this you?' && !(await c.eval('document.getElementById("s-reg").classList.contains("on")')));
    check('no page errors', pageErrors(c).length === 0, pageErrors(c));
  } finally { await c.close(); }
}

// ---------------------------------------------------------------------------
async function flowStandalone() {
  console.log('\nC. Standalone file (no Hub)');
  const c = await browser('standalone', 9343, null);
  try {
    await c.goto('file://' + path.join(ROOT, 'pharma-ninja-src/dist/pharma-ninja.html'));
    await c.waitFor('window.PharmaNinja && PharmaNinja.Screens.current === "attract"');
    await c.eval('document.getElementById("cta-play").click(); true');
    await c.waitFor('PharmaNinja.Screens.current === "name"');
    await c.eval('document.getElementById("f-name").click(); "Solo".split("").forEach(ch => PharmaNinja.NameEntry.type(ch)); true');
    check('badge required here too', await c.eval('document.getElementById("name-go").disabled'));
    await c.eval('document.getElementById("f-vid").click(); "ab12".split("").forEach(ch => PharmaNinja.NameEntry.type(ch)); document.getElementById("name-go").click(); true');
    await sleep(500);
    const p = await c.eval('PharmaNinja.Screens.player');
    check('plays with the badge kept unconfirmed', (await c.eval('PharmaNinja.Screens.current')) === 'picker' && p.visitorId === 'AB12' && p.badgeConfirmed === false);
    const net = c.requests().filter((u) => !u.startsWith('file:') && !u.startsWith('data:'));
    check('zero network requests', net.length === 0, net);
    check('no page errors', c.errors().length === 0, c.errors());
  } finally { await c.close(); }
}

// ---------------------------------------------------------------------------
fs.mkdirSync(TMP, { recursive: true });
const pgDir = path.join(TMP, 'pg');
fs.rmSync(pgDir, { recursive: true, force: true });
const pg = new EmbeddedPostgres({ databaseDir: pgDir, port: PG_PORT, user: 'postgres', password: 'e2e-owner', persistent: false, onLog: () => {} });
let sql;
try {
  await pg.initialise(); await pg.start();
  sql = postgres(OWNER_URL, { max: 1, onnotice: () => {} });
  await migrate(sql, { log: () => {} });
  await setHubApiPassword(sql, 'e2e-app');
  await sql`insert into hub.app_users (email, display_name, role, password_hash) values (${GAME.email}, 'E2E game screen', 'game', ${await hash(GAME.password)})`;
  const [{ v }] = await sql`select consent_version as v from hub.settings`;
  await sql`insert into hub.visitors (badge_id, full_name, company, job_title, email, consent_given, consent_version, consent_at, registration_mode)
            values ('E2E-0001', 'Dr. Asha Rao', 'Example Pharma', 'VP Clinical', 'asha@example.com', true, ${v}, now(), 'self')`;

  execSync('python3 pharma-ninja-src/build.py', { cwd: ROOT, stdio: 'ignore' });   // standalone file for flow C
  if (!process.env.SKIP_BUILD) { console.log('Building the Hub (production)…'); execSync('npm run -s build', { cwd: ROOT, stdio: 'ignore', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } }); }
  await startServer();
  const cookie = await signIn(GAME.email, GAME.password);

  await flowOffline(sql, cookie);
  await flowRegister(sql, cookie);
  await flowStandalone();
} catch (e) {
  check('test run completed', false, e.message);
} finally {
  await stopServer();
  await sql?.end();
  await pg.stop().catch(() => {});
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
