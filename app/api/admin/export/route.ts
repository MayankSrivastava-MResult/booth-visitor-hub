/* GET /api/admin/export?from=YYYY-MM-DD&to=YYYY-MM-DD  (admin) → .xlsx download.
 * Both dates optional; they are IST calendar days, inclusive. */
import type { NextRequest } from 'next/server';
import { requireAdminApi } from '@/lib/api-auth';
import { buildExport } from '@/lib/data/export';
import { error } from '@/lib/http';
import { isoDate } from '@/lib/validation';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const g = await requireAdminApi(req);
  if (g.fail) return g.fail;
  const sp = req.nextUrl.searchParams;
  const from = sp.get('from') || null, to = sp.get('to') || null;
  if ((from && !isoDate.safeParse(from).success) || (to && !isoDate.safeParse(to).success)) return error(400, 'Use dates like 2026-11-02.');
  const buf = await buildExport(g.user, from, to);
  const stamp = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
  const name = `booth-hub-export-${stamp}${from || to ? `_${from ?? 'start'}_to_${to ?? 'now'}` : ''}.xlsx`;
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
    },
  });
}
