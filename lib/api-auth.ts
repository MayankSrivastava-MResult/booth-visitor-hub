/* Guards for API routes. Every write also passes the CSRF origin check.
 * Roles are enforced here AND by row-level security in the database. */
import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { checkSameOrigin, error } from './http';
import { SESSION_COOKIE, userForToken, type SessionUser } from './session';

type Guard = { user: SessionUser; fail?: never } | { user?: never; fail: NextResponse };

async function guard(req: NextRequest, adminOnly: boolean): Promise<Guard> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const bad = checkSameOrigin(req);
    if (bad) return { fail: bad };
  }
  const user = await userForToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return { fail: error(401, 'Please sign in again.') };
  if (adminOnly && user.role !== 'admin') return { fail: error(403, 'Only an admin can do this.') };
  return { user };
}

/** Any signed-in team member (staff or admin). */
export const requireStaffApi = (req: NextRequest) => guard(req, false);
/** Admins only. */
export const requireAdminApi = (req: NextRequest) => guard(req, true);
