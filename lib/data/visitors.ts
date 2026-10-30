/* Visitors, identified by an internal id; email is optional (unique when given).
 * Registration (public, staff-assisted, completing a pre-seeded visitor), the
 * admin pre-seed import, search (Log interaction picks a visitor by name, company
 * or email), the visitor detail timeline, and admin edits. Game rounds belong to
 * a visitor through the email the player typed. */
import { asPublic, asUser, pgCode, PG } from '../db';
import type { SessionUser } from '../session';
import type { ImportRow, Registration, RegistrationConfig, VisitorEdit } from '../validation';

export async function getRegistrationConfig(): Promise<RegistrationConfig> {
  const [row] = await asPublic((tx) => tx<{ cfg: RegistrationConfig }[]>`select hub.registration_config() as cfg`);
  return row.cfg;
}

export type RegisterResult = 'created' | 'exists' | 'invalid_email' | 'stale_consent';

/** Public form. Never reveals or overwrites an existing record. */
export async function registerPublic(input: Registration): Promise<RegisterResult> {
  const [row] = await asPublic((tx) =>
    tx<{ result: RegisterResult }[]>`select hub.register_visitor_public(${tx.json(input)}) as result`);
  return row.result;
}

/** Staff-assisted mode: recorded as created by the signed-in team member. */
export async function registerByStaff(user: SessionUser, input: Registration, cfg: RegistrationConfig):
  Promise<{ result: RegisterResult; id?: string }> {
  if (input.consentVersion !== cfg.consentVersion) return { result: 'stale_consent' };
  try {
    const [row] = await asUser(user, (tx) => tx<{ id: string }[]>`
      insert into hub.visitors (email, full_name, company, job_title, mobile, linkedin_url,
                                consent_given, consent_version, consent_at, marketing_opt_in, registration_mode, created_by)
      values (${input.email}, ${input.fullName}, ${input.company}, ${input.jobTitle},
              ${input.mobile}, ${input.linkedinUrl}, true, ${cfg.consentVersion}, now(), ${input.marketingOptIn},
              'staff', ${user.id})
      returning id`);
    return { result: 'created', id: row.id };
  } catch (e) {
    if (pgCode(e) === PG.uniqueViolation) return { result: 'exists' };
    throw e;
  }
}

export type CompleteResult = 'ok' | 'not_found' | 'already_registered' | 'email_taken' | 'stale_consent';

/** Staff complete a pre-seeded visitor's registration in person (consent recorded now). */
export async function completeRegistration(user: SessionUser, id: string, input: Registration): Promise<CompleteResult> {
  const [row] = await asUser(user, (tx) =>
    tx<{ r: CompleteResult }[]>`select hub.complete_registration(${id}::uuid, ${tx.json(input)}) as r`);
  return row.r;
}

/** Admin pre-seed import. Skips anyone already there (same email, or same name and
 *  company) and repeats within the file. Returns how many were added. */
export async function importVisitors(admin: SessionUser, rows: ImportRow[]): Promise<number> {
  const [{ added }] = await asUser(admin, (tx) => tx<{ added: number }[]>`
    with r as (
      select * from jsonb_to_recordset(${tx.json(rows)})
        as r("fullName" text, company text, "jobTitle" text, email text, mobile text, "linkedinUrl" text)),
    ins as (
      insert into hub.visitors (email, full_name, company, job_title, mobile, linkedin_url,
                                consent_given, registration_mode, created_by)
      select distinct on (lower(r."fullName"), lower(r.company))
             r.email, r."fullName", r.company, r."jobTitle", r.mobile, r."linkedinUrl", false, 'import', ${admin.id}::uuid
      from r
      where not exists (select 1 from hub.visitors v
                        where v.email = r.email
                           or (lower(v.full_name) = lower(r."fullName") and lower(v.company) = lower(r.company)))
      on conflict (email) do nothing
      returning 1)
    select count(*)::int as added from ins`);
  return added;
}

export type VisitorSummary = { id: string; email: string | null; fullName: string; company: string; jobTitle: string | null;
  registered: boolean };
export type VisitorListItem = VisitorSummary & { createdAt: Date };

/** Search by name, company or email (any part). An exact email first, then newest first.
 *  An empty search lists the latest registrations (not the pre-seeded list). */
export async function searchVisitors(user: SessionUser, q: string, limit = 50): Promise<VisitorListItem[]> {
  const term = q.trim();
  const like = `%${term.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
  return asUser(user, (tx) => tx<VisitorListItem[]>`
    select id, email, full_name as "fullName", company, job_title as "jobTitle", consent_given as registered,
           created_at as "createdAt"
    from hub.visitors
    where (${term === ''} and consent_given) or full_name ilike ${like} or company ilike ${like} or email ilike ${like}
    order by (email is not null and email = lower(${term})) desc, created_at desc
    limit ${limit}`);
}

export async function visitorSummary(user: SessionUser, id: string): Promise<VisitorSummary | null> {
  const rows = await asUser(user, (tx) => tx<VisitorSummary[]>`
    select id, email, full_name as "fullName", company, job_title as "jobTitle", consent_given as registered
    from hub.visitors where id = ${id}`);
  return rows[0] ?? null;
}

export type Visitor = VisitorSummary & {
  mobile: string | null; linkedinUrl: string | null;
  consentVersion: number | null; consentAt: Date | null; marketingOptIn: boolean;
  registrationMode: 'self' | 'staff' | 'import'; createdAt: Date; createdByName: string | null;
  updatedAt: Date; updatedByName: string | null;
};

export type TimelineItem =
  | { kind: 'interaction'; id: string; type: 'conversation' | 'podcast' | 'demo' | 'other'; at: Date;
      createdBy: string; createdByName: string; notes: string | null;
      metByName: string | null; metBy: string | null; problemStatement: string | null; domainTags: string[] | null;
      interestLevel: string | null; nextStep: string | null; followUpOwner: string | null; followUpOwnerName: string | null;
      followUpDate: string | null; podcastTopic: string | null; podcastConsentSigned: boolean | null; demoName: string | null }
  | { kind: 'game'; roundId: string; at: Date; displayName: string; domainName: string; score: number;
      correct: number; questions: number; emailConfirmed: boolean };

export async function visitorDetail(user: SessionUser, id: string): Promise<{ visitor: Visitor; timeline: TimelineItem[] } | null> {
  return asUser(user, async (tx) => {
    const [visitor] = await tx<Visitor[]>`
      select v.id, v.email, v.consent_given as registered, v.full_name as "fullName", v.company, v.job_title as "jobTitle", v.mobile,
             v.linkedin_url as "linkedinUrl", v.consent_version as "consentVersion", v.consent_at as "consentAt",
             v.marketing_opt_in as "marketingOptIn", v.registration_mode as "registrationMode", v.created_at as "createdAt",
             c.display_name as "createdByName", v.updated_at as "updatedAt", u.display_name as "updatedByName"
      from hub.visitors v
      left join hub.app_users c on c.id = v.created_by
      left join hub.app_users u on u.id = v.updated_by
      where v.id = ${id}`;
    if (!visitor) return null;

    const interactions = await tx`
      select 'interaction' as kind, i.id, i.type, i.occurred_at as at, i.created_by as "createdBy", cb.display_name as "createdByName",
             i.notes, i.met_by as "metBy", mb.display_name as "metByName", i.problem_statement as "problemStatement",
             i.domain_tags as "domainTags", i.interest_level as "interestLevel", i.next_step as "nextStep",
             i.follow_up_owner as "followUpOwner", fo.display_name as "followUpOwnerName",
             to_char(i.follow_up_date, 'YYYY-MM-DD') as "followUpDate",
             i.podcast_topic as "podcastTopic", i.podcast_consent_signed as "podcastConsentSigned", i.demo_name as "demoName"
      from hub.interactions i
      join hub.app_users cb on cb.id = i.created_by
      left join hub.app_users mb on mb.id = i.met_by
      left join hub.app_users fo on fo.id = i.follow_up_owner
      where i.visitor_id = ${id}`;

    const rounds = visitor.email === null ? [] : await tx`
      select 'game' as kind, r.round_id as "roundId", r.played_at as at, r.display_name as "displayName",
             coalesce(d.name, r.domain_id) as "domainName", r.score, r.correct, r.questions, r.email_confirmed as "emailConfirmed"
      from hub.game_rounds r left join hub.domains d on d.id = r.domain_id
      where r.player_email = ${visitor.email}`;

    const timeline = ([...interactions, ...rounds] as unknown as TimelineItem[])
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return { visitor, timeline };
  });
}

export type UpdateResult = 'ok' | 'not_found' | 'email_taken';

/** Admin edit. A changed email takes the game rounds played under the old one along
 *  (database trigger). */
export async function updateVisitor(user: SessionUser, id: string,
  input: VisitorEdit): Promise<UpdateResult> {
  try {
    const rows = await asUser(user, (tx) => tx`
      update hub.visitors set email = ${input.email}, full_name = ${input.fullName}, company = ${input.company},
        job_title = coalesce(${input.jobTitle}, case when registration_mode = 'import' then null else job_title end), mobile = ${input.mobile}, linkedin_url = ${input.linkedinUrl},
        marketing_opt_in = ${input.marketingOptIn}, updated_by = ${user.id}
      where id = ${id}
      returning id`);
    return rows.length === 1 ? 'ok' : 'not_found';
  } catch (e) {
    if (pgCode(e) === PG.uniqueViolation) return 'email_taken';
    throw e;
  }
}
