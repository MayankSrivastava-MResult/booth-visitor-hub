/* GET  /api/visitors?q=  → {items:[{email, fullName, company, jobTitle, createdAt}]}   search by name, company or email   (staff, admin)
 * POST /api/visitors     staff-assisted registration, same body as the public form
 *      → 201 {status:'created', email} | 409 {status:'exists'|'stale_consent', email} | 400 {error, fields} */
import type { NextRequest } from 'next/server';
import { requireStaffApi } from '@/lib/api-auth';
import { getSettings } from '@/lib/data/team';
import { registerByStaff, searchVisitors } from '@/lib/data/visitors';
import { error, json, readJson, zodFields } from '@/lib/http';
import { registrationSchema } from '@/lib/validation';

export async function GET(req: NextRequest) {
  const g = await requireStaffApi(req);
  if (g.fail) return g.fail;
  const q = (req.nextUrl.searchParams.get('q') ?? '').slice(0, 100);
  return json({ items: await searchVisitors(g.user, q) });
}

export async function POST(req: NextRequest) {
  const g = await requireStaffApi(req);
  if (g.fail) return g.fail;
  const body = await readJson(req);
  if (body === undefined) return error(400, 'Invalid request.');
  const cfg = await getSettings(g.user);
  const parsed = registrationSchema().safeParse(body);
  if (!parsed.success) return error(400, 'Please check the highlighted fields.', zodFields(parsed.error));
  const result = await registerByStaff(g.user, parsed.data, cfg);
  if (result === 'created') return json({ status: 'created', email: parsed.data.email }, 201);
  if (result === 'exists') return json({ status: 'exists', email: parsed.data.email, error: 'Already registered.' }, 409);
  return json({ status: 'stale_consent', error: 'The consent notice was updated. Please reload the page.' }, 409);
}
