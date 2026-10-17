/* Guards for API routes. Every write also passes the CSRF origin check.
 * Roles are enforced here AND by row-level security in the database.
 *   requireStaffApi  admin or staff (the Hub)
 *   requireAdminApi  admin only
 *   requireGameApi   any signed-in account incl. 'game' (Pharma Ninja's sync API only) */
import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { checkSameOrigin, error } from './http';
import { SESSION_COOKIE, userForToken, type Role, type SessionUser } from './session';

type Guard = { user: SessionUser; fail?: never } | { user?: never; fail: NextResponse };

async function guard(req: NextRequest, allowed: Role[]): Promise<Guard> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const bad = checkSameOrigin(req);
    if (bad) return { fail: bad };
  }
  const user = await userForToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return { fail: error(401, 'Please sign in again.') };
  if (!allowed.includes(user.role)) {
    return { fail: error(403, user.role === 'game' ? 'The game account can only run the game.' : 'Only an admin can do this.') };
  }
  return { user };
}

export const requireStaffApi = (req: NextRequest) => guard(req, ['admin', 'staff']);
export const requireAdminApi = (req: NextRequest) => guard(req, ['admin']);
export const requireGameApi = (req: NextRequest) => guard(req, ['admin', 'staff', 'game']);
