/* Small helpers shared by every API route: JSON responses, the CSRF origin
 * check, request-body parsing and the hashed client IP used for rate limits. */
import { createHmac } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { ZodError } from 'zod';

export function json(body: unknown, status = 200, headers?: HeadersInit) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

export function error(status: number, message: string, fields?: Record<string, string>) {
  return json(fields ? { error: message, fields } : { error: message }, status);
}

/** Field errors from a zod validation failure, keyed by field name. */
export function zodFields(e: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of e.issues) {
    const key = issue.path.join('.') || '_';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/**
 * CSRF protection for cookie-authenticated writes: the browser must say the
 * request came from this same site, and send JSON (which plain HTML forms on
 * other sites cannot do). Returns an error response, or null if all is well.
 */
export function checkSameOrigin(req: NextRequest): NextResponse | null {
  const origin = req.headers.get('origin');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (!origin || !host) return error(403, 'Request blocked (missing origin).');
  let originHost: string;
  try { originHost = new URL(origin).host; } catch { return error(403, 'Request blocked (bad origin).'); }
  if (originHost !== host) return error(403, 'Request blocked (cross-site).');
  return null;
}

/** Parse a JSON body (max 64 KB). Returns undefined if it is not valid JSON. */
export async function readJson(req: NextRequest, maxBytes = 64 * 1024): Promise<unknown> {
  const type = req.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) return undefined;
  const text = await req.text();
  if (text.length > maxBytes) return undefined;
  try { return JSON.parse(text); } catch { return undefined; }
}

/** The client IP, hashed with a server secret so raw IPs are never stored. */
export function ipHash(req: NextRequest): string {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
  const secret = process.env.IP_HASH_SECRET || 'dev-only-secret';
  return createHmac('sha256', secret).update(ip).digest('base64url').slice(0, 22);
}
