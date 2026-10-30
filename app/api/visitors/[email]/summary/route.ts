/* GET /api/visitors/:email/summary → {found:true, email, fullName, company, jobTitle} | {found:false}
 * Staff and admin. */
import type { NextRequest } from 'next/server';
import { requireStaffApi } from '@/lib/api-auth';
import { visitorSummary } from '@/lib/data/visitors';
import { json } from '@/lib/http';
import { emailFromParam } from '@/lib/validation';

export async function GET(req: NextRequest, ctx: { params: Promise<{ email: string }> }) {
  const g = await requireStaffApi(req);
  if (g.fail) return g.fail;
  const email = emailFromParam((await ctx.params).email);
  const v = email ? await visitorSummary(g.user, email) : null;
  return json(v ? { found: true, ...v } : { found: false });
}
