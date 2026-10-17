/* GET  /api/admin/questions/delete-test → {count}  questions whose source starts with "TEST"
 * POST /api/admin/questions/delete-test {confirm:"TEST"} → {deleted}   (admin) */
import type { NextRequest } from 'next/server';
import { requireAdminApi } from '@/lib/api-auth';
import { countTestQuestions, deleteTestQuestions } from '@/lib/data/content';
import { error, json, readJson } from '@/lib/http';

export async function GET(req: NextRequest) {
  const g = await requireAdminApi(req);
  if (g.fail) return g.fail;
  return json({ count: await countTestQuestions(g.user) });
}

export async function POST(req: NextRequest) {
  const g = await requireAdminApi(req);
  if (g.fail) return g.fail;
  const body = await readJson(req) as { confirm?: unknown } | undefined;
  if (body?.confirm !== 'TEST') return error(400, 'Type TEST to confirm.');
  return json({ deleted: await deleteTestQuestions(g.user) });
}
