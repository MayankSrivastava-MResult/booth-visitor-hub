/* PATCH  /api/admin/questions/:id  question fields (id cannot change) → 200 | 400 {error, errors[]} | 404
 * DELETE /api/admin/questions/:id → 200 | 404   (admin) */
import type { NextRequest } from 'next/server';
import { requireAdminApi } from '@/lib/api-auth';
import { questionBody } from '@/lib/content-input';
import { deleteQuestion, domainIds, updateQuestion } from '@/lib/data/content';
import { error, json, readJson } from '@/lib/http';
import { questionErrors } from '@/lib/questions';

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireAdminApi(req);
  if (g.fail) return g.fail;
  const { id } = await ctx.params;
  const body = await readJson(req);
  const parsed = questionBody.safeParse({ ...(typeof body === 'object' && body ? body : {}), id });
  if (!parsed.success) return error(400, 'Invalid question.');
  const errs = questionErrors(parsed.data, await domainIds(g.user));
  if (errs.length) return json({ error: errs.join('; '), errors: errs }, 400);
  return (await updateQuestion(g.user, id, parsed.data)) ? json({ ok: true }) : error(404, 'Question not found.');
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireAdminApi(req);
  if (g.fail) return g.fail;
  return (await deleteQuestion(g.user, (await ctx.params).id)) ? json({ ok: true }) : error(404, 'Question not found.');
}
