/* PATCH  /api/interactions/:id  full interaction body (same as POST) → 200 {ok:true} | 404
 * DELETE /api/interactions/:id → 200 {ok:true} | 404
 * Staff may change only interactions they created; admins any (also enforced by RLS). */
import type { NextRequest } from 'next/server';
import { requireStaffApi } from '@/lib/api-auth';
import { deleteInteraction, updateInteraction } from '@/lib/data/interactions';
import { error, json, readJson, zodFields } from '@/lib/http';
import { interactionSchema } from '@/lib/validation';

const UUID = /^[0-9a-f-]{36}$/i;
const NOPE = 'Not found, or you can only change interactions you logged.';

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireStaffApi(req);
  if (g.fail) return g.fail;
  const { id } = await ctx.params;
  if (!UUID.test(id)) return error(404, NOPE);
  const parsed = interactionSchema.safeParse(await readJson(req));
  if (!parsed.success) return error(400, 'Please check the highlighted fields.', zodFields(parsed.error));
  return (await updateInteraction(g.user, id, parsed.data)) ? json({ ok: true }) : error(404, NOPE);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireStaffApi(req);
  if (g.fail) return g.fail;
  const { id } = await ctx.params;
  if (!UUID.test(id)) return error(404, NOPE);
  return (await deleteInteraction(g.user, id)) ? json({ ok: true }) : error(404, NOPE);
}
