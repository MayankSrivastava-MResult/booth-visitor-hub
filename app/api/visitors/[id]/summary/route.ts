/* GET /api/visitors/:id/summary → {found:true, id, email, fullName, company, jobTitle, registered} | {found:false}
 * Staff and admin. */
import type { NextRequest } from 'next/server';
import { requireStaffApi } from '@/lib/api-auth';
import { visitorSummary } from '@/lib/data/visitors';
import { json } from '@/lib/http';
import { isUuid } from '@/lib/validation';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireStaffApi(req);
  if (g.fail) return g.fail;
  const { id } = await ctx.params;
  const v = isUuid(id) ? await visitorSummary(g.user, id) : null;
  return json(v ? { found: true, ...v } : { found: false });
}
