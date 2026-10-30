/* POST /api/public/register: the public registration form (no login).
 * Body: {email?, fullName, company, jobTitle, mobile?, linkedinUrl?, consent, marketingOptIn, consentVersion}
 * Email is optional; one registration per email when given.
 * 201 {status:'created'} | 409 {status:'exists'|'stale_consent'} | 400 {error, fields} | 429 */
import type { NextRequest } from 'next/server';
import { registerPublic } from '@/lib/data/visitors';
import { checkSameOrigin, error, ipHash, json, readJson, zodFields } from '@/lib/http';
import { allow, LIMITS } from '@/lib/ratelimit';
import { registrationSchema } from '@/lib/validation';

export async function POST(req: NextRequest) {
  const bad = checkSameOrigin(req);
  if (bad) return bad;
  if (!(await allow(`register:ip:${ipHash(req)}`, LIMITS.registerPerIp))) return error(429, 'Too many attempts. Please wait a minute.');

  const body = await readJson(req);
  if (body === undefined) return error(400, 'Invalid request.');
  const parsed = registrationSchema().safeParse(body);
  if (!parsed.success) return error(400, 'Please check the highlighted fields.', zodFields(parsed.error));

  const result = await registerPublic(parsed.data);
  switch (result) {
    case 'created': return json({ status: 'created' }, 201);
    case 'exists': return json({ status: 'exists', error: 'This email is already registered — please see the MResult team.' }, 409);
    case 'stale_consent': return json({ status: 'stale_consent', error: 'The consent notice was updated. Please reload the page.' }, 409);
    case 'invalid_email': return error(400, 'Please check the highlighted fields.', { email: 'Enter a valid email address.' });
  }
}
