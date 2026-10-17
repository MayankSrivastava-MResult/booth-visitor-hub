/* GET  /api/admin/users → {items:[{id, email, displayName, role, active}]}         (admin)
 * POST /api/admin/users {email, displayName, role, password} → 201 {id} | 409 | 400  (admin)
 * Adding an email that was removed earlier restores that person with the new details. */
import type { NextRequest } from 'next/server';
import { requireAdminApi } from '@/lib/api-auth';
import { addTeamMember, listTeam } from '@/lib/data/team';
import { error, json, readJson, zodFields } from '@/lib/http';
import { newUserSchema } from '@/lib/validation';

export async function GET(req: NextRequest) {
  const g = await requireAdminApi(req);
  if (g.fail) return g.fail;
  return json({ items: await listTeam(g.user) });
}

export async function POST(req: NextRequest) {
  const g = await requireAdminApi(req);
  if (g.fail) return g.fail;
  const parsed = newUserSchema.safeParse(await readJson(req));
  if (!parsed.success) return error(400, 'Please check the highlighted fields.', zodFields(parsed.error));
  const r = await addTeamMember(g.user, parsed.data);
  return r.ok ? json({ id: r.id }, 201) : error(409, 'That email is already on the team list.', { email: 'Already on the list.' });
}
