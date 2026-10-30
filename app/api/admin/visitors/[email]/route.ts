/* PATCH  /api/admin/visitors/:email  (admin) edit a visitor's details, including correcting the email.
 *   Body: {email, fullName, company, jobTitle, mobile?, linkedinUrl?, marketingOptIn}
 *   → 200 {ok:true, email} | 404 | 409 (the new email belongs to another visitor) | 400 {error, fields}
 *   A changed email moves the visitor's interactions and game rounds with it.
 * DELETE /api/admin/visitors/:email  (admin) right-to-erasure: the visitor and everything recorded
 *   against the email (interactions, game rounds, plays).
 *   Body: {confirm: "<the email again>"} → 200 {visitors, interactions, rounds, plays} | 400 | 404 */
import type { NextRequest } from 'next/server';
import { requireAdminApi } from '@/lib/api-auth';
import { eraseVisitor } from '@/lib/data/erase';
import { updateVisitor } from '@/lib/data/visitors';
import { error, json, readJson, zodFields } from '@/lib/http';
import { emailFromParam, normaliseEmail, visitorEditSchema } from '@/lib/validation';

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ email: string }> }) {
  const g = await requireAdminApi(req);
  if (g.fail) return g.fail;
  const email = emailFromParam((await ctx.params).email);
  const body = await readJson(req);
  if (body === undefined || typeof body !== 'object' || body === null) return error(400, 'Invalid request.');
  const parsed = visitorEditSchema().safeParse(body);
  if (!parsed.success) return error(400, 'Please check the highlighted fields.', zodFields(parsed.error));
  const r = await updateVisitor(g.user, email, parsed.data);
  if (r === 'email_taken') return error(409, 'Another visitor already has that email.', { email: 'Another visitor already has this email.' });
  return r === 'ok' ? json({ ok: true, email: parsed.data.email }) : error(404, 'Visitor not found.');
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ email: string }> }) {
  const g = await requireAdminApi(req);
  if (g.fail) return g.fail;
  const email = emailFromParam((await ctx.params).email);
  const body = await readJson(req) as { confirm?: unknown } | undefined;
  const confirm = typeof body?.confirm === 'string' ? normaliseEmail(body.confirm) : '';
  if (!email || confirm !== email) return error(400, 'Type the email again to confirm.');
  const r = await eraseVisitor(g.user, email);
  if (!r.found) return error(404, 'Nothing is recorded for that email.');
  const { found: _found, ...counts } = r;
  return json(counts);
}
