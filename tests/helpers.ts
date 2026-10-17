/* Test helpers: build requests the way Next.js hands them to route handlers. */
import { NextRequest } from 'next/server';
import * as loginRoute from '@/app/api/auth/login/route';

export const ORIGIN = 'http://localhost:3000';
let ipCounter = 0;

export function req(path: string, opts: { method?: string; body?: unknown; cookie?: string; origin?: string | null; ip?: string;
  headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { host: 'localhost:3000', 'x-forwarded-for': opts.ip ?? `10.1.0.${++ipCounter % 250}`, ...opts.headers };
  if (opts.origin !== null) headers.origin = opts.origin ?? ORIGIN;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (opts.cookie) headers.cookie = `hub_session=${opts.cookie}`;
  return new NextRequest(ORIGIN + path, { method: opts.method ?? 'GET', headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}

export const params = <T,>(p: T) => ({ params: Promise.resolve(p) });

export async function login(email: string, password: string): Promise<string> {
  const res = await loginRoute.POST(req('/api/auth/login', { method: 'POST', body: { email, password } }));
  const c = res.cookies.get('hub_session')?.value;
  if (!c) throw new Error(`login failed for ${email}: ${res.status}`);
  return c;
}
