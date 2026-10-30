/* Visitors, identified by their email address (stored lower-case): registration
 * (public and staff-assisted), search (Log interaction picks a visitor by name,
 * company or email), the visitor detail timeline, and admin edits. */
import { asPublic, asUser, pgCode, PG } from '../db';
import type { SessionUser } from '../session';
import type { Registration, RegistrationConfig } from '../validation';

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
export async function registerByStaff(user: SessionUser, input: Registration, cfg: RegistrationConfig): Promise<RegisterResult> {
  if (input.consentVersion !== cfg.consentVersion) return 'stale_consent';
  try {
    await asUser(user, (tx) => tx`
      insert into hub.visitors (email, full_name, company, job_title, mobile, linkedin_url,
                                consent_given, consent_version, consent_at, marketing_opt_in, registration_mode, created_by)
      values (${input.email}, ${input.fullName}, ${input.company}, ${input.jobTitle},
              ${input.mobile}, ${input.linkedinUrl}, true, ${cfg.consentVersion}, now(), ${input.marketingOptIn},
              'staff', ${user.id})`);
    return 'created';
  } catch (e) {
    if (pgCode(e) === PG.uniqueViolation) return 'exists';
    throw e;
  }
}

export type VisitorSummary = { email: string; fullName: string; company: string; jobTitle: string };
export type VisitorListItem = VisitorSummary & { createdAt: Date };

/** Search by name, company or email (any part). Newest first. */
export async function searchVisitors(user: SessionUser, q: string, limit = 50): Promise<VisitorListItem[]> {
  const term = q.trim();
  const like = `%${term.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
  return asUser(user, (tx) => tx<VisitorListItem[]>`
    select email, full_name as "fullName", company, job_title as "jobTitle", created_at as "createdAt"
    from hub.visitors
    where ${term === ''} or full_name ilike ${like} or company ilike ${like} or email ilike ${like}
    order by (lower(email) = lower(${term})) desc, created_at desc
    limit ${limit}`);
}

export async function visitorSummary(user: SessionUser, email: string): Promise<VisitorSummary | null> {
  const rows = await asUser(user, (tx) => tx<VisitorSummary[]>`
    select email, full_name as "fullName", company, job_title as "jobTitle"
    from hub.visitors where email = ${email}`);
  return rows[0] ?? null;
}

export type Visitor = VisitorSummary & {
  mobile: string | null; linkedinUrl: string | null;
  consentVersion: number; consentAt: Date; marketingOptIn: boolean;
  registrationMode: 'self' | 'staff'; createdAt: Date; createdByName: string | null;
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

export async function visitorDetail(user: SessionUser, email: string): Promise<{ visitor: Visitor; timeline: TimelineItem[] } | null> {
  return asUser(user, async (tx) => {
    const [visitor] = await tx<Visitor[]>`
      select v.email, v.full_name as "fullName", v.company, v.job_title as "jobTitle", v.mobile,
             v.linkedin_url as "linkedinUrl", v.consent_version as "consentVersion", v.consent_at as "consentAt",
             v.marketing_opt_in as "marketingOptIn", v.registration_mode as "registrationMode", v.created_at as "createdAt",
             c.display_name as "createdByName", v.updated_at as "updatedAt", u.display_name as "updatedByName"
      from hub.visitors v
      left join hub.app_users c on c.id = v.created_by
      left join hub.app_users u on u.id = v.updated_by
      where v.email = ${email}`;
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
      where i.visitor_email = ${email}`;

    const rounds = await tx`
      select 'game' as kind, r.round_id as "roundId", r.played_at as at, r.display_name as "displayName",
             coalesce(d.name, r.domain_id) as "domainName", r.score, r.correct, r.questions, r.email_confirmed as "emailConfirmed"
      from hub.game_rounds r left join hub.domains d on d.id = r.domain_id
      where r.player_email = ${email}`;

    const timeline = ([...interactions, ...rounds] as unknown as TimelineItem[])
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return { visitor, timeline };
  });
}

export type UpdateResult = 'ok' | 'not_found' | 'email_taken';

/** Admin edit. A changed email moves the visitor, their interactions and game rounds to it
 *  (hub.change_visitor_email), in the same transaction as the other changes. */
export async function updateVisitor(user: SessionUser, email: string,
  input: Omit<Registration, 'consent' | 'consentVersion'>): Promise<UpdateResult> {
  return asUser(user, async (tx) => {
    if (input.email !== email) {
      const [{ r }] = await tx<{ r: 'ok' | 'not_found' | 'exists' }[]>`select hub.change_visitor_email(${email}, ${input.email}) as r`;
      if (r === 'exists') return 'email_taken';
      if (r === 'not_found') return 'not_found';
    }
    const rows = await tx`
      update hub.visitors set full_name = ${input.fullName}, company = ${input.company}, job_title = ${input.jobTitle},
        mobile = ${input.mobile}, linkedin_url = ${input.linkedinUrl}, marketing_opt_in = ${input.marketingOptIn}, updated_by = ${user.id}
      where email = ${input.email}
      returning email`;
    return rows.length === 1 ? 'ok' : 'not_found';
  });
}
