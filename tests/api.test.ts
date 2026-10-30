/* API-level tests: calls the real route handlers (as Next.js would) against
 * the test database. Proves sign-in, CSRF checks, role enforcement in the API,
 * registration rules, interaction ownership, team management and the export. */
import ExcelJS from 'exceljs';
import { NextRequest } from 'next/server';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as exportRoute from '@/app/api/admin/export/route';
import * as settingsRoute from '@/app/api/admin/settings/route';
import * as usersRoute from '@/app/api/admin/users/route';
import * as userRoute from '@/app/api/admin/users/[id]/route';
import * as importRoute from '@/app/api/admin/import/route';
import * as adminVisitorRoute from '@/app/api/admin/visitors/[id]/route';
import * as loginRoute from '@/app/api/auth/login/route';
import * as interactionRoute from '@/app/api/interactions/[id]/route';
import * as interactionsRoute from '@/app/api/interactions/route';
import * as registerRoute from '@/app/api/public/register/route';
import * as visitorsRoute from '@/app/api/visitors/route';
import * as completeRoute from '@/app/api/visitors/[id]/complete/route';
import * as summaryRoute from '@/app/api/visitors/[id]/summary/route';
import { rawSql } from '@/lib/db';
import { hashPassword } from '@/lib/password';

const owner = postgres(process.env.TEST_OWNER_URL!, { max: 1, onnotice: () => {} });
const ORIGIN = 'http://localhost:3000';
let ipCounter = 0;
let meeraId = '';
const visitorId = async (email: string) => (await owner<{ id: string }[]>`select id from hub.visitors where email = ${email}`)[0].id;

function req(path: string, opts: { method?: string; body?: unknown; cookie?: string; origin?: string | null; ip?: string } = {}) {
  const headers: Record<string, string> = { host: 'localhost:3000', 'x-forwarded-for': opts.ip ?? `10.0.0.${++ipCounter % 250}` };
  if (opts.origin !== null) headers.origin = opts.origin ?? ORIGIN;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (opts.cookie) headers.cookie = `hub_session=${opts.cookie}`;
  return new NextRequest(ORIGIN + path, { method: opts.method ?? 'GET', headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const params = <T,>(p: T) => ({ params: Promise.resolve(p) });

async function login(email: string, password: string) {
  const res = await loginRoute.POST(req('/api/auth/login', { method: 'POST', body: { email, password } }));
  const cookie = res.cookies.get('hub_session')?.value;
  return { res, cookie };
}

const ADMIN = 'mayank.srivastava@mresult.com';
let adminCookie = '', staffCookie = '', staff2Cookie = '';
let staffId = '';

beforeAll(async () => {
  await owner`update hub.app_users set password_hash = ${await hashPassword('admin-pass-123')} where email = ${ADMIN}`;
  adminCookie = (await login(ADMIN, 'admin-pass-123')).cookie!;
  // Admin adds two staff members through the API.
  for (const [email, name] of [['priya@mresult.com', 'Priya Staff'], ['arjun@mresult.com', 'Arjun Staff']]) {
    const r = await usersRoute.POST(req('/api/admin/users', { method: 'POST', cookie: adminCookie,
      body: { email, displayName: name, role: 'staff', password: 'staff-pass-123' } }));
    expect(r.status).toBe(201);
    if (email.startsWith('priya')) staffId = (await r.json()).id;
  }
  staffCookie = (await login('priya@mresult.com', 'staff-pass-123')).cookie!;
  staff2Cookie = (await login('arjun@mresult.com', 'staff-pass-123')).cookie!;
});
afterAll(async () => { await owner.end(); await rawSql().end(); });

describe('sign-in', () => {
  it('gives the same message for an unknown email and a wrong password', async () => {
    const a = await login('nobody@example.com', 'whatever-123');
    const b = await login(ADMIN, 'wrong-password');
    expect(a.res.status).toBe(401);
    expect(b.res.status).toBe(401);
    expect((await a.res.json()).error).toBe((await b.res.json()).error);
    expect(a.cookie).toBeUndefined();
  });
  it('sets an httpOnly, SameSite=Lax cookie lasting 7 days', async () => {
    const { res } = await login(ADMIN, 'admin-pass-123');
    const set = res.headers.get('set-cookie')!;
    expect(set).toMatch(/HttpOnly/i);
    expect(set).toMatch(/SameSite=lax/i);
    expect(set).toMatch(/Max-Age=604800/);
  });
  it('rate-limits repeated attempts for one email', async () => {
    const statuses = [];
    for (let i = 0; i < 9; i++) statuses.push((await login('ratelimit@mresult.com', 'x')).res.status);
    expect(statuses.slice(0, 8).every((s) => s === 401)).toBe(true);
    expect(statuses[8]).toBe(429);
  });
});

describe('CSRF', () => {
  it('blocks writes without an Origin header or from another site', async () => {
    const body = { type: 'other', visitorId: '00000000-0000-4000-8000-000000000000', notes: 'n' };
    expect((await interactionsRoute.POST(req('/api/interactions', { method: 'POST', body, cookie: staffCookie, origin: null }))).status).toBe(403);
    expect((await interactionsRoute.POST(req('/api/interactions', { method: 'POST', body, cookie: staffCookie, origin: 'https://evil.example' }))).status).toBe(403);
  });
});

describe('without a login nobody can see visitor data', () => {
  it('returns 401 for every visitor/team endpoint', async () => {
    expect((await visitorsRoute.GET(req('/api/visitors'))).status).toBe(401);
    expect((await summaryRoute.GET(req(`/api/visitors/${'00000000-0000-4000-8000-000000000000'}/summary`), params({ id: '00000000-0000-4000-8000-000000000000' }))).status).toBe(401);
    expect((await exportRoute.GET(req('/api/admin/export'))).status).toBe(401);
    expect((await usersRoute.GET(req('/api/admin/users'))).status).toBe(401);
  });
});

describe('public registration', () => {
  const base = { fullName: 'Meera Iyer', company: 'Example Bio', jobTitle: 'VP Quality', email: 'meera@example.com',
    mobile: '+91 98765 43210', linkedinUrl: 'linkedin.com/in/meera', consent: true, marketingOptIn: true, consentVersion: 1 };
  it('creates, then refuses a duplicate without revealing or overwriting it', async () => {
    const r1 = await registerRoute.POST(req('/api/public/register', { method: 'POST', body: { ...base, email: ' Meera@Example.com ' } }));
    expect(r1.status).toBe(201);
    expect(await r1.json()).toEqual({ status: 'created' });
    meeraId = await visitorId('meera@example.com');
    const r2 = await registerRoute.POST(req('/api/public/register', { method: 'POST', body: { ...base, fullName: 'Impostor' } }));
    expect(r2.status).toBe(409);
    const j = await r2.json();
    expect(j.error).toBe('This email is already registered — please see the MResult team.');
    expect(JSON.stringify(j)).not.toContain('Meera');
    const [v] = await owner`select full_name, linkedin_url from hub.visitors where email = 'meera@example.com'`;
    expect(v).toEqual({ full_name: 'Meera Iyer', linkedin_url: 'https://linkedin.com/in/meera' });
  });
  it('reports field errors: missing name, missing consent, bad email', async () => {
    const r = await registerRoute.POST(req('/api/public/register', { method: 'POST',
      body: { ...base, fullName: ' ', consent: false, email: 'nope' } }));
    expect(r.status).toBe(400);
    const { fields } = await r.json();
    expect(Object.keys(fields).sort()).toEqual(['consent', 'email', 'fullName']);
  });
  it('accepts a registration without an email (blank counts as none)', async () => {
    for (const email of [undefined, '', '  ']) {
      const r = await registerRoute.POST(req('/api/public/register', { method: 'POST', body: { ...base, email, fullName: 'Ravi No-Email' } }));
      expect(r.status).toBe(201);
    }
    const [{ n }] = await owner`select count(*)::int as n from hub.visitors where full_name = 'Ravi No-Email' and email is null`;
    expect(n).toBe(3);
  });
});

describe('role enforcement in the API', () => {
  it('staff get 403 on every admin endpoint', async () => {
    expect((await usersRoute.GET(req('/api/admin/users', { cookie: staffCookie }))).status).toBe(403);
    expect((await settingsRoute.GET(req('/api/admin/settings', { cookie: staffCookie }))).status).toBe(403);
    expect((await exportRoute.GET(req('/api/admin/export', { cookie: staffCookie }))).status).toBe(403);
    expect((await adminVisitorRoute.PATCH(req(`/api/admin/visitors/${meeraId}`, { method: 'PATCH', cookie: staffCookie, body: {} }),
      params({ id: meeraId }))).status).toBe(403);
    expect((await importRoute.POST(req('/api/admin/import', { method: 'POST', cookie: staffCookie, body: { csv: 'Name,Company\nA,B' } }))).status).toBe(403);
    expect((await userRoute.PATCH(req(`/api/admin/users/${staffId}`, { method: 'PATCH', cookie: staffCookie, body: { role: 'admin' } }),
      params({ id: staffId }))).status).toBe(403);
  });
  it('staff can search and look up visitors', async () => {
    const r = await visitorsRoute.GET(req('/api/visitors?q=meera', { cookie: staffCookie }));
    expect((await r.json()).items.map((i: { email: string }) => i.email)).toEqual(['meera@example.com']);
    const s = await summaryRoute.GET(req(`/api/visitors/${meeraId}/summary`, { cookie: staffCookie }), params({ id: meeraId }));
    expect(await s.json()).toEqual({ found: true, id: meeraId, email: 'meera@example.com', fullName: 'Meera Iyer', company: 'Example Bio',
      jobTitle: 'VP Quality', registered: true });
    const bad = await summaryRoute.GET(req('/api/visitors/meera@example.com/summary', { cookie: staffCookie }), params({ id: 'meera@example.com' }));
    expect(await bad.json()).toEqual({ found: false });
  });
});

describe('interactions', () => {
  let convId = '';
  it('staff log a conversation (met by defaults handled by the form; API needs metBy)', async () => {
    const r = await interactionsRoute.POST(req('/api/interactions', { method: 'POST', cookie: staffCookie, body: {
      type: 'conversation', visitorId: meeraId, metBy: staffId, problemStatement: 'Slow trial start-up', domainTags: ['Clinical Trials', 'Other'],
      interestLevel: 'hot', nextStep: 'Send case summary', followUpOwner: staffId, followUpDate: '2026-11-10' } }));
    expect(r.status).toBe(201);
    convId = (await r.json()).id;
  });
  it('refuses an unregistered visitor and offers registration', async () => {
    const r = await interactionsRoute.POST(req('/api/interactions', { method: 'POST', cookie: staffCookie,
      body: { type: 'other', visitorId: '00000000-0000-4000-8000-000000000000', notes: 'hi' } }));
    expect(r.status).toBe(404);
    expect((await r.json()).notRegistered).toBe(true);
  });
  it('rejects domain tags that are not in the list', async () => {
    const r = await interactionsRoute.POST(req('/api/interactions', { method: 'POST', cookie: staffCookie, body: {
      type: 'conversation', visitorId: meeraId, metBy: staffId, domainTags: ['Made Up'], interestLevel: 'warm' } }));
    expect(r.status).toBe(400);
  });
  it('another staff member cannot edit or delete it; the creator and admins can', async () => {
    const body = { type: 'other', visitorId: meeraId, notes: 'changed' };
    expect((await interactionRoute.PATCH(req(`/api/interactions/${convId}`, { method: 'PATCH', cookie: staff2Cookie, body }), params({ id: convId }))).status).toBe(404);
    expect((await interactionRoute.DELETE(req(`/api/interactions/${convId}`, { method: 'DELETE', cookie: staff2Cookie }), params({ id: convId }))).status).toBe(404);
    expect((await interactionRoute.PATCH(req(`/api/interactions/${convId}`, { method: 'PATCH', cookie: staffCookie,
      body: { type: 'conversation', visitorId: meeraId, metBy: staffId, interestLevel: 'warm', nextStep: 'Call on Monday' } }), params({ id: convId }))).status).toBe(200);
    // a second note by staff2, deleted by the admin
    const r = await interactionsRoute.POST(req('/api/interactions', { method: 'POST', cookie: staff2Cookie, body: { type: 'other', visitorId: meeraId, notes: 'n' } }));
    const id = (await r.json()).id;
    expect((await interactionRoute.DELETE(req(`/api/interactions/${id}`, { method: 'DELETE', cookie: adminCookie }), params({ id }))).status).toBe(200);
  });
  it('enforces the podcast topic list once the admin has set one', async () => {
    const s = await (await settingsRoute.GET(req('/api/admin/settings', { cookie: adminCookie }))).json();
    const put = await settingsRoute.PUT(req('/api/admin/settings', { method: 'PUT', cookie: adminCookie,
      body: { ...s, podcastTopics: ['AI in clinical trials'], demos: ['Data platform tour'] } }));
    expect(put.status).toBe(200);
    expect((await put.json()).consentVersion).toBe(1);   // consent text unchanged → same version
    const bad = await interactionsRoute.POST(req('/api/interactions', { method: 'POST', cookie: staffCookie,
      body: { type: 'podcast', visitorId: meeraId, podcastTopic: 'Something else', podcastConsentSigned: true } }));
    expect(bad.status).toBe(400);
    const ok = await interactionsRoute.POST(req('/api/interactions', { method: 'POST', cookie: staffCookie,
      body: { type: 'podcast', visitorId: meeraId, podcastTopic: 'AI in clinical trials', podcastConsentSigned: true } }));
    expect(ok.status).toBe(201);
  });
  it('changing the consent text creates a new version', async () => {
    const s = await (await settingsRoute.GET(req('/api/admin/settings', { cookie: adminCookie }))).json();
    const put = await settingsRoute.PUT(req('/api/admin/settings', { method: 'PUT', cookie: adminCookie, body: { ...s, noticeText: s.noticeText + ' (v2)' } }));
    expect((await put.json()).consentVersion).toBe(2);
  });
});

describe('admin edits a visitor email', () => {
  it('a corrected email takes the game rounds along; refuses an email already in use', async () => {
    const [me] = await owner`select id from hub.app_users where email = ${ADMIN}`;
    await owner`select hub.game_ingest(${me.id}::uuid, ${owner.json([{ round: { roundId: 'fix00001', ts: Date.now(), date: '2026-11-02', displayName: 'Ty',
      email: 'typo@exmaple.com', domainId: 'clinical', score: 5, questions: 1, correct: 1, longestStreak: 1, endReason: 'time' }, plays: [] }] as never)})`;
    const reg = await registerRoute.POST(req('/api/public/register', { method: 'POST', body: { fullName: 'Tanya Rao', company: 'Example Co', jobTitle: 'Head of IT',
      email: 'typo@exmaple.com', consent: true, consentVersion: (await owner`select consent_version as v from hub.settings`)[0].v } }));
    expect(reg.status).toBe(201);
    const id = await visitorId('typo@exmaple.com');
    await interactionsRoute.POST(req('/api/interactions', { method: 'POST', cookie: staffCookie, body: { type: 'other', visitorId: id, notes: 'Met at the bar' } }));
    const patch = (to: string | null) => adminVisitorRoute.PATCH(req(`/api/admin/visitors/${id}`, { method: 'PATCH', cookie: adminCookie,
      body: { email: to, fullName: 'Tanya Rao', company: 'Example Co', jobTitle: 'Head of IT', marketingOptIn: false } }), params({ id }));
    expect((await patch('meera@example.com')).status).toBe(409);            // already someone else's
    const ok = await patch('Tanya@Example.com');
    expect(await ok.json()).toEqual({ ok: true });
    const [left] = await owner`select
      (select email from hub.visitors where id = ${id}) as email,
      (select count(*)::int from hub.interactions where visitor_id = ${id}) as i,
      (select count(*)::int from hub.game_rounds where player_email = 'tanya@example.com') as r,
      (select count(*)::int from hub.game_rounds where player_email = 'typo@exmaple.com') as old`;
    expect(left).toEqual({ email: 'tanya@example.com', i: 1, r: 1, old: 0 });
    expect((await patch(null)).status).toBe(200);                           // the email can be removed
  });
});

describe('pre-seeding from the organisers\' list', () => {
  const csv = [
    'Name,Organisation,Designation,Mobile,Notes',
    'Priya Menon,Example Pharma,Head of Regulatory,+91 90000 11111,x',
    'Priya Menon,Example Pharma,Head of Regulatory,,duplicate in the file',
    'Arun Das,,Director,,no company',
    'Lakshmi Rao,Example Labs,,12,bad mobile',
    'meera iyer,example bio,VP Quality,,already registered',
  ].join('\n');
  let priyaId = '';
  it('imports name and company, skips people already there, reports bad rows', async () => {
    const r = await importRoute.POST(req('/api/admin/import', { method: 'POST', cookie: adminCookie, body: { csv } }));
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j).toEqual({ added: 2, alreadyThere: 2, skipped: [{ row: 4, reasons: ['Company is required.'] }], cleared: [{ row: 5, fields: ['mobile'] }] });
    const again = await (await importRoute.POST(req('/api/admin/import', { method: 'POST', cookie: adminCookie, body: { csv } }))).json();
    expect(again.added).toBe(0);
    const [p] = await owner`select id, email, job_title, consent_given, consent_version, registration_mode from hub.visitors where full_name = 'Priya Menon'`;
    expect(p).toMatchObject({ email: null, job_title: 'Head of Regulatory', consent_given: false, consent_version: null, registration_mode: 'import' });
    priyaId = p.id;
  });
  it('reads an Excel file too, with First name / Last name columns', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Delegates');
    ws.addRow(['First Name', 'Last Name', 'Company Name', 'Job Title']);
    ws.addRow(['Sanjay', 'Gupta', 'Example Health', 'CIO']);
    const xlsx = Buffer.from(await wb.xlsx.writeBuffer()).toString('base64');
    const j = await (await importRoute.POST(req('/api/admin/import', { method: 'POST', cookie: adminCookie, body: { xlsx } }))).json();
    expect(j.added).toBe(1);
    const [v] = await owner`select company, job_title from hub.visitors where full_name = 'Sanjay Gupta'`;
    expect(v).toEqual({ company: 'Example Health', job_title: 'CIO' });
  });
  it('staff find them by name as not registered, can log an interaction, then complete their registration', async () => {
    const items = (await (await visitorsRoute.GET(req('/api/visitors?q=priya', { cookie: staffCookie }))).json()).items;
    expect(items).toMatchObject([{ id: priyaId, fullName: 'Priya Menon', registered: false, email: null }]);
    expect((await interactionsRoute.POST(req('/api/interactions', { method: 'POST', cookie: staffCookie,
      body: { type: 'other', visitorId: priyaId, notes: 'Stopped by' } }))).status).toBe(201);
    const v = (await owner`select consent_version as v from hub.settings`)[0].v;
    const complete = (body: object) => completeRoute.POST(req(`/api/visitors/${priyaId}/complete`, { method: 'POST', cookie: staffCookie,
      body: { fullName: 'Priya Menon', company: 'Example Pharma', jobTitle: 'Head of Regulatory', consent: true, consentVersion: v, ...body } }), params({ id: priyaId }));
    expect((await complete({ email: 'meera@example.com' })).status).toBe(409);   // someone else's email
    expect((await complete({ consent: false })).status).toBe(400);
    const ok = await complete({ email: 'Priya@Example.com', marketingOptIn: true });
    expect(ok.status).toBe(200);
    const [p] = await owner`select email, consent_given, consent_version, marketing_opt_in, updated_by is not null as by from hub.visitors where id = ${priyaId}`;
    expect(p).toEqual({ email: 'priya@example.com', consent_given: true, consent_version: v, marketing_opt_in: true, by: true });
    expect((await complete({})).status).toBe(409);   // already registered
  });
});

describe('team management', () => {
  it('removing a person signs them out at once; admins cannot remove themselves', async () => {
    const [arjun] = await owner`select id from hub.app_users where email = 'arjun@mresult.com'`;
    expect((await visitorsRoute.GET(req('/api/visitors', { cookie: staff2Cookie }))).status).toBe(200);
    const r = await userRoute.PATCH(req(`/api/admin/users/${arjun.id}`, { method: 'PATCH', cookie: adminCookie, body: { active: false } }), params({ id: arjun.id }));
    expect(r.status).toBe(200);
    expect((await visitorsRoute.GET(req('/api/visitors', { cookie: staff2Cookie }))).status).toBe(401);
    expect((await login('arjun@mresult.com', 'staff-pass-123')).res.status).toBe(401);
    const [me] = await owner`select id from hub.app_users where email = ${ADMIN}`;
    expect((await userRoute.PATCH(req(`/api/admin/users/${me.id}`, { method: 'PATCH', cookie: adminCookie, body: { active: false } }), params({ id: me.id }))).status).toBe(400);
  });
});

describe('Excel export', () => {
  it('produces every sheet with the visitor, touchpoints and an unmatched game email', async () => {
    const [me] = await owner`select id from hub.app_users where email = ${ADMIN}`;
    // own question, so this test does not depend on the seed still being there
    await owner`insert into hub.questions (id, domain_id, question_text, options, correct_index, difficulty, source)
      values ('exp-q1', 'clinical', 'What is the single EU portal for trial applications?', '{CTIS,EudraCT,IRIS,Other}', 0, 1, 'Real')
      on conflict (id) do nothing`;
    await owner`select hub.game_ingest(${me.id}::uuid, ${owner.json([
      { round: { roundId: 'exp00001', ts: Date.now(), date: '2026-11-02', displayName: 'Meera', email: 'meera@example.com', emailConfirmed: true,
        domainId: 'clinical', score: 250, questions: 3, correct: 3, longestStreak: 3, endReason: 'time' },
        plays: [{ ts: Date.now(), questionId: 'exp-q1', result: 'correct', msToSlice: 900 }] },
      { round: { roundId: 'exp00002', ts: Date.now(), date: '2026-11-02', displayName: 'Guest', email: 'unreg-9@example.com',
        domainId: 'genai', score: 40, questions: 2, correct: 1, longestStreak: 1, endReason: 'lives' }, plays: [] },
    ] as never)})`;
    const res = await exportRoute.GET(req('/api/admin/export', { cookie: adminCookie }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('spreadsheetml');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await res.arrayBuffer()) as never);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Visitors', 'Conversations', 'Podcast guests', 'Demos', 'Other notes',
      'Game rounds', 'Game plays', 'Unmatched emails']);
    const visitors = wb.getWorksheet('Visitors')!;
    const header = (visitors.getRow(1).values as string[]).slice(1);
    const meera = visitors.getRows(2, visitors.rowCount - 1)!.map((r) => Object.fromEntries(header.map((h, i) => [h, r.getCell(i + 1).value])))
      .find((r) => r['Email'] === 'meera@example.com')!;
    expect(meera).toMatchObject({ Conversations: 1, Podcast: 1, 'Game rounds': 1, 'Best game score': 250, 'Latest interest': 'warm',
      'Latest next step': 'Call on Monday', 'Marketing opt-in': 'yes' });
    const unmatched = wb.getWorksheet('Unmatched emails')!;
    expect(unmatched.getColumn(1).values).toContain('unreg-9@example.com');
    expect(unmatched.getColumn(1).values).not.toContain('meera@example.com');
    // pre-seeded people who never registered and have no touchpoint are not in the Visitors sheet
    expect(visitors.getColumn(2).values).not.toContain('Lakshmi Rao');
    expect(visitors.getColumn(2).values).toContain('Priya Menon');
    const plays = wb.getWorksheet('Game plays')!;
    const mine = plays.getRows(2, plays.rowCount - 1)!.find((r) => r.getCell(2).value === 'exp00001')!;
    expect(mine.getCell(7).value).toBe('exp-q1');
    const rounds = wb.getWorksheet('Game rounds')!;
    const sentBy = (rounds.getRow(1).values as string[]).indexOf('Sent by (account)');
    const r1 = rounds.getRows(2, rounds.rowCount - 1)!.find((r) => r.getCell(2).value === 'exp00001')!;
    expect(r1.getCell(sentBy).value).toBe('Mayank Srivastava');
    expect(mine.getCell(8).value).toMatch(/single EU portal/);
  });
});
