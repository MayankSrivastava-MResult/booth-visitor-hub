/* POST /api/public/register: the public registration form (no login).
 * Body: {badgeId, fullName, company, jobTitle, email, mobile?, linkedinUrl?, consent, marketingOptIn, consentVersion}
 * 201 {status:'created', badgeId} | 409 {status:'exists'|'stale_consent'} | 400 {error, fields} | 429 */
import type { NextRequest } from 'next/server';
import { getRegistrationConfig, registerPublic } from '@/lib/data/visitors';
import { checkSameOrigin, error, ipHash, json, readJson, zodFields } from '@/lib/http';
import { allow, LIMITS } from '@/lib/ratelimit';
import { registrationSchema } from '@/lib/validation';

export async function POST(req: NextRequest) {
  const bad = checkSameOrigin(req);
  if (bad) return bad;
  if (!(await allow(`register:ip:${ipHash(req)}`, LIMITS.registerPerIp))) return error(429, 'Too many attempts. Please wait a minute.');

  const body = await readJson(req);
  if (body === undefined) return error(400, 'Invalid request.');
  const cfg = await getRegistrationConfig();
  const parsed = registrationSchema(cfg).safeParse(body);
  if (!parsed.success) return error(400, 'Please check the highlighted fields.', zodFields(parsed.error));

  const result = await registerPublic(parsed.data);
  switch (result) {
    case 'created': return json({ status: 'created', badgeId: parsed.data.badgeId }, 201);
    case 'exists': return json({ status: 'exists', error: 'This badge is already registered — please see the MResult team.' }, 409);
    case 'stale_consent': return json({ status: 'stale_consent', error: 'The consent notice was updated. Please reload the page.' }, 409);
    case 'invalid_badge': return error(400, 'Please check the highlighted fields.', { badgeId: `Badge ID should be ${cfg.badgeHint}.` });
  }
}
