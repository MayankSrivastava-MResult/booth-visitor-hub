/* Milestone B API tests: game content admin (CRUD, CSV import/export, TEST
 * delete), game screen accounts, and the game API (content, badge lookup,
 * round sync) used by Pharma Ninja with a normal sign-in. */
import Papa from 'papaparse';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as exportRoute from '@/app/api/admin/export/route';
import * as usersRoute from '@/app/api/admin/users/route';
import * as userRoute from '@/app/api/admin/users/[id]/route';
import * as domainRoute from '@/app/api/admin/domains/[id]/route';
import * as domainsRoute from '@/app/api/admin/domains/route';
import * as questionRoute from '@/app/api/admin/questions/[id]/route';
import * as deleteTestRoute from '@/app/api/admin/questions/delete-test/route';
import * as exportCsvRoute from '@/app/api/admin/questions/export/route';
import * as importRoute from '@/app/api/admin/questions/import/route';
import * as questionsRoute from '@/app/api/admin/questions/route';
import * as contentRoute from '@/app/api/game/content/route';
import * as lookupRoute from '@/app/api/game/lookup/route';
import * as roundsRoute from '@/app/api/game/rounds/route';
import * as interactionsRoute from '@/app/api/interactions/route';
import * as loginRoute from '@/app/api/auth/login/route';
import * as visitorsRoute from '@/app/api/visitors/route';
import * as summaryRoute from '@/app/api/visitors/[badge]/summary/route';
import { rawSql } from '@/lib/db';
import { hashPassword } from '@/lib/password';
import { CSV_HEADER } from '@/lib/questions';
import { login, params, req } from './helpers';

const owner = postgres(process.env.TEST_OWNER_URL!, { max: 1, onnotice: () => {} });
let admin = '', staff = '', game = '', gameId = '';

beforeAll(async () => {
  await owner`update hub.app_users set password_hash = ${await hashPassword('admin-pass-123')} where email = 'mayank.srivastava@mresult.com'`;
  await owner`insert into hub.app_users (email, display_name, role, password_hash) values ('gstaff@mresult.com', 'Game Staff', 'staff', ${await hashPassword('staff-pass-123')})
              on conflict (email) do nothing`;
  admin = await login('mayank.srivastava@mresult.com', 'admin-pass-123');
  staff = await login('gstaff@mresult.com', 'staff-pass-123');
  // a registered visitor for the badge lookup
  await owner`insert into hub.visitors (badge_id, full_name, company, job_title, email, consent_given, consent_version, consent_at, registration_mode)
              values ('GAME-0001', 'Prof. Élodie Martin', 'Example Bio', 'CSO', 'e@example.com', true, 1, now(), 'self') on conflict do nothing`;
});
afterAll(async () => { await owner.end(); await rawSql().end(); });

describe('content admin is admin-only', () => {
  it('staff get 403 everywhere', async () => {
    expect((await domainsRoute.GET(req('/api/admin/domains', { cookie: staff }))).status).toBe(403);
    expect((await questionsRoute.GET(req('/api/admin/questions', { cookie: staff }))).status).toBe(403);
    expect((await importRoute.POST(req('/api/admin/questions/import', { method: 'POST', cookie: staff, body: { csv: '' } }))).status).toBe(403);
    expect((await exportCsvRoute.GET(req('/api/admin/questions/export', { cookie: staff }))).status).toBe(403);
    expect((await deleteTestRoute.POST(req('/api/admin/questions/delete-test', { method: 'POST', cookie: staff, body: { confirm: 'TEST' } }))).status).toBe(403);
  });
});

describe('domains and questions CRUD with the game rules', () => {
  it('creates a domain, rejects bad ones', async () => {
    const bad = await domainsRoute.POST(req('/api/admin/domains', { method: 'POST', cookie: admin,
      body: { id: 'Bad Id', name: '', description: 'x', iconKey: 'rocket', accent: 'orange', enabled: true, sortOrder: 90 } }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).errors).toHaveLength(4);
    const ok = await domainsRoute.POST(req('/api/admin/domains', { method: 'POST', cookie: admin,
      body: { id: 'regops', name: 'Regulatory Ops', description: 'Submissions and labelling', iconKey: 'shield', accent: '#5ec2b0', enabled: true, sortOrder: 90 } }));
    expect(ok.status).toBe(201);
  });
  it('rejects a question that breaks a rule, with the reason', async () => {
    const r = await questionsRoute.POST(req('/api/admin/questions', { method: 'POST', cookie: admin, body: {
      id: 'ro-01', domainId: 'regops', questionText: 'What is an eCTD?', options: ['Electronic Common Technical Document', 'B', 'C', 'D'],
      correctIndex: 0, difficulty: 1, enabled: true } }));
    expect(r.status).toBe(400);
    const { errors } = await r.json();
    expect(errors.join(' ')).toMatch(/is 36 characters \(max 28\)/);
  });
  it('creates, edits and blocks deleting a domain that has questions', async () => {
    const body = { id: 'ro-01', domainId: 'regops', questionText: 'What is an eCTD used for?', options: ['Regulatory submissions', 'Lab notes', 'Payroll', 'Shipping'],
      correctIndex: 0, difficulty: 1, explanation: 'eCTD is the standard format for submissions.', source: 'Real', enabled: true };
    expect((await questionsRoute.POST(req('/api/admin/questions', { method: 'POST', cookie: admin, body }))).status).toBe(201);
    expect((await questionsRoute.POST(req('/api/admin/questions', { method: 'POST', cookie: admin, body }))).status).toBe(409);
    expect((await questionRoute.PATCH(req('/api/admin/questions/ro-01', { method: 'PATCH', cookie: admin, body: { ...body, difficulty: 2, options: [...body.options, 'Marketing'] } }),
      params({ id: 'ro-01' }))).status).toBe(200);
    const [q] = await owner`select difficulty, cardinality(options) as n from hub.questions where id = 'ro-01'`;
    expect(q).toEqual({ difficulty: 2, n: 5 });
    expect((await domainRoute.DELETE(req('/api/admin/domains/regops', { method: 'DELETE', cookie: admin }), params({ id: 'regops' }))).status).toBe(409);
  });
});

describe('CSV import and export', () => {
  const row = (cells: string[]) => Papa.unparse([cells]);
  it('refuses a file whose header is not the locked layout', async () => {
    const r = await importRoute.POST(req('/api/admin/questions/import', { method: 'POST', cookie: admin, body: { csv: 'id,question\nx,y' } }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toContain(CSV_HEADER.join(', '));
  });
  it('imports valid rows, updates existing ids, lists skipped rows with reasons', async () => {
    const csv = '﻿' + [CSV_HEADER.join(','),
      row(['ro-02', 'regops', 'Which agency, in the US, approves new drugs?', 'FDA', 'EMA', 'PMDA', 'CDSCO', '', '1', '1', 'The FDA, of course.', 'Real', 'yes']),
      row(['ct-01', 'clinical', 'Updated: when did ICH E6(R3) take effect in the EU?', '1 January 2024', '31 January 2025', '23 July 2025', '1 January 2026', '', '3', '3', 'Edited.', 'TEST - Darshan prototype', 'yes']),
      row(['ro-03', 'regops', 'Too wordy option here?', 'one two three four five', 'B', 'C', 'D', '', '1', '1', '', '', 'yes']),
      row(['ro-04', 'nowhere', 'Unknown domain?', 'A', 'B', 'C', 'D', '', '1', '1', '', '', 'no']),
      row(['ro-02', 'regops', 'Duplicate id in file?', 'A', 'B', 'C', 'D', '', '1', '1', '', '', 'yes']),
    ].join('\r\n');
    const r = await importRoute.POST(req('/api/admin/questions/import', { method: 'POST', cookie: admin, body: { csv } }));
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.created).toBe(1);
    expect(j.updated).toBe(1);
    expect(j.skipped.map((s: { row: number }) => s.row)).toEqual([4, 5, 6]);
    expect(j.skipped[0].reasons.join(' ')).toMatch(/5 words/);
    expect(j.skipped[1].reasons.join(' ')).toMatch(/unknown domainId/);
    const [ct] = await owner`select question_text, correct_index from hub.questions where id = 'ct-01'`;
    expect(ct).toEqual({ question_text: 'Updated: when did ICH E6(R3) take effect in the EU?', correct_index: 2 });
    const [ro] = await owner`select question_text from hub.questions where id = 'ro-02'`;
    expect(ro.question_text).toBe('Which agency, in the US, approves new drugs?');   // commas inside quotes survive
  });
  it('export → import changes nothing (round trip)', async () => {
    const res = await exportCsvRoute.GET(req('/api/admin/questions/export', { cookie: admin }));
    expect(res.headers.get('content-type')).toContain('text/csv');
    const bytes = Buffer.from(await res.arrayBuffer());
    expect([...bytes.subarray(0, 3)]).toEqual([0xEF, 0xBB, 0xBF]);            // UTF-8 BOM so Excel reads symbols correctly
    const csv = bytes.toString('utf8');
    expect(csv.replace(/^﻿/, '').startsWith(CSV_HEADER.join(',') + '\r\n')).toBe(true);
    const before = await owner`select * from hub.questions order by id`;
    const r = await importRoute.POST(req('/api/admin/questions/import', { method: 'POST', cookie: admin, body: { csv } }));
    const j = await r.json();
    expect(j.skipped).toEqual([]);
    expect(j.created).toBe(0);
    expect(j.updated).toBe(before.length);
    const after = await owner`select id, domain_id, question_text, options, correct_index, difficulty, explanation, source, enabled from hub.questions order by id`;
    expect(after).toEqual(before.map(({ id, domain_id, question_text, options, correct_index, difficulty, explanation, source, enabled }) =>
      ({ id, domain_id, question_text, options, correct_index, difficulty, explanation, source, enabled })));
  });
});

describe('game screen accounts and the game API', () => {
  it('admin adds a game account; signing in sends it straight to the game', async () => {
    const r = await usersRoute.POST(req('/api/admin/users', { method: 'POST', cookie: admin,
      body: { email: 'game@mresult.com', displayName: 'Booth game screens', role: 'game', password: 'game-pass-123' } }));
    expect(r.status).toBe(201);
    gameId = (await r.json()).id;
    const res = await loginRoute.POST(req('/api/auth/login', { method: 'POST', body: { email: 'game@mresult.com', password: 'game-pass-123' } }));
    expect(await res.json()).toEqual({ ok: true, next: '/play' });
    game = res.cookies.get('hub_session')!.value;
    // the same account signed in on a second screen at the same time
    const second = await login('game@mresult.com', 'game-pass-123');
    expect(second).not.toBe(game);
    expect((await contentRoute.GET(req('/api/game/content', { cookie: second }))).status).toBe(200);
    // staff and admin sign-ins land on the Hub home page
    const a = await loginRoute.POST(req('/api/auth/login', { method: 'POST', body: { email: 'mayank.srivastava@mresult.com', password: 'admin-pass-123' } }));
    expect((await a.json()).next).toBe('/');
  });
  it('a game account is refused by every Hub endpoint (403)', async () => {
    expect((await visitorsRoute.GET(req('/api/visitors', { cookie: game }))).status).toBe(403);
    expect((await summaryRoute.GET(req('/api/visitors/GAME-0001/summary', { cookie: game }), params({ badge: 'GAME-0001' }))).status).toBe(403);
    expect((await interactionsRoute.POST(req('/api/interactions', { method: 'POST', cookie: game, body: { type: 'other', badgeId: 'GAME-0001', notes: 'x' } }))).status).toBe(403);
    expect((await exportRoute.GET(req('/api/admin/export', { cookie: game }))).status).toBe(403);
    expect((await questionsRoute.GET(req('/api/admin/questions', { cookie: game }))).status).toBe(403);
    expect((await usersRoute.GET(req('/api/admin/users', { cookie: game }))).status).toBe(403);
  });
  it('content needs a sign-in, returns the game shape, and supports 304', async () => {
    expect((await contentRoute.GET(req('/api/game/content'))).status).toBe(401);
    const r = await contentRoute.GET(req('/api/game/content', { cookie: game }));
    expect(r.status).toBe(200);
    const c = await r.json();
    expect(c.domains.map((d: { id: string }) => d.id)).toContain('regops');
    expect(c.questions.find((q: { id: string }) => q.id === 'ro-02')).toMatchObject({ domainId: 'regops', correctIndex: 0, options: ['FDA', 'EMA', 'PMDA', 'CDSCO'] });
    const etag = r.headers.get('etag')!;
    expect((await contentRoute.GET(req('/api/game/content', { cookie: game, headers: { 'if-none-match': etag } }))).status).toBe(304);
    // staff and admin can run the game too
    expect((await contentRoute.GET(req('/api/game/content', { cookie: staff }))).status).toBe(200);
  });
  it('badge lookup returns ONLY {found, firstName}', async () => {
    const r = await lookupRoute.POST(req('/api/game/lookup', { method: 'POST', cookie: game, body: { badgeId: ' game-0001 ' } }));
    expect(await r.json()).toEqual({ found: true, firstName: 'Élodie' });
    const n = await lookupRoute.POST(req('/api/game/lookup', { method: 'POST', cookie: game, body: { badgeId: 'NOPE-1234' } }));
    expect(await n.json()).toEqual({ found: false, firstName: null });
    const bad = await lookupRoute.POST(req('/api/game/lookup', { method: 'POST', cookie: game, body: { badgeId: '<script>' } }));
    expect(await bad.json()).toEqual({ found: false, firstName: null });
    expect((await lookupRoute.POST(req('/api/game/lookup', { method: 'POST', body: { badgeId: 'GAME-0001' } }))).status).toBe(401);
  });
  it('game POSTs from another site are blocked (CSRF)', async () => {
    expect((await lookupRoute.POST(req('/api/game/lookup', { method: 'POST', cookie: game, origin: 'https://evil.example', body: { badgeId: 'GAME-0001' } }))).status).toBe(403);
    expect((await roundsRoute.POST(req('/api/game/rounds', { method: 'POST', cookie: game, origin: null, body: { items: [] } }))).status).toBe(403);
  });
  it('badge lookup is rate-limited per account', async () => {
    await owner`insert into hub.app_users (email, display_name, role, password_hash) values ('rate@mresult.com', 'Rate test', 'game', ${await hashPassword('rate-pass-123')})`;
    const k = await login('rate@mresult.com', 'rate-pass-123');
    const statuses: number[] = [];
    for (let i = 0; i < 62; i++) statuses.push((await lookupRoute.POST(req('/api/game/lookup', { method: 'POST', cookie: k, ip: `10.9.${i}.1`, body: { badgeId: `TRY-${1000 + i}` } }))).status);
    expect(statuses.filter((s) => s === 200)).toHaveLength(60);
    expect(statuses.slice(60)).toEqual([429, 429]);
  });
  it('round sync is idempotent and records the account that sent it', async () => {
    const item = { round: { roundId: 'syncr0001', ts: Date.now(), date: '2026-11-02', displayName: 'Elodie', visitorId: 'GAME-0001', badgeConfirmed: true,
      domainId: 'regops', score: 140, questions: 2, correct: 2, longestStreak: 2, endReason: 'cleared' },
      plays: [{ ts: Date.now(), questionId: 'ro-01', result: 'correct', msToSlice: 1500 }, { ts: Date.now(), questionId: 'ro-02', result: 'correct', msToSlice: 2100 }] };
    const broken = { round: { ...item.round, roundId: 'syncr0002', score: -5 }, plays: [] };
    for (let i = 0; i < 3; i++) {
      const r = await roundsRoute.POST(req('/api/game/rounds', { method: 'POST', cookie: game, body: { items: [item, broken] } }));
      const j = await r.json();
      expect(j.acked).toEqual(['syncr0001']);
      expect(j.rejected.map((x: { roundId: string }) => x.roundId)).toEqual(['syncr0002']);
    }
    const [{ n }] = await owner`select count(*)::int as n from hub.game_plays where round_id = 'syncr0001'`;
    expect(n).toBe(2);
    const [g] = await owner`select badge_id, badge_confirmed, created_by from hub.game_rounds where round_id = 'syncr0001'`;
    expect(g).toEqual({ badge_id: 'GAME-0001', badge_confirmed: true, created_by: gameId });
  });
  it('removing the game account signs out every screen at once', async () => {
    expect((await userRoute.PATCH(req(`/api/admin/users/${gameId}`, { method: 'PATCH', cookie: admin, body: { active: false } }), params({ id: gameId }))).status).toBe(200);
    expect((await contentRoute.GET(req('/api/game/content', { cookie: game }))).status).toBe(401);
    expect((await roundsRoute.POST(req('/api/game/rounds', { method: 'POST', cookie: game, body: { items: [] } }))).status).toBe(401);
  });
});

describe('delete TEST questions', () => {
  it('needs the typed confirmation, then removes only TEST questions', async () => {
    // a play on a TEST question, recorded before the delete
    await owner`select hub.game_ingest((select id from hub.app_users where email = 'mayank.srivastava@mresult.com'), ${owner.json([{ round: { roundId: 'deltest01', ts: Date.now(), date: '2026-11-02', displayName: 'X',
      visitorId: '', domainId: 'clinical', score: 0, questions: 1, correct: 0, longestStreak: 0, endReason: 'time' },
      plays: [{ ts: Date.now(), questionId: 'ct-03', result: 'missed', msToSlice: '' }] }] as never)})`;
    const before = await (await deleteTestRoute.GET(req('/api/admin/questions/delete-test', { cookie: admin }))).json();
    expect(before.count).toBe(45);
    expect((await deleteTestRoute.POST(req('/api/admin/questions/delete-test', { method: 'POST', cookie: admin, body: { confirm: 'test' } }))).status).toBe(400);
    const r = await deleteTestRoute.POST(req('/api/admin/questions/delete-test', { method: 'POST', cookie: admin, body: { confirm: 'TEST' } }));
    expect((await r.json()).deleted).toBe(45);
    const left = await owner`select id, source from hub.questions order by id`;
    expect(left.filter((q) => q.source.startsWith('TEST'))).toEqual([]);
    expect(left.map((q) => q.id)).toEqual(expect.arrayContaining(['ro-01', 'ro-02']));
    // plays recorded for deleted questions keep their question text
    const [p] = await owner`select question_text from hub.game_plays where question_id = 'ct-03' limit 1`;
    expect(p?.question_text ?? null).not.toBeNull();
  });
});
