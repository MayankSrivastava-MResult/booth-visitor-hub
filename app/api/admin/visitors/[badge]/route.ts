/* PATCH  /api/admin/visitors/:badge  (admin) edit a visitor's details.
 *   Body: {fullName, company, jobTitle, email, mobile?, linkedinUrl?, marketingOptIn} → 200 {ok:true} | 404 | 400 {error, fields}
 * DELETE /api/admin/visitors/:badge  (admin) right-to-erasure: the visitor and everything recorded
 *   against the badge (interactions, game rounds, plays).
 *   Body: {confirm: "<the badge ID again>"} → 200 {visitors, interactions, rounds, plays} | 400 | 404 */
import type { NextRequest } from 'next/server';
import { requireAdminApi } from '@/lib/api-auth';
import { eraseVisitor } from '@/lib/data/erase';
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

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ badge: string }> }) {
  const g = await requireAdminApi(req);
  if (g.fail) return g.fail;
  const badge = badgeFromParam((await ctx.params).badge);
  const body = await readJson(req) as { confirm?: unknown } | undefined;
  const confirm = typeof body?.confirm === 'string' ? body.confirm.trim().toUpperCase() : '';
  if (!badge || confirm !== badge) return error(400, 'Type the badge ID again to confirm.');
  const r = await eraseVisitor(g.user, badge);
  if (!r.found) return error(404, 'Nothing is recorded for that badge ID.');
  const { found: _found, ...counts } = r;
  return json(counts);
}
