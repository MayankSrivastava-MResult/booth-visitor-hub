/* Admin data removal (admin only; enforced here and by row-level security):
 *   eraseVisitor  right-to-erasure: one visitor (by id) and everything recorded against
 *                 them (interactions, and game rounds and plays under their email).
 *   eraseEmail    the same, starting from an email; also works for an email that only
 *                 exists in game rounds (never registered).
 *                 Each runs in one transaction.
 *   purgeEvent    all event data: every visitor, interaction, game round and play.
 *                 Keeps game content, settings, consent texts and team accounts.
 * Neither can reach data still waiting on a game screen that has not synced yet; the
 * runbook covers that. */
import { asUser } from '../db';
import type { SessionUser } from '../session';

/** The phrase an admin must type to purge. */
export const PURGE_PHRASE = 'PURGE ALL EVENT DATA';

export type EventCounts = { visitors: number; interactions: number; rounds: number; plays: number };

export async function eventCounts(admin: SessionUser): Promise<EventCounts> {
  const [c] = await asUser(admin, (tx) => tx<EventCounts[]>`
    select (select count(*)::int from hub.visitors) as visitors, (select count(*)::int from hub.interactions) as interactions,
           (select count(*)::int from hub.game_rounds) as rounds, (select count(*)::int from hub.game_plays) as plays`);
  return c;
}

/** One visitor by id: their record, interactions, and game rounds played under their email. */
export async function eraseVisitor(admin: SessionUser, id: string): Promise<(EventCounts & { found: boolean })> {
  return asUser(admin, async (tx) => {
    const [v] = await tx<{ email: string | null }[]>`select email from hub.visitors where id = ${id}`;
    if (!v) return { found: false, visitors: 0, interactions: 0, rounds: 0, plays: 0 };
    const [before] = await tx<{ interactions: number; plays: number }[]>`
      select (select count(*)::int from hub.interactions where visitor_id = ${id}) as interactions,
             (select count(*)::int from hub.game_plays p join hub.game_rounds r on r.round_id = p.round_id where r.player_email = ${v.email}) as plays`;
    const rounds = v.email === null ? [] : await tx`delete from hub.game_rounds where player_email = ${v.email} returning round_id`;   // plays go with them
    await tx`delete from hub.visitors where id = ${id}`;     // interactions go with it
    return { found: true, visitors: 1, interactions: before.interactions, rounds: rounds.length, plays: before.plays };
  });
}

/** Everything recorded against an email: the visitor with that email (if any) and every
 *  game round played under it (also for an email that was never registered). */
export async function eraseEmail(admin: SessionUser, email: string): Promise<(EventCounts & { found: boolean })> {
  return asUser(admin, async (tx) => {
    const [before] = await tx<{ interactions: number; plays: number }[]>`
      select (select count(*)::int from hub.interactions i join hub.visitors v on v.id = i.visitor_id where v.email = ${email}) as interactions,
             (select count(*)::int from hub.game_plays p join hub.game_rounds r on r.round_id = p.round_id where r.player_email = ${email}) as plays`;
    const rounds = await tx`delete from hub.game_rounds where player_email = ${email} returning round_id`;     // plays go with them
    const visitors = await tx`delete from hub.visitors where email = ${email} returning id`;       // interactions go with it
    const found = visitors.length > 0 || rounds.length > 0;
    return { found, visitors: visitors.length, interactions: visitors.length ? before.interactions : 0, rounds: rounds.length, plays: before.plays };
  });
}

export async function purgeEvent(admin: SessionUser): Promise<EventCounts> {
  return asUser(admin, async (tx) => {
    const [c] = await tx<EventCounts[]>`
      select (select count(*)::int from hub.visitors) as visitors, (select count(*)::int from hub.interactions) as interactions,
             (select count(*)::int from hub.game_rounds) as rounds, (select count(*)::int from hub.game_plays) as plays`;
    await tx`delete from hub.game_rounds`;     // and their plays
    await tx`delete from hub.visitors`;        // and their interactions
    const [left] = await tx<{ n: number }[]>`
      select (select count(*) from hub.visitors) + (select count(*) from hub.interactions)
           + (select count(*) from hub.game_rounds) + (select count(*) from hub.game_plays) as n`;
    if (Number(left.n) !== 0) throw new Error('purge incomplete');   // all-or-nothing: the transaction rolls back
    return c;
  });
}
