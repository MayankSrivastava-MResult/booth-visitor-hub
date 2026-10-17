/* PATCH /api/admin/visitors/:badge  (admin) edit a visitor's details.
 * Body: {fullName, company, jobTitle, email, mobile?, linkedinUrl?, marketingOptIn} → 200 {ok:true} | 404 | 400 {error, fields}
 * (Visitor erasure, DELETE, arrives with Milestone C.) */
import type { NextRequest } from 'next/server';
import { requireAdminApi } from '@/lib/api-auth';
import { getSettings } from '@/lib/data/team';
import { updateVisitor } from '@/lib/data/visitors';
import { error, json, readJson, zodFields } from '@/lib/http';
import { badgeFromParam, visitorEditSchema } from '@/lib/validation';

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ badge: string }> }) {
  const g = await requireAdminApi(req);
  if (g.fail) return g.fail;
  const badge = badgeFromParam((await ctx.params).badge);
  const body = await readJson(req);
  if (body === undefined || typeof body !== 'object' || body === null) return error(400, 'Invalid request.');
  const cfg = await getSettings(g.user);
  // The badge ID is not editable; validate the rest with the registration rules.
  const parsed = visitorEditSchema(cfg).omit({ badgeId: true }).safeParse(body);
  if (!parsed.success) return error(400, 'Please check the highlighted fields.', zodFields(parsed.error));
  return (await updateVisitor(g.user, badge, parsed.data)) ? json({ ok: true }) : error(404, 'Visitor not found.');
}
