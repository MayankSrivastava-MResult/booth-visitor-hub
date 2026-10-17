/* Team sign-in sessions.
 *
 * On login the server creates a random token, stores only its SHA-256 in
 * hub.sessions, and gives the browser the token in an httpOnly cookie that
 * lasts 7 days (the whole event). Each request looks the token up; removing a
 * person, changing their role or resetting their password deletes their
 * sessions (database trigger), so it takes effect immediately.
 */
import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { rawSql } from './db';

export const SESSION_COOKIE = 'hub_session';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

/** admin and staff use the Hub; 'game' accounts can only run Pharma Ninja (for public game screens). */
export type Role = 'admin' | 'staff' | 'game';
export type SessionUser = { id: string; email: string; displayName: string; role: Role };

function tokenHash(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

/** Create a session for a user and return the cookie token. */
export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await rawSql()`select hub.session_create(${userId}::uuid, ${tokenHash(token)}, ${SESSION_TTL_SECONDS})`;
  return token;
}

export async function deleteSession(token: string): Promise<void> {
  await rawSql()`select hub.session_delete(${tokenHash(token)})`;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  };
}

/** Look a cookie token up. Returns the signed-in person or null. */
export async function userForToken(token: string | undefined): Promise<SessionUser | null> {
  if (!token || token.length > 100) return null;
  const rows = await rawSql()<{ user_id: string; email: string; display_name: string; role: Role }[]>`
    select * from hub.session_lookup(${tokenHash(token)})`;
  const r = rows[0];
  return r ? { id: r.user_id, email: r.email, displayName: r.display_name, role: r.role } : null;
}

/** The signed-in person for this request (looked up once per request). */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  return userForToken(jar.get(SESSION_COOKIE)?.value);
});

/** Where a person lands after signing in: game accounts go straight to the game. */
export const homeFor = (role: Role) => (role === 'game' ? '/play' : '/');

/** For Hub pages: signed-out visitors go to the login page; game accounts go back to the game. */
export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (user.role === 'game') redirect('/play');
  return user;
}

/** For admin pages: staff are sent back to the home page. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== 'admin') redirect('/');
  return user;
}
