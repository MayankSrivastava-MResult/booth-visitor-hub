/* POST /api/auth/logout: ends this browser's session. 200 {ok:true} */
import type { NextRequest } from 'next/server';
import { checkSameOrigin, json } from '@/lib/http';
import { deleteSession, SESSION_COOKIE } from '@/lib/session';

export async function POST(req: NextRequest) {
  const bad = checkSameOrigin(req);
  if (bad) return bad;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(token);
  const res = json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
