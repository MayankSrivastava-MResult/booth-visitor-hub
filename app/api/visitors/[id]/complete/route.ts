/* POST /api/visitors/:id/complete  (staff, admin) complete a pre-seeded visitor's registration
 * in person: same body as the registration form; consent is recorded now.
 *   → 200 {ok:true} | 404 | 409 {status:'already_registered'|'stale_consent'} | 409 email taken | 400 {error, fields} */
import type { NextRequest } from 'next/server';
import { requireStaffApi } from '@/lib/api-auth';
import { completeRegistration } from '@/lib/data/visitors';
import { error, json, readJson, zodFields } from '@/lib/http';
import { isUuid, registrationSchema } from '@/lib/validation';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireStaffApi(req);
  if (g.fail) return g.fail;
  const { id } = await ctx.params;
  if (!isUuid(id)) return error(404, 'Visitor not found.');
  const body = await readJson(req);
  if (body === undefined) return error(400, 'Invalid request.');
  const parsed = registrationSchema().safeParse(body);
  if (!parsed.success) return error(400, 'Please check the highlighted fields.', zodFields(parsed.error));
  switch (await completeRegistration(g.user, id, parsed.data)) {
    case 'ok': return json({ ok: true });
    case 'not_found': return error(404, 'Visitor not found.');
    case 'already_registered': return json({ status: 'already_registered', error: 'This visitor is already registered.' }, 409);
    case 'email_taken': return error(409, 'Another visitor already has that email.', { email: 'Another visitor already has this email.' });
    case 'stale_consent': return json({ status: 'stale_consent', error: 'The consent notice was updated. Please reload the page.' }, 409);
  }
}
