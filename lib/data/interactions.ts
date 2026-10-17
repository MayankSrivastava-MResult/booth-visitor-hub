/* Interactions (conversation, podcast guest, demo seen, other) and the
 * podcast producer list. Staff may edit/delete only what they created;
 * admins any. Enforced here and by row-level security. */
import { asUser } from '../db';
import type { SessionUser } from '../session';
import type { InteractionInput } from '../validation';

/** Column values for one interaction; fields not used by the type are null. */
function columns(i: InteractionInput) {
  const none = {
    notes: null as string | null, met_by: null as string | null, problem_statement: null as string | null,
    domain_tags: null as string[] | null, interest_level: null as string | null, next_step: null as string | null,
    follow_up_owner: null as string | null, follow_up_date: null as string | null,
    podcast_topic: null as string | null, podcast_consent_signed: null as boolean | null, demo_name: null as string | null,
  };
  switch (i.type) {
    case 'conversation':
      return { ...none, met_by: i.metBy, problem_statement: i.problemStatement, domain_tags: i.domainTags,
        interest_level: i.interestLevel, next_step: i.nextStep, follow_up_owner: i.followUpOwner, follow_up_date: i.followUpDate };
    case 'podcast':
      return { ...none, podcast_topic: i.podcastTopic, podcast_consent_signed: i.podcastConsentSigned, notes: i.notes };
    case 'demo':
      return { ...none, demo_name: i.demoName, notes: i.notes };
    case 'other':
      return { ...none, notes: i.notes };
  }
}

export type CreateResult = { ok: true; id: string } | { ok: false; reason: 'not_registered' };

export async function createInteraction(user: SessionUser, input: InteractionInput): Promise<CreateResult> {
  const c = columns(input);
  return asUser(user, async (tx) => {
    const [exists] = await tx`select 1 from hub.visitors where badge_id = ${input.badgeId}`;
    if (!exists) return { ok: false as const, reason: 'not_registered' as const };
    const [row] = await tx<{ id: string }[]>`
      insert into hub.interactions (badge_id, type, notes, met_by, problem_statement, domain_tags, interest_level, next_step,
                                    follow_up_owner, follow_up_date, podcast_topic, podcast_consent_signed, demo_name, created_by)
      values (${input.badgeId}, ${input.type}, ${c.notes}, ${c.met_by}, ${c.problem_statement},
              ${c.domain_tags === null ? null : tx.array(c.domain_tags)}::text[], ${c.interest_level}, ${c.next_step},
              ${c.follow_up_owner}, ${c.follow_up_date}::date, ${c.podcast_topic}, ${c.podcast_consent_signed}, ${c.demo_name}, ${user.id})
      returning id`;
    return { ok: true as const, id: row.id };
  });
}

/** Returns false if the record does not exist or this person may not change it. */
export async function updateInteraction(user: SessionUser, id: string, input: InteractionInput): Promise<boolean> {
  const c = columns(input);
  const rows = await asUser(user, (tx) => tx`
    update hub.interactions set type = ${input.type}, notes = ${c.notes}, met_by = ${c.met_by},
      problem_statement = ${c.problem_statement}, domain_tags = ${c.domain_tags === null ? null : tx.array(c.domain_tags)}::text[],
      interest_level = ${c.interest_level}, next_step = ${c.next_step}, follow_up_owner = ${c.follow_up_owner},
      follow_up_date = ${c.follow_up_date}::date, podcast_topic = ${c.podcast_topic},
      podcast_consent_signed = ${c.podcast_consent_signed}, demo_name = ${c.demo_name}, updated_by = ${user.id}
    where id = ${id} and badge_id = ${input.badgeId}
    returning id`);
  return rows.length === 1;
}

export async function deleteInteraction(user: SessionUser, id: string): Promise<boolean> {
  const rows = await asUser(user, (tx) => tx`delete from hub.interactions where id = ${id} returning id`);
  return rows.length === 1;
}

export type PodcastGuest = {
  id: string; badgeId: string; fullName: string; jobTitle: string; company: string; linkedinUrl: string | null;
  topic: string; consentSigned: boolean; notes: string | null; at: Date; loggedBy: string;
};

/** Podcast guests logged on one IST calendar day, in time order. */
export async function podcastGuests(user: SessionUser, istDay: string): Promise<PodcastGuest[]> {
  return asUser(user, (tx) => tx<PodcastGuest[]>`
    select i.id, v.badge_id as "badgeId", v.full_name as "fullName", v.job_title as "jobTitle", v.company,
           v.linkedin_url as "linkedinUrl", i.podcast_topic as topic, i.podcast_consent_signed as "consentSigned",
           i.notes, i.occurred_at as at, u.display_name as "loggedBy"
    from hub.interactions i
    join hub.visitors v on v.badge_id = i.badge_id
    join hub.app_users u on u.id = i.created_by
    where i.type = 'podcast' and (i.occurred_at at time zone 'Asia/Kolkata')::date = ${istDay}::date
    order by i.occurred_at`);
}
