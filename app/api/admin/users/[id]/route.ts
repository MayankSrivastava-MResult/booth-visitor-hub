/* PATCH /api/admin/users/:id {displayName?, role?, active?, password?} → 200 {ok:true} | 404 | 400  (admin)
 * active:false removes the person (they are signed out at once); a role or password change also signs them out. */
import type { NextRequest } from 'next/server';
import { requireAdminApi } from '@/lib/api-auth';
import { editTeamMember } from '@/lib/data/team';
import { error, json, readJson, zodFields } from '@/lib/http';
import { editUserSchema } from '@/lib/validation';

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireAdminApi(req);
  if (g.fail) return g.fail;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return error(404, 'Not found.');
  const parsed = editUserSchema.safeParse(await readJson(req));
  if (!parsed.success) return error(400, 'Please check the highlighted fields.', zodFields(parsed.error));
  const r = await editTeamMember(g.user, id, parsed.data);
  if (r === 'self') return error(400, 'You cannot remove yourself or take away your own admin role.');
  return r === 'ok' ? json({ ok: true }) : error(404, 'Not found.');
}
