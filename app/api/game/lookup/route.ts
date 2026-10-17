/* POST /api/game/lookup {badgeId}   (any signed-in account: game, staff or admin)
 * → 200 {found:boolean, firstName:string|null}   NOTHING else about the visitor, ever.
 * Rate-limited per account (per minute and per day) and per IP to stop badge enumeration. */
import type { NextRequest } from 'next/server';
import { requireGameApi } from '@/lib/api-auth';
import { asGame } from '@/lib/db';
import { getRegistrationConfig } from '@/lib/data/visitors';
import { error, ipHash, json, readJson } from '@/lib/http';
import { allow, LIMITS } from '@/lib/ratelimit';
import { normaliseBadge } from '@/lib/validation';

let rule: { re: RegExp; at: number } | null = null;   // badge format rule, cached for a minute
async function badgeRule(): Promise<RegExp> {
  if (!rule || Date.now() - rule.at > 60000) rule = { re: new RegExp((await getRegistrationConfig()).badgePattern), at: Date.now() };
  return rule.re;
}

export async function POST(req: NextRequest) {
  const g = await requireGameApi(req);
  if (g.fail) return g.fail;
  const okMinute = await allow(`lookup:user:${g.user.id}`, LIMITS.lookupPerAccount);
  const okDay = await allow(`lookup:userday:${g.user.id}`, LIMITS.lookupPerAccountDay);
  const okIp = await allow(`lookup:ip:${ipHash(req)}`, LIMITS.lookupPerIp);
  if (!okMinute || !okDay || !okIp) return error(429, 'Too many lookups.');

  const body = await readJson(req, 1024) as { badgeId?: unknown } | undefined;
  const badge = typeof body?.badgeId === 'string' ? normaliseBadge(body.badgeId) : '';
  // A badge that cannot exist is "not found" without touching the visitor table.
  if (!badge || badge.length > 64 || !(await badgeRule()).test(badge)) return json({ found: false, firstName: null });

  const [row] = await asGame((tx) => tx<{ found: boolean; first_name: string | null }[]>`select * from hub.game_lookup(${badge})`);
  return json({ found: row.found, firstName: row.found ? row.first_name : null });
}
