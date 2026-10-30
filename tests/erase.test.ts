/* Milestone C: right-to-erasure (one visitor) and purge (all event data).
 * Admin only, typed confirmation, exactly the right rows removed, everything else kept. */
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as purgeRoute from '@/app/api/admin/purge/route';
import * as eraseRoute from '@/app/api/admin/erase/route';
import * as adminVisitorRoute from '@/app/api/admin/visitors/[id]/route';
import { rawSql } from '@/lib/db';
import { hashPassword } from '@/lib/password';
import { login, params, req } from './helpers';

const owner = postgres(process.env.TEST_OWNER_URL!, { max: 1, onnotice: () => {} });
let admin = '', staff = '', adminId = '';

async function visitor(email: string | null, name: string): Promise<string> {
  const [{ v }] = await owner`select consent_version as v from hub.settings`;
  const [{ id }] = await owner`insert into hub.visitors (email, full_name, company, job_title, consent_given, consent_version, consent_at, registration_mode)
              values (${email}, ${name}, 'Co', 'Title', true, ${v}, now(), 'self') returning id`;
  await owner`insert into hub.interactions (visitor_id, type, notes, created_by) values (${id}, 'other', 'note', ${adminId})`;
  return id;
}
async function round(id: string, email: string) {
  await owner`select hub.game_ingest(${adminId}::uuid, ${owner.json([{ round: { roundId: id, ts: Date.now(), date: '2026-11-02', displayName: 'P',
    email, domainId: 'quality', score: 10, questions: 2, correct: 1, longestStreak: 1, endReason: 'time' },
    plays: [{ ts: Date.now(), questionId: 'q1', result: 'correct', msToSlice: 900 }, { ts: Date.now(), questionId: 'q2', result: 'missed', msToSlice: '' }] }] as never)})`;
}
const del = (id: string, confirm: string, cookie = admin) =>
  adminVisitorRoute.DELETE(req(`/api/admin/visitors/${id}`, { method: 'DELETE', cookie, body: { confirm } }), params({ id }));
const byEmail = (email: string, confirm: string, cookie = admin) =>
  eraseRoute.POST(req('/api/admin/erase', { method: 'POST', cookie, body: { email, confirm } }));
let eraseId = '', noEmailId = '';

beforeAll(async () => {
  await owner`update hub.app_users set password_hash = ${await hashPassword('admin-pass-123')} where email = 'mayank.srivastava@mresult.com'`;
  await owner`insert into hub.app_users (email, display_name, role, password_hash) values ('erase-staff@mresult.com', 'Erase Staff', 'staff', ${await hashPassword('staff-pass-123')})
              on conflict (email) do nothing`;
  admin = await login('mayank.srivastava@mresult.com', 'admin-pass-123');
  staff = await login('erase-staff@mresult.com', 'staff-pass-123');
  [{ id: adminId }] = await owner`select id from hub.app_users where email = 'mayank.srivastava@mresult.com'`;
  eraseId = await visitor('erase-0001@example.com', 'To Be Erased'); await round('erase0001a', 'erase-0001@example.com'); await round('erase0001b', 'Erase-0001@Example.com');
  await visitor('keep-0001@example.com', 'Stays Here'); await round('keep0001a', 'keep-0001@example.com');
  await round('unreg0001a', 'unreg-0042@example.com');
  noEmailId = await visitor(null, 'Nadia No-Email');
});
afterAll(async () => { await owner.end(); await rawSql().end(); });

describe('delete one visitor (right to erasure)', () => {
  it('is admin only and needs their full name typed', async () => {
    expect((await del(eraseId, 'To Be Erased', staff)).status).toBe(403);
    expect((await del(eraseId, 'Someone Else')).status).toBe(400);
    expect((await del(eraseId, '')).status).toBe(400);
    expect((await byEmail('erase-0001@example.com', 'erase-0001@example.com', staff)).status).toBe(403);
    expect((await byEmail('erase-0001@example.com', 'erase-0002@example.com')).status).toBe(400);
    const [{ n }] = await owner`select count(*)::int as n from hub.visitors where id = ${eraseId}`;
    expect(n).toBe(1);
  });
  it('removes the visitor and everything recorded against them, nothing else', async () => {
    const r = await del(eraseId, '  to be   ERASED ');   // confirmation ignores case and extra spaces
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ visitors: 1, interactions: 1, rounds: 2, plays: 4 });
    const [left] = await owner`select
      (select count(*)::int from hub.visitors where email = 'erase-0001@example.com') as v,
      (select count(*)::int from hub.interactions where visitor_id = ${eraseId}) as i,
      (select count(*)::int from hub.game_rounds where player_email = 'erase-0001@example.com') as r,
      (select count(*)::int from hub.game_plays where round_id like 'erase0001%') as p,
      (select count(*)::int from hub.visitors where email = 'keep-0001@example.com') as kv,
      (select count(*)::int from hub.game_rounds where player_email = 'keep-0001@example.com') as kr`;
    expect(left).toEqual({ v: 0, i: 0, r: 0, p: 0, kv: 1, kr: 1 });
    expect((await del(eraseId, 'To Be Erased')).status).toBe(404);
  });
  it('works for a visitor without an email', async () => {
    expect(await (await del(noEmailId, 'Nadia No-Email')).json()).toEqual({ visitors: 1, interactions: 1, rounds: 0, plays: 0 });
  });
  it('by email: also erases game rounds for an email that was never registered', async () => {
    const r = await byEmail('unreg-0042@example.com', 'Unreg-0042@Example.COM');   // case-insensitive like emails
    expect(await r.json()).toEqual({ visitors: 0, interactions: 0, rounds: 1, plays: 2 });
    expect((await byEmail('unreg-0042@example.com', 'unreg-0042@example.com')).status).toBe(404);
  });
});

describe('purge all event data', () => {
  it('is admin only and needs the exact phrase', async () => {
    expect((await purgeRoute.POST(req('/api/admin/purge', { method: 'POST', cookie: staff, body: { confirm: 'PURGE ALL EVENT DATA' } }))).status).toBe(403);
    expect((await purgeRoute.POST(req('/api/admin/purge', { method: 'POST', cookie: admin, body: { confirm: 'purge all event data' } }))).status).toBe(400);
    expect((await purgeRoute.GET(req('/api/admin/purge', { cookie: staff }))).status).toBe(403);
  });
  it('deletes every visitor, interaction, round and play, and keeps content, settings and team', async () => {
    const [before] = await owner`select (select count(*)::int from hub.questions) as q, (select count(*)::int from hub.domains) as d,
      (select count(*)::int from hub.app_users) as u, (select count(*)::int from hub.consent_versions) as c`;
    const counts = await (await purgeRoute.GET(req('/api/admin/purge', { cookie: admin }))).json();
    expect(counts.visitors).toBeGreaterThan(0);
    const r = await purgeRoute.POST(req('/api/admin/purge', { method: 'POST', cookie: admin, body: { confirm: 'PURGE ALL EVENT DATA' } }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual(counts);
    const [after] = await owner`select (select count(*)::int from hub.visitors) as v, (select count(*)::int from hub.interactions) as i,
      (select count(*)::int from hub.game_rounds) as r, (select count(*)::int from hub.game_plays) as p,
      (select count(*)::int from hub.questions) as q, (select count(*)::int from hub.domains) as d,
      (select count(*)::int from hub.app_users) as u, (select count(*)::int from hub.consent_versions) as c`;
    expect(after).toEqual({ v: 0, i: 0, r: 0, p: 0, q: before.q, d: before.d, u: before.u, c: before.c });
    // the admin is still signed in and the Hub still works
    expect((await purgeRoute.GET(req('/api/admin/purge', { cookie: admin }))).status).toBe(200);
  });
});
