/* GET /api/visitors/:badge/summary → {found:true, badgeId, fullName, company, jobTitle} | {found:false}
 * Used by Log interaction to confirm who the badge belongs to. Staff and admin. */
import type { NextRequest } from 'next/server';
import { requireStaffApi } from '@/lib/api-auth';
import { visitorSummary } from '@/lib/data/visitors';
import { json } from '@/lib/http';
import { badgeFromParam } from '@/lib/validation';

export async function GET(req: NextRequest, ctx: { params: Promise<{ badge: string }> }) {
  const g = await requireStaffApi(req);
  if (g.fail) return g.fail;
  const badge = badgeFromParam((await ctx.params).badge);
  const v = badge ? await visitorSummary(g.user, badge) : null;
  return json(v ? { found: true, ...v } : { found: false });
}
