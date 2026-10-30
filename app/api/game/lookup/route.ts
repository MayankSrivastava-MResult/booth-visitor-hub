/* POST /api/game/lookup {email}   (any signed-in account: game, staff or admin)
 * → 200 {found:boolean, firstName:string|null}   NOTHING else about the visitor, ever.
 * Rate-limited per account (per minute and per day) and per IP to stop enumeration. */
import type { NextRequest } from 'next/server';
import { requireGameApi } from '@/lib/api-auth';
import { asGame } from '@/lib/db';
import { error, ipHash, json, readJson } from '@/lib/http';
import { allow, LIMITS } from '@/lib/ratelimit';
import { looksLikeEmail, normaliseEmail } from '@/lib/validation';

export async function POST(req: NextRequest) {
  const g = await requireGameApi(req);
  if (g.fail) return g.fail;
  const okMinute = await allow(`lookup:user:${g.user.id}`, LIMITS.lookupPerAccount);
  const okDay = await allow(`lookup:userday:${g.user.id}`, LIMITS.lookupPerAccountDay);
  const okIp = await allow(`lookup:ip:${ipHash(req)}`, LIMITS.lookupPerIp);
  if (!okMinute || !okDay || !okIp) return error(429, 'Too many lookups.');

  const body = await readJson(req, 1024) as { email?: unknown } | undefined;
  const email = typeof body?.email === 'string' ? normaliseEmail(body.email) : '';
  // Something that is not an email cannot be registered: answer without touching the visitor table.
  if (!looksLikeEmail(email)) return json({ found: false, firstName: null });

  const [row] = await asGame((tx) => tx<{ found: boolean; first_name: string | null }[]>`select * from hub.game_lookup(${email})`);
  return json({ found: row.found, firstName: row.found ? row.first_name : null });
}
