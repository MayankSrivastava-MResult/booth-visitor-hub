/* Admin data removal (admin only; enforced here and by row-level security):
 *   eraseVisitor  right-to-erasure: one visitor and everything recorded against their
 *                 badge ID (interactions, game rounds and plays), in one transaction.
 *                 Also works for a badge that only exists in game rounds (unregistered).
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

export async function eraseVisitor(admin: SessionUser, badgeId: string): Promise<(EventCounts & { found: boolean })> {
  return asUser(admin, async (tx) => {
    const [before] = await tx<{ interactions: number; plays: number }[]>`
      select (select count(*)::int from hub.interactions where badge_id = ${badgeId}) as interactions,
             (select count(*)::int from hub.game_plays p join hub.game_rounds r on r.round_id = p.round_id where r.badge_id = ${badgeId}) as plays`;
    const rounds = await tx`delete from hub.game_rounds where badge_id = ${badgeId} returning round_id`;     // plays go with them
    const visitors = await tx`delete from hub.visitors where badge_id = ${badgeId} returning badge_id`;       // interactions go with it
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
