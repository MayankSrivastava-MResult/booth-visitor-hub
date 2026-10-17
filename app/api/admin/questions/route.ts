/* GET  /api/admin/questions?domain=<id> → {items:[{id, domainId, questionText, options[], correctIndex, difficulty, explanation, source, enabled}]}
 * POST /api/admin/questions  same fields → 201 | 400 {error, errors[]} | 409   (admin)
 * Every save applies the game's content rules (lib/questions.ts). */
import type { NextRequest } from 'next/server';
import { requireAdminApi } from '@/lib/api-auth';
import { questionBody } from '@/lib/content-input';
import { createQuestion, domainIds, listQuestions } from '@/lib/data/content';
import { error, json, readJson } from '@/lib/http';
import { questionErrors } from '@/lib/questions';

export async function GET(req: NextRequest) {
  const g = await requireAdminApi(req);
  if (g.fail) return g.fail;
  return json({ items: await listQuestions(g.user, req.nextUrl.searchParams.get('domain')) });
}

export async function POST(req: NextRequest) {
  const g = await requireAdminApi(req);
  if (g.fail) return g.fail;
  const parsed = questionBody.safeParse(await readJson(req));
  if (!parsed.success) return error(400, 'Invalid question.');
  const errs = questionErrors(parsed.data, await domainIds(g.user));
  if (errs.length) return json({ error: errs.join('; '), errors: errs }, 400);
  const r = await createQuestion(g.user, parsed.data);
  return r === 'ok' ? json({ id: parsed.data.id }, 201) : error(409, `A question with id "${parsed.data.id}" already exists.`);
}
