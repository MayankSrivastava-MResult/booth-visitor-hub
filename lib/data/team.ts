/* The team list (who can sign in), and settings (badge rule, consent text,
 * podcast topics, demo list). Admin-only writes are enforced here and by RLS. */
import { asUser, pgCode, PG } from '../db';
import { hashPassword } from '../password';
import type { SessionUser } from '../session';
import type { RegistrationConfig } from '../validation';

export type TeamMember = { id: string; email: string; displayName: string; role: 'admin' | 'staff'; active: boolean };

export async function listTeam(user: SessionUser, { activeOnly = false } = {}): Promise<TeamMember[]> {
  return asUser(user, (tx) => tx<TeamMember[]>`
    select id, email, display_name as "displayName", role, active from hub.app_users
    where ${!activeOnly} or active
    order by active desc, display_name`);
}

export type AddUserResult = { ok: true; id: string } | { ok: false; reason: 'exists' };

/** Add a person, or re-activate a removed person with the same email. */
export async function addTeamMember(admin: SessionUser,
  input: { email: string; displayName: string; role: 'admin' | 'staff'; password: string }): Promise<AddUserResult> {
  const hash = await hashPassword(input.password);
  return asUser(admin, async (tx) => {
    const [existing] = await tx<{ id: string; active: boolean }[]>`select id, active from hub.app_users where email = ${input.email}`;
    if (existing?.active) return { ok: false as const, reason: 'exists' as const };
    if (existing) {
      await tx`update hub.app_users set active = true, display_name = ${input.displayName}, role = ${input.role},
                 password_hash = ${hash}, updated_by = ${admin.id} where id = ${existing.id}`;
      return { ok: true as const, id: existing.id };
    }
    try {
      const [row] = await tx<{ id: string }[]>`
        insert into hub.app_users (email, display_name, role, password_hash, created_by)
        values (${input.email}, ${input.displayName}, ${input.role}, ${hash}, ${admin.id}) returning id`;
      return { ok: true as const, id: row.id };
    } catch (e) {
      if (pgCode(e) === PG.uniqueViolation) return { ok: false as const, reason: 'exists' as const };
      throw e;
    }
  });
}

export type EditUserResult = 'ok' | 'not_found' | 'self';

/** Change name, role, active (remove/restore) or reset password. Ends that person's sessions
 *  when role, active or password changes (database trigger). Admins cannot demote or remove themselves. */
export async function editTeamMember(admin: SessionUser, id: string,
  input: { displayName?: string; role?: 'admin' | 'staff'; active?: boolean; password?: string }): Promise<EditUserResult> {
  if (id === admin.id && ((input.role && input.role !== 'admin') || input.active === false)) return 'self';
  // Only the fields sent are written. (The SET clause must not read password_hash:
  // the hub_user role is deliberately not allowed to read that column.)
  const changes: Record<string, string | boolean> = { updated_by: admin.id };
  if (input.displayName !== undefined) changes.display_name = input.displayName;
  if (input.role !== undefined) changes.role = input.role;
  if (input.active !== undefined) changes.active = input.active;
  if (input.password) changes.password_hash = await hashPassword(input.password);
  const rows = await asUser(admin, (tx) => tx`
    update hub.app_users set ${tx(changes)} where id = ${id} returning id`);
  return rows.length ? 'ok' : 'not_found';
}

export type Settings = RegistrationConfig & { podcastTopics: string[]; demos: string[] };

export async function getSettings(user: SessionUser): Promise<Settings> {
  const [row] = await asUser(user, (tx) => tx<Settings[]>`
    select s.badge_pattern as "badgePattern", s.badge_hint as "badgeHint", s.consent_version as "consentVersion",
           c.notice_text as "noticeText", c.marketing_text as "marketingText",
           s.podcast_topics as "podcastTopics", s.demos
    from hub.settings s join hub.consent_versions c on c.version = s.consent_version where s.id = 1`);
  return row;
}

/** Save settings. Changing either consent text creates a new consent version;
 *  visitors keep the version they agreed to. */
export async function saveSettings(admin: SessionUser, input: Omit<Settings, 'consentVersion'>): Promise<number> {
  return asUser(admin, async (tx) => {
    const [cur] = await tx<{ version: number; notice: string; marketing: string }[]>`
      select s.consent_version as version, c.notice_text as notice, c.marketing_text as marketing
      from hub.settings s join hub.consent_versions c on c.version = s.consent_version where s.id = 1`;
    let version = cur.version;
    if (cur.notice !== input.noticeText || cur.marketing !== input.marketingText) {
      const [next] = await tx<{ v: number }[]>`select coalesce(max(version), 0) + 1 as v from hub.consent_versions`;
      version = next.v;
      await tx`insert into hub.consent_versions (version, notice_text, marketing_text, created_by)
               values (${version}, ${input.noticeText}, ${input.marketingText}, ${admin.id})`;
    }
    await tx`update hub.settings set badge_pattern = ${input.badgePattern}, badge_hint = ${input.badgeHint},
               consent_version = ${version}, podcast_topics = ${tx.array(input.podcastTopics)}::text[],
               demos = ${tx.array(input.demos)}::text[], updated_by = ${admin.id}
             where id = 1`;
    return version;
  });
}

/** Domain names for the conversation "domain tags" picker (the game's domains, plus "Other"). */
export async function domainTagOptions(user: SessionUser): Promise<string[]> {
  const rows = await asUser(user, (tx) => tx<{ name: string }[]>`select name from hub.domains order by sort_order, id`);
  return [...rows.map((r) => r.name), 'Other'];
}
