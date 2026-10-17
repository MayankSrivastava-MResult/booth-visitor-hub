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
import * as adminVisitorRoute from '@/app/api/admin/visitors/[badge]/route';
import * as loginRoute from '@/app/api/auth/login/route';
import * as interactionRoute from '@/app/api/interactions/[id]/route';
import * as interactionsRoute from '@/app/api/interactions/route';
import * as registerRoute from '@/app/api/public/register/route';
import * as visitorsRoute from '@/app/api/visitors/route';
import * as summaryRoute from '@/app/api/visitors/[badge]/summary/route';
import { rawSql } from '@/lib/db';
import { hashPassword } from '@/lib/password';

const owner = postgres(process.env.TEST_OWNER_URL!, { max: 1, onnotice: () => {} });
const ORIGIN = 'http://localhost:3000';
let ipCounter = 0;

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
    const body = { type: 'other', badgeId: 'X', notes: 'n' };
    expect((await interactionsRoute.POST(req('/api/interactions', { method: 'POST', body, cookie: staffCookie, origin: null }))).status).toBe(403);
    expect((await interactionsRoute.POST(req('/api/interactions', { method: 'POST', body, cookie: staffCookie, origin: 'https://evil.example' }))).status).toBe(403);
  });
});

describe('without a login nobody can see visitor data', () => {
  it('returns 401 for every visitor/team endpoint', async () => {
    expect((await visitorsRoute.GET(req('/api/visitors'))).status).toBe(401);
    expect((await summaryRoute.GET(req('/api/visitors/PUB-001/summary'), params({ badge: 'PUB-001' }))).status).toBe(401);
    expect((await exportRoute.GET(req('/api/admin/export'))).status).toBe(401);
    expect((await usersRoute.GET(req('/api/admin/users'))).status).toBe(401);
  });
});

describe('public registration', () => {
  const base = { fullName: 'Meera Iyer', company: 'Example Bio', jobTitle: 'VP Quality', email: 'meera@example.com',
    mobile: '+91 98765 43210', linkedinUrl: 'linkedin.com/in/meera', consent: true, marketingOptIn: true, consentVersion: 1 };
  it('creates, then refuses a duplicate without revealing or overwriting it', async () => {
    const r1 = await registerRoute.POST(req('/api/public/register', { method: 'POST', body: { ...base, badgeId: ' gpps-1001 ' } }));
    expect(r1.status).toBe(201);
    expect(await r1.json()).toEqual({ status: 'created', badgeId: 'GPPS-1001' });
    const r2 = await registerRoute.POST(req('/api/public/register', { method: 'POST', body: { ...base, badgeId: 'GPPS-1001', fullName: 'Impostor' } }));
    expect(r2.status).toBe(409);
    const j = await r2.json();
    expect(j.error).toBe('This badge is already registered — please see the MResult team.');
    expect(JSON.stringify(j)).not.toContain('Meera');
    const [v] = await owner`select full_name, linkedin_url from hub.visitors where badge_id = 'GPPS-1001'`;
    expect(v).toEqual({ full_name: 'Meera Iyer', linkedin_url: 'https://linkedin.com/in/meera' });
  });
  it('reports field errors: bad badge, missing consent, bad email', async () => {
    const r = await registerRoute.POST(req('/api/public/register', { method: 'POST',
      body: { ...base, badgeId: 'a!', consent: false, email: 'nope' } }));
    expect(r.status).toBe(400);
    const { fields } = await r.json();
    expect(Object.keys(fields).sort()).toEqual(['badgeId', 'consent', 'email']);
  });
});

describe('role enforcement in the API', () => {
  it('staff get 403 on every admin endpoint', async () => {
    expect((await usersRoute.GET(req('/api/admin/users', { cookie: staffCookie }))).status).toBe(403);
    expect((await settingsRoute.GET(req('/api/admin/settings', { cookie: staffCookie }))).status).toBe(403);
    expect((await exportRoute.GET(req('/api/admin/export', { cookie: staffCookie }))).status).toBe(403);
    expect((await adminVisitorRoute.PATCH(req('/api/admin/visitors/GPPS-1001', { method: 'PATCH', cookie: staffCookie, body: {} }),
      params({ badge: 'GPPS-1001' }))).status).toBe(403);
    expect((await userRoute.PATCH(req(`/api/admin/users/${staffId}`, { method: 'PATCH', cookie: staffCookie, body: { role: 'admin' } }),
      params({ id: staffId }))).status).toBe(403);
  });
  it('staff can search and look up visitors', async () => {
    const r = await visitorsRoute.GET(req('/api/visitors?q=meera', { cookie: staffCookie }));
    expect((await r.json()).items.map((i: { badgeId: string }) => i.badgeId)).toEqual(['GPPS-1001']);
    const s = await summaryRoute.GET(req('/api/visitors/gpps-1001/summary', { cookie: staffCookie }), params({ badge: 'gpps-1001' }));
    expect(await s.json()).toEqual({ found: true, badgeId: 'GPPS-1001', fullName: 'Meera Iyer', company: 'Example Bio', jobTitle: 'VP Quality' });
  });
});

describe('interactions', () => {
  let convId = '';
  it('staff log a conversation (met by defaults handled by the form; API needs metBy)', async () => {
    const r = await interactionsRoute.POST(req('/api/interactions', { method: 'POST', cookie: staffCookie, body: {
      type: 'conversation', badgeId: 'gpps-1001', metBy: staffId, problemStatement: 'Slow trial start-up', domainTags: ['Clinical Trials', 'Other'],
      interestLevel: 'hot', nextStep: 'Send case summary', followUpOwner: staffId, followUpDate: '2026-11-10' } }));
    expect(r.status).toBe(201);
    convId = (await r.json()).id;
  });
  it('refuses an unregistered badge and offers registration', async () => {
    const r = await interactionsRoute.POST(req('/api/interactions', { method: 'POST', cookie: staffCookie,
      body: { type: 'other', badgeId: 'NOT-HERE', notes: 'hi' } }));
    expect(r.status).toBe(404);
    expect((await r.json()).notRegistered).toBe(true);
  });
  it('rejects domain tags that are not in the list', async () => {
    const r = await interactionsRoute.POST(req('/api/interactions', { method: 'POST', cookie: staffCookie, body: {
      type: 'conversation', badgeId: 'GPPS-1001', metBy: staffId, domainTags: ['Made Up'], interestLevel: 'warm' } }));
    expect(r.status).toBe(400);
  });
  it('another staff member cannot edit or delete it; the creator and admins can', async () => {
    const body = { type: 'other', badgeId: 'GPPS-1001', notes: 'changed' };
    expect((await interactionRoute.PATCH(req(`/api/interactions/${convId}`, { method: 'PATCH', cookie: staff2Cookie, body }), params({ id: convId }))).status).toBe(404);
    expect((await interactionRoute.DELETE(req(`/api/interactions/${convId}`, { method: 'DELETE', cookie: staff2Cookie }), params({ id: convId }))).status).toBe(404);
    expect((await interactionRoute.PATCH(req(`/api/interactions/${convId}`, { method: 'PATCH', cookie: staffCookie,
      body: { type: 'conversation', badgeId: 'GPPS-1001', metBy: staffId, interestLevel: 'warm', nextStep: 'Call on Monday' } }), params({ id: convId }))).status).toBe(200);
    // a second note by staff2, deleted by the admin
    const r = await interactionsRoute.POST(req('/api/interactions', { method: 'POST', cookie: staff2Cookie, body: { type: 'other', badgeId: 'GPPS-1001', notes: 'n' } }));
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
      body: { type: 'podcast', badgeId: 'GPPS-1001', podcastTopic: 'Something else', podcastConsentSigned: true } }));
    expect(bad.status).toBe(400);
    const ok = await interactionsRoute.POST(req('/api/interactions', { method: 'POST', cookie: staffCookie,
      body: { type: 'podcast', badgeId: 'GPPS-1001', podcastTopic: 'AI in clinical trials', podcastConsentSigned: true } }));
    expect(ok.status).toBe(201);
  });
  it('changing the consent text creates a new version', async () => {
    const s = await (await settingsRoute.GET(req('/api/admin/settings', { cookie: adminCookie }))).json();
    const put = await settingsRoute.PUT(req('/api/admin/settings', { method: 'PUT', cookie: adminCookie, body: { ...s, noticeText: s.noticeText + ' (v2)' } }));
    expect((await put.json()).consentVersion).toBe(2);
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
  it('produces every sheet with the visitor, touchpoints and an unmatched game badge', async () => {
    const [dev] = await owner`insert into hub.device_keys (label, key_hash, key_prefix, created_by)
      select 'Booth laptop', '\\x02', 'pnk_b', id from hub.app_users where email = ${ADMIN} returning id`;
    await owner`select hub.device_ingest(${dev.id}::uuid, ${owner.json([
      { round: { roundId: 'exp00001', ts: Date.now(), date: '2026-11-02', displayName: 'Meera', visitorId: 'GPPS-1001', badgeConfirmed: true,
        domainId: 'clinical', score: 250, questions: 3, correct: 3, longestStreak: 3, endReason: 'time' },
        plays: [{ ts: Date.now(), questionId: 'ct-03', result: 'correct', msToSlice: 900 }] },
      { round: { roundId: 'exp00002', ts: Date.now(), date: '2026-11-02', displayName: 'Guest', visitorId: 'UNREG-9',
        domainId: 'genai', score: 40, questions: 2, correct: 1, longestStreak: 1, endReason: 'lives' }, plays: [] },
    ] as never)})`;
    const res = await exportRoute.GET(req('/api/admin/export', { cookie: adminCookie }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('spreadsheetml');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await res.arrayBuffer()) as never);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Visitors', 'Conversations', 'Podcast guests', 'Demos', 'Other notes',
      'Game rounds', 'Game plays', 'Unmatched badge IDs']);
    const visitors = wb.getWorksheet('Visitors')!;
    const header = (visitors.getRow(1).values as string[]).slice(1);
    const meera = visitors.getRows(2, visitors.rowCount - 1)!.map((r) => Object.fromEntries(header.map((h, i) => [h, r.getCell(i + 1).value])))
      .find((r) => r['Badge ID'] === 'GPPS-1001')!;
    expect(meera).toMatchObject({ Conversations: 1, Podcast: 1, 'Game rounds': 1, 'Best game score': 250, 'Latest interest': 'warm',
      'Latest next step': 'Call on Monday', 'Marketing opt-in': 'yes' });
    expect(wb.getWorksheet('Unmatched badge IDs')!.getRow(2).getCell(1).value).toBe('UNREG-9');
    expect(wb.getWorksheet('Game plays')!.getRow(2).getCell(8).value).toMatch(/single EU portal/);
  });
});
