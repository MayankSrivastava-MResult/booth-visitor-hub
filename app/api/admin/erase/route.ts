/* POST /api/admin/erase  (admin) right-to-erasure starting from an email: the visitor with that
 * email (if any) and every game round played under it, also when it was never registered.
 *   Body: {email, confirm: "<the email again>"} → 200 {visitors, interactions, rounds, plays} | 400 | 404 */
import type { NextRequest } from 'next/server';
import { requireAdminApi } from '@/lib/api-auth';
import { eraseEmail } from '@/lib/data/erase';
import { error, json, readJson } from '@/lib/http';
import { looksLikeEmail, normaliseEmail } from '@/lib/validation';

export async function POST(req: NextRequest) {
  const g = await requireAdminApi(req);
  if (g.fail) return g.fail;
  const body = await readJson(req) as { email?: unknown; confirm?: unknown } | undefined;
  const email = typeof body?.email === 'string' ? normaliseEmail(body.email) : '';
  const confirm = typeof body?.confirm === 'string' ? normaliseEmail(body.confirm) : '';
  if (!looksLikeEmail(email) || confirm !== email) return error(400, 'Type the email again to confirm.');
  const r = await eraseEmail(g.user, email);
  if (!r.found) return error(404, 'Nothing is recorded for that email.');
  const { found: _found, ...counts } = r;
  return json(counts);
}
