/* PATCH  /api/admin/visitors/:id  (admin) edit a visitor's details, including the email.
 *   Body: {email?, fullName, company, jobTitle, mobile?, linkedinUrl?, marketingOptIn}
 *   → 200 {ok:true} | 404 | 409 (the email belongs to another visitor) | 400 {error, fields}
 *   A changed email takes the game rounds played under the old one along.
 * DELETE /api/admin/visitors/:id  (admin) right-to-erasure: the visitor and everything recorded
 *   against them (interactions, game rounds and plays under their email).
 *   Body: {confirm: "<their full name>"} → 200 {visitors, interactions, rounds, plays} | 400 | 404 */
import type { NextRequest } from 'next/server';
import { requireAdminApi } from '@/lib/api-auth';
import { eraseVisitor } from '@/lib/data/erase';
import { updateVisitor, visitorSummary } from '@/lib/data/visitors';
import { error, json, readJson, zodFields } from '@/lib/http';
import { isUuid, visitorEditSchema } from '@/lib/validation';

const sameName = (a: string, b: string) => a.trim().replace(/\s+/g, ' ').toLowerCase() === b.trim().replace(/\s+/g, ' ').toLowerCase();

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireAdminApi(req);
  if (g.fail) return g.fail;
  const { id } = await ctx.params;
  if (!isUuid(id)) return error(404, 'Visitor not found.');
  const body = await readJson(req);
  if (body === undefined || typeof body !== 'object' || body === null) return error(400, 'Invalid request.');
  const parsed = visitorEditSchema().safeParse(body);
  if (!parsed.success) return error(400, 'Please check the highlighted fields.', zodFields(parsed.error));
  const r = await updateVisitor(g.user, id, parsed.data);
  if (r === 'email_taken') return error(409, 'Another visitor already has that email.', { email: 'Another visitor already has this email.' });
  return r === 'ok' ? json({ ok: true }) : error(404, 'Visitor not found.');
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireAdminApi(req);
  if (g.fail) return g.fail;
  const { id } = await ctx.params;
  const v = isUuid(id) ? await visitorSummary(g.user, id) : null;
  if (!v) return error(404, 'Visitor not found.');
  const body = await readJson(req) as { confirm?: unknown } | undefined;
  if (typeof body?.confirm !== 'string' || !sameName(body.confirm, v.fullName)) return error(400, 'Type their full name to confirm.');
  const { found: _found, ...counts } = await eraseVisitor(g.user, id);
  return json(counts);
}
