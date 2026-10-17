/* Visitors: registration (public and staff-assisted), search, the summary
 * shown on Log interaction, the visitor detail timeline, and admin edits. */
import { asPublic, asUser, pgCode, PG } from '../db';
import type { SessionUser } from '../session';
import type { Registration, RegistrationConfig } from '../validation';

export async function getRegistrationConfig(): Promise<RegistrationConfig> {
  const [row] = await asPublic((tx) => tx<{ cfg: RegistrationConfig }[]>`select hub.registration_config() as cfg`);
  return row.cfg;
}

export type RegisterResult = 'created' | 'exists' | 'invalid_badge' | 'stale_consent';

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
      insert into hub.visitors (badge_id, full_name, company, job_title, email, mobile, linkedin_url,
                                consent_given, consent_version, consent_at, marketing_opt_in, registration_mode, created_by)
      values (${input.badgeId}, ${input.fullName}, ${input.company}, ${input.jobTitle}, ${input.email},
              ${input.mobile}, ${input.linkedinUrl}, true, ${cfg.consentVersion}, now(), ${input.marketingOptIn},
              'staff', ${user.id})`);
    return 'created';
  } catch (e) {
    if (pgCode(e) === PG.uniqueViolation) return 'exists';
    throw e;
  }
}

export type VisitorListItem = { badgeId: string; fullName: string; company: string; jobTitle: string; createdAt: Date };

/** Search by badge ID, name, company or email. Newest first. */
export async function searchVisitors(user: SessionUser, q: string, limit = 50): Promise<VisitorListItem[]> {
  const term = q.trim();
  const like = `%${term.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
  return asUser(user, (tx) => tx<VisitorListItem[]>`
    select badge_id as "badgeId", full_name as "fullName", company, job_title as "jobTitle", created_at as "createdAt"
    from hub.visitors
    where ${term === ''} or badge_id ilike ${like} or full_name ilike ${like} or company ilike ${like} or email ilike ${like}
    order by created_at desc
    limit ${limit}`);
}

export type VisitorSummary = { badgeId: string; fullName: string; company: string; jobTitle: string };

export async function visitorSummary(user: SessionUser, badgeId: string): Promise<VisitorSummary | null> {
  const rows = await asUser(user, (tx) => tx<VisitorSummary[]>`
    select badge_id as "badgeId", full_name as "fullName", company, job_title as "jobTitle"
    from hub.visitors where badge_id = ${badgeId}`);
  return rows[0] ?? null;
}

export type Visitor = VisitorSummary & {
  email: string; mobile: string | null; linkedinUrl: string | null;
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
      correct: number; questions: number; badgeConfirmed: boolean };

export async function visitorDetail(user: SessionUser, badgeId: string): Promise<{ visitor: Visitor; timeline: TimelineItem[] } | null> {
  return asUser(user, async (tx) => {
    const [visitor] = await tx<Visitor[]>`
      select v.badge_id as "badgeId", v.full_name as "fullName", v.company, v.job_title as "jobTitle", v.email, v.mobile,
             v.linkedin_url as "linkedinUrl", v.consent_version as "consentVersion", v.consent_at as "consentAt",
             v.marketing_opt_in as "marketingOptIn", v.registration_mode as "registrationMode", v.created_at as "createdAt",
             c.display_name as "createdByName", v.updated_at as "updatedAt", u.display_name as "updatedByName"
      from hub.visitors v
      left join hub.app_users c on c.id = v.created_by
      left join hub.app_users u on u.id = v.updated_by
      where v.badge_id = ${badgeId}`;
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
      where i.badge_id = ${badgeId}`;

    const rounds = await tx`
      select 'game' as kind, r.round_id as "roundId", r.played_at as at, r.display_name as "displayName",
             coalesce(d.name, r.domain_id) as "domainName", r.score, r.correct, r.questions, r.badge_confirmed as "badgeConfirmed"
      from hub.game_rounds r left join hub.domains d on d.id = r.domain_id
      where r.badge_id = ${badgeId}`;

    const timeline = ([...interactions, ...rounds] as unknown as TimelineItem[])
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return { visitor, timeline };
  });
}

/** Admin edit. The badge ID itself is not editable (game rounds are matched by it). */
export async function updateVisitor(user: SessionUser, badgeId: string,
  input: Omit<Registration, 'badgeId' | 'consent' | 'consentVersion'>): Promise<boolean> {
  const rows = await asUser(user, (tx) => tx`
    update hub.visitors set full_name = ${input.fullName}, company = ${input.company}, job_title = ${input.jobTitle},
      email = ${input.email}, mobile = ${input.mobile}, linkedin_url = ${input.linkedinUrl},
      marketing_opt_in = ${input.marketingOptIn}, updated_by = ${user.id}
    where badge_id = ${badgeId}
    returning badge_id`);
  return rows.length === 1;
}
