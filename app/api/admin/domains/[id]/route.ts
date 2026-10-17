/* PATCH  /api/admin/domains/:id {name, description, iconKey, accent, enabled, sortOrder} → 200 | 400 | 404  (id cannot change)
 * DELETE /api/admin/domains/:id → 200 | 404 | 409 (still has questions)   (admin) */
import type { NextRequest } from 'next/server';
import { requireAdminApi } from '@/lib/api-auth';
import { domainBody } from '@/lib/content-input';
import { deleteDomain, updateDomain } from '@/lib/data/content';
import { error, json, readJson } from '@/lib/http';
import { domainErrors } from '@/lib/questions';

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireAdminApi(req);
  if (g.fail) return g.fail;
  const { id } = await ctx.params;
  const body = await readJson(req);
  const parsed = domainBody.safeParse({ ...(typeof body === 'object' && body ? body : {}), id });
  if (!parsed.success) return error(400, 'Invalid domain.');
  const errs = domainErrors(parsed.data);
  if (errs.length) return json({ error: errs.join('; '), errors: errs }, 400);
  return (await updateDomain(g.user, id, parsed.data)) ? json({ ok: true }) : error(404, 'Domain not found.');
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireAdminApi(req);
  if (g.fail) return g.fail;
  const r = await deleteDomain(g.user, (await ctx.params).id);
  if (r === 'has_questions') return error(409, 'This domain still has questions. Delete or move them first, or just disable the domain.');
  return r === 'ok' ? json({ ok: true }) : error(404, 'Domain not found.');
}
