/* Proves role enforcement at the database level: what each role
 * (hub_api, hub_public, hub_device, hub_user as staff / admin / removed)
 * can and cannot do, using the real migrations and the app's own db helpers. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { asDevice, asPublic, asUser, pgCode, rawSql } from '@/lib/db';
import { createSession, userForToken } from '@/lib/session';

const owner = postgres(process.env.TEST_OWNER_URL!, { max: 1, onnotice: () => {} });
const ids: Record<'admin' | 'staff1' | 'staff2' | 'removed', string> = {} as never;
const as = (k: keyof typeof ids) => ({ id: ids[k] });

async function denied(p: Promise<unknown>) {
  try { await p; } catch (e) { return pgCode(e) === '42501'; }
  return false;
}

let consentVersion = 1;   // other test files may have published a newer notice
const reg = (badgeId: string) => ({
  badgeId, fullName: 'Dr. Asha Rao', company: 'Example Pharma', jobTitle: 'Head of Clinical Ops', email: 'asha@example.com',
  mobile: null, linkedinUrl: null, consent: true, marketingOptIn: false, consentVersion,
});

beforeAll(async () => {
  [{ consentVersion }] = await owner`select consent_version as "consentVersion" from hub.settings`;
  for (const [k, role, active] of [['staff1', 'staff', true], ['staff2', 'staff', true], ['removed', 'staff', false]] as const) {
    const [r] = await owner`insert into hub.app_users (email, display_name, role, active, password_hash)
                            values (${k + '@mresult.com'}, ${k}, ${role}, ${active}, 'x') returning id`;
    ids[k] = r.id;
  }
  const [a] = await owner`select id from hub.app_users where email = 'mayank.srivastava@mresult.com'`;
  ids.admin = a.id;
});
afterAll(async () => { await owner.end(); await rawSql().end(); });

describe('hub_api (the server login) on its own', () => {
  it('cannot read any table directly', async () => {
    expect(await denied(rawSql()`select * from hub.visitors`)).toBe(true);
    expect(await denied(rawSql()`select * from hub.app_users`)).toBe(true);
    expect(await denied(rawSql()`select * from hub.sessions`)).toBe(true);
  });
});

describe('hub_public (registration form)', () => {
  it('has no table access at all', async () => {
    expect(await denied(asPublic((tx) => tx`select * from hub.visitors`))).toBe(true);
    expect(await denied(asPublic((tx) => tx`insert into hub.visitors (badge_id) values ('X')`))).toBe(true);
    expect(await denied(asPublic((tx) => tx`select * from hub.app_users`))).toBe(true);
  });
  it('registers once, then reports "exists" without overwriting', async () => {
    const r1 = await asPublic((tx) => tx`select hub.register_visitor_public(${tx.json(reg(' pub-001 '))}) as r`);
    expect(r1[0].r).toBe('created');
    const changed = { ...reg('PUB-001'), fullName: 'Someone Else' };
    const r2 = await asPublic((tx) => tx`select hub.register_visitor_public(${tx.json(changed)}) as r`);
    expect(r2[0].r).toBe('exists');
    const [v] = await owner`select full_name, created_by, registration_mode from hub.visitors where badge_id = 'PUB-001'`;
    expect(v).toEqual({ full_name: 'Dr. Asha Rao', created_by: null, registration_mode: 'self' });
  });
  it('rejects badge IDs that break the format rule and stale consent versions', async () => {
    const bad = await asPublic((tx) => tx`select hub.register_visitor_public(${tx.json(reg('ab'))}) as r`);
    expect(bad[0].r).toBe('invalid_badge');
    const stale = await asPublic((tx) => tx`select hub.register_visitor_public(${tx.json({ ...reg('PUB-777'), consentVersion: 99 })}) as r`);
    expect(stale[0].r).toBe('stale_consent');
  });
});

describe('hub_device (game devices)', () => {
  it('cannot read visitors, interactions, team or rounds', async () => {
    for (const t of ['visitors', 'interactions', 'app_users', 'game_rounds', 'questions', 'device_keys']) {
      expect(await denied(asDevice((tx) => tx.unsafe(`select * from hub.${t}`)))).toBe(true);
    }
  });
  it('badge lookup returns only found + first name (honorific skipped)', async () => {
    const rows = await asDevice((tx) => tx`select * from hub.device_lookup(' pub-001')`);
    expect(rows).toEqual([{ found: true, first_name: 'Asha' }]);
    const none = await asDevice((tx) => tx`select * from hub.device_lookup('NOPE-1')`);
    expect(none).toEqual([{ found: false, first_name: null }]);
  });
  it('gets the 8 seeded domains and 45 questions in the game shape', async () => {
    const [{ c }] = await asDevice((tx) => tx`select hub.device_content() as c`);
    expect(c.domains).toHaveLength(8);
    expect(c.questions).toHaveLength(45);
    expect(Object.keys(c.domains[0]).sort()).toEqual(['accent', 'desc', 'enabled', 'icon', 'id', 'name']);
    expect(c.domains.map((d: { id: string }) => d.id)).toEqual(['clinical', 'quality', 'mfg', 'rnd', 'genai', 'data', 'business', 'india']);
  });
  it('ingests a round exactly once, even when re-sent', async () => {
    const [dev] = await owner`insert into hub.device_keys (label, key_hash, key_prefix, created_by)
                              values ('test', '\\x01', 'pnk_t', ${ids.admin}) returning id`;
    const item = { round: { roundId: 'r1abcdef', ts: Date.now(), date: '2026-11-02', displayName: 'Asha', visitorId: 'pub-001',
      badgeConfirmed: true, domainId: 'clinical', score: 180, questions: 2, correct: 2, longestStreak: 2, endReason: 'time' },
      plays: [{ ts: Date.now(), questionId: 'ct-03', result: 'correct', msToSlice: 1200 },
              { ts: Date.now(), questionId: 'ct-06', result: 'missed', msToSlice: '' }] };
    for (let i = 0; i < 3; i++) {
      const [{ r }] = await asDevice((tx) => tx`select hub.device_ingest(${dev.id}::uuid, ${tx.json([item])}) as r`);
      expect(r).toEqual({ acked: ['r1abcdef'], rejected: [] });
    }
    const [{ n }] = await owner`select count(*)::int as n from hub.game_plays where round_id = 'r1abcdef'`;
    expect(n).toBe(2);
    const [round] = await owner`select badge_id, badge_confirmed from hub.game_rounds where round_id = 'r1abcdef'`;
    expect(round).toEqual({ badge_id: 'PUB-001', badge_confirmed: true });
  });
  it('rejects a malformed item without blocking the others', async () => {
    const [dev] = await owner`select id from hub.device_keys limit 1`;
    const good = { round: { roundId: 'r2abcdef', ts: Date.now(), date: '2026-11-02', displayName: 'X', visitorId: '',
      domainId: 'quality', score: 0, questions: 0, correct: 0, longestStreak: 0, endReason: 'lives' }, plays: [] };
    const bad = { round: { ...good.round, roundId: 'r3abcdef', endReason: 'exploded' }, plays: [] };
    const [{ r }] = await asDevice((tx) => tx`select hub.device_ingest(${dev.id}::uuid, ${tx.json([bad, good])}) as r`);
    expect(r.acked).toEqual(['r2abcdef']);
    expect(r.rejected[0].roundId).toBe('r3abcdef');
  });
});

describe('hub_user (signed-in team members)', () => {
  it('without a signed-in person sees nothing and can write nothing', async () => {
    const rows = await rawSql().begin(async (tx) => { await tx.unsafe('set local role hub_user'); return tx`select * from hub.visitors`; });
    expect(rows).toHaveLength(0);
  });

  it('staff can read visitors and register as themselves, but not as someone else', async () => {
    expect((await asUser(as('staff1'), (tx) => tx`select badge_id from hub.visitors`)).length).toBeGreaterThan(0);
    await asUser(as('staff1'), (tx) => tx`insert into hub.visitors (badge_id, full_name, company, job_title, email, consent_given,
      consent_version, consent_at, registration_mode, created_by)
      values ('STAFF-01', 'Ravi Kumar', 'Co', 'Lead', 'r@example.com', true, 1, now(), 'staff', ${ids.staff1})`);
    await expect(asUser(as('staff1'), (tx) => tx`insert into hub.visitors (badge_id, full_name, company, job_title, email, consent_given,
      consent_version, consent_at, registration_mode, created_by)
      values ('STAFF-02', 'X', 'Co', 'Lead', 'x@example.com', true, 1, now(), 'staff', ${ids.staff2})`)).rejects.toThrow(/row-level security/);
  });

  it('staff cannot edit or delete visitors; admin can', async () => {
    const upd = await asUser(as('staff1'), (tx) => tx`update hub.visitors set company = 'Hacked' where badge_id = 'STAFF-01' returning 1`);
    expect(upd).toHaveLength(0);
    const del = await asUser(as('staff1'), (tx) => tx`delete from hub.visitors where badge_id = 'STAFF-01' returning 1`);
    expect(del).toHaveLength(0);
    const ok = await asUser(as('admin'), (tx) => tx`update hub.visitors set company = 'Fixed Co' where badge_id = 'STAFF-01' returning 1`);
    expect(ok).toHaveLength(1);
  });

  it('staff edit/delete only their own interactions; admin any', async () => {
    const [i] = await asUser(as('staff1'), (tx) => tx`insert into hub.interactions (badge_id, type, notes, created_by)
      values ('STAFF-01', 'other', 'hello', ${ids.staff1}) returning id`);
    expect((await asUser(as('staff2'), (tx) => tx`update hub.interactions set notes = 'x' where id = ${i.id} returning 1`))).toHaveLength(0);
    expect((await asUser(as('staff2'), (tx) => tx`delete from hub.interactions where id = ${i.id} returning 1`))).toHaveLength(0);
    expect((await asUser(as('staff1'), (tx) => tx`update hub.interactions set notes = 'edited' where id = ${i.id} returning 1`))).toHaveLength(1);
    await expect(asUser(as('staff2'), (tx) => tx`insert into hub.interactions (badge_id, type, notes, created_by)
      values ('STAFF-01', 'other', 'pretend', ${ids.staff1})`)).rejects.toThrow(/row-level security/);
    expect((await asUser(as('admin'), (tx) => tx`delete from hub.interactions where id = ${i.id} returning 1`))).toHaveLength(1);
  });

  it('staff cannot see password hashes, manage the team, change settings, or see questions and device keys', async () => {
    expect(await denied(asUser(as('staff1'), (tx) => tx`select password_hash from hub.app_users`))).toBe(true);
    await expect(asUser(as('staff1'), (tx) => tx`insert into hub.app_users (email, display_name, role) values ('z@mresult.com', 'Z', 'admin')`))
      .rejects.toThrow(/row-level security/);
    expect(await asUser(as('staff1'), (tx) => tx`update hub.app_users set role = 'admin' where id = ${ids.staff1} returning 1`)).toHaveLength(0);
    expect(await asUser(as('staff1'), (tx) => tx`update hub.settings set demos = '{x}' returning 1`)).toHaveLength(0);
    expect(await asUser(as('staff1'), (tx) => tx`select id from hub.questions`)).toHaveLength(0);
    expect(await denied(asUser(as('staff1'), (tx) => tx`select key_hash from hub.device_keys`))).toBe(true);
    expect(await asUser(as('admin'), (tx) => tx`select id from hub.questions`)).toHaveLength(45);
  });

  it('a removed person is treated as nobody', async () => {
    expect(await asUser(as('removed'), (tx) => tx`select badge_id from hub.visitors`)).toHaveLength(0);
  });
});

describe('sessions', () => {
  it('removing a person or changing their role ends their sessions immediately', async () => {
    const token = await createSession(ids.staff2);
    expect((await userForToken(token))?.id).toBe(ids.staff2);
    await asUser(as('admin'), (tx) => tx`update hub.app_users set role = 'admin' where id = ${ids.staff2}`);
    expect(await userForToken(token)).toBeNull();
    const token2 = await createSession(ids.staff2);
    await asUser(as('admin'), (tx) => tx`update hub.app_users set active = false where id = ${ids.staff2}`);
    expect(await userForToken(token2)).toBeNull();
  });
});

describe('question rules in the database (backstop for the API)', () => {
  const insert = (opts: string[], correct = 0, text = 'Valid question?') =>
    asUser(as('admin'), (tx) => tx`insert into hub.questions (id, domain_id, question_text, options, correct_index, difficulty)
      values (${'t-' + Math.random().toString(36).slice(2, 8)}, 'quality', ${text}, ${tx.array(opts)}::text[], ${correct}, 1)`);
  it('rejects bad options', async () => {
    await expect(insert(['a', 'b', 'c'])).rejects.toThrow(/check/);                                // 3 options
    await expect(insert(['a', 'b', 'c', 'd', 'e', 'f'])).rejects.toThrow(/check/);                 // 6 options
    await expect(insert(['one two three four five', 'b', 'c', 'd'])).rejects.toThrow(/check/);     // 5 words
    await expect(insert(['x'.repeat(29), 'b', 'c', 'd'])).rejects.toThrow(/check/);                // 29 chars
    await expect(insert(['a', 'a', 'c', 'd'])).rejects.toThrow(/check/);                           // duplicate
    await expect(insert(['a', 'b', 'c', 'd'], 4)).rejects.toThrow(/check/);                        // correct out of range
    await expect(insert(['a', 'b', 'c', 'd'], 0, 'q'.repeat(121))).rejects.toThrow(/check/);       // text > 120
    await expect(insert(['Good Manufacturing Practice', 'b', 'c', 'd'])).resolves.toBeDefined();   // 27 chars, 3 words
  });
});
