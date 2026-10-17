/* Milestone C: right-to-erasure (one visitor) and purge (all event data).
 * Admin only, typed confirmation, exactly the right rows removed, everything else kept. */
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as purgeRoute from '@/app/api/admin/purge/route';
import * as adminVisitorRoute from '@/app/api/admin/visitors/[badge]/route';
import { rawSql } from '@/lib/db';
import { hashPassword } from '@/lib/password';
import { login, params, req } from './helpers';

const owner = postgres(process.env.TEST_OWNER_URL!, { max: 1, onnotice: () => {} });
let admin = '', staff = '', adminId = '';

async function visitor(badge: string, name: string) {
  const [{ v }] = await owner`select consent_version as v from hub.settings`;
  await owner`insert into hub.visitors (badge_id, full_name, company, job_title, email, consent_given, consent_version, consent_at, registration_mode)
              values (${badge}, ${name}, 'Co', 'Title', 'x@example.com', true, ${v}, now(), 'self')`;
  await owner`insert into hub.interactions (badge_id, type, notes, created_by) values (${badge}, 'other', 'note', ${adminId})`;
}
async function round(id: string, badge: string) {
  await owner`select hub.game_ingest(${adminId}::uuid, ${owner.json([{ round: { roundId: id, ts: Date.now(), date: '2026-11-02', displayName: 'P',
    visitorId: badge, domainId: 'quality', score: 10, questions: 2, correct: 1, longestStreak: 1, endReason: 'time' },
    plays: [{ ts: Date.now(), questionId: 'q1', result: 'correct', msToSlice: 900 }, { ts: Date.now(), questionId: 'q2', result: 'missed', msToSlice: '' }] }] as never)})`;
}
const del = (badge: string, confirm: string, cookie = admin) =>
  adminVisitorRoute.DELETE(req(`/api/admin/visitors/${badge}`, { method: 'DELETE', cookie, body: { confirm } }), params({ badge }));

beforeAll(async () => {
  await owner`update hub.app_users set password_hash = ${await hashPassword('admin-pass-123')} where email = 'mayank.srivastava@mresult.com'`;
  await owner`insert into hub.app_users (email, display_name, role, password_hash) values ('erase-staff@mresult.com', 'Erase Staff', 'staff', ${await hashPassword('staff-pass-123')})
              on conflict (email) do nothing`;
  admin = await login('mayank.srivastava@mresult.com', 'admin-pass-123');
  staff = await login('erase-staff@mresult.com', 'staff-pass-123');
  [{ id: adminId }] = await owner`select id from hub.app_users where email = 'mayank.srivastava@mresult.com'`;
  await visitor('ERASE-0001', 'To Be Erased'); await round('erase0001a', 'ERASE-0001'); await round('erase0001b', 'erase-0001');
  await visitor('KEEP-0001', 'Stays Here'); await round('keep0001a', 'KEEP-0001');
  await round('unreg0001a', 'UNREG-0042');
});
afterAll(async () => { await owner.end(); await rawSql().end(); });

describe('delete one visitor (right to erasure)', () => {
  it('is admin only and needs the badge typed again', async () => {
    expect((await del('ERASE-0001', 'ERASE-0001', staff)).status).toBe(403);
    expect((await del('ERASE-0001', 'ERASE-0002')).status).toBe(400);
    expect((await del('ERASE-0001', '')).status).toBe(400);
    const [{ n }] = await owner`select count(*)::int as n from hub.visitors where badge_id = 'ERASE-0001'`;
    expect(n).toBe(1);
  });
  it('removes the visitor and everything recorded against the badge, nothing else', async () => {
    const r = await del('ERASE-0001', 'erase-0001');   // confirmation is case-insensitive like badge IDs
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ visitors: 1, interactions: 1, rounds: 2, plays: 4 });
    const [left] = await owner`select
      (select count(*)::int from hub.visitors where badge_id = 'ERASE-0001') as v,
      (select count(*)::int from hub.interactions where badge_id = 'ERASE-0001') as i,
      (select count(*)::int from hub.game_rounds where badge_id = 'ERASE-0001') as r,
      (select count(*)::int from hub.game_plays where round_id like 'erase0001%') as p,
      (select count(*)::int from hub.visitors where badge_id = 'KEEP-0001') as kv,
      (select count(*)::int from hub.game_rounds where badge_id = 'KEEP-0001') as kr`;
    expect(left).toEqual({ v: 0, i: 0, r: 0, p: 0, kv: 1, kr: 1 });
    expect((await del('ERASE-0001', 'ERASE-0001')).status).toBe(404);
  });
  it('also erases game rounds for a badge that was never registered', async () => {
    const r = await del('UNREG-0042', 'UNREG-0042');
    expect(await r.json()).toEqual({ visitors: 0, interactions: 0, rounds: 1, plays: 2 });
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
