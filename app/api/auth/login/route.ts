/* POST /api/auth/login  {email, password}
 * 200 {ok:true} and sets the session cookie | 401 {error} | 429
 * The same message is shown for an unknown email and a wrong password, so the
 * login page never reveals who is on the team list. */
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { rawSql } from '@/lib/db';
import { checkSameOrigin, error, ipHash, json, readJson } from '@/lib/http';
import { verifyPassword } from '@/lib/password';
import { allow, LIMITS } from '@/lib/ratelimit';
import { createSession, SESSION_COOKIE, sessionCookieOptions } from '@/lib/session';

const Body = z.object({ email: z.string().trim().toLowerCase().max(254), password: z.string().max(200) });
const NOT_OK = 'Email or password is not right. If you are not on the team list, ask the MResult admin to add you.';

export async function POST(req: NextRequest) {
  const bad = checkSameOrigin(req);
  if (bad) return bad;
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return error(400, 'Enter your email and password.');
  const { email, password } = parsed.data;

  const okIp = await allow(`login:ip:${ipHash(req)}`, LIMITS.loginPerIp);
  const okEmail = await allow(`login:email:${email}`, LIMITS.loginPerEmail);
  if (!okIp || !okEmail) return error(429, 'Too many attempts. Wait 15 minutes and try again.');

  const [user] = await rawSql()<{ id: string; password_hash: string | null; active: boolean }[]>`
    select * from hub.auth_user_by_email(${email})`;
  const valid = await verifyPassword(password, user?.active ? user.password_hash : null);
  if (!user || !user.active || !valid) return error(401, NOT_OK);

  const token = await createSession(user.id);
  const res = json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}
