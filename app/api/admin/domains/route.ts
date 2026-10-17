/* GET  /api/admin/domains → {items:[{id, name, description, iconKey, accent, enabled, sortOrder, questionCount, enabledQuestionCount}]}
 * POST /api/admin/domains {id, name, description, iconKey, accent, enabled, sortOrder} → 201 | 400 {error, errors[]} | 409   (admin) */
import type { NextRequest } from 'next/server';
import { requireAdminApi } from '@/lib/api-auth';
import { domainBody } from '@/lib/content-input';
import { createDomain, listDomains } from '@/lib/data/content';
import { error, json, readJson } from '@/lib/http';
import { domainErrors } from '@/lib/questions';

export async function GET(req: NextRequest) {
  const g = await requireAdminApi(req);
  if (g.fail) return g.fail;
  return json({ items: await listDomains(g.user) });
}

export async function POST(req: NextRequest) {
  const g = await requireAdminApi(req);
  if (g.fail) return g.fail;
  const parsed = domainBody.safeParse(await readJson(req));
  if (!parsed.success) return error(400, 'Invalid domain.');
  const errs = domainErrors(parsed.data);
  if (errs.length) return json({ error: errs.join('; '), errors: errs }, 400);
  const r = await createDomain(g.user, parsed.data);
  return r === 'ok' ? json({ id: parsed.data.id }, 201) : error(409, `A domain with id "${parsed.data.id}" already exists.`);
}
