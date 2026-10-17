/* GET /api/qr?format=png|svg → download of the registration QR code (staff and admin).
 * The code itself only contains the public address <site>/register. */
import type { NextRequest } from 'next/server';
import { requireStaffApi } from '@/lib/api-auth';
import { qrPng, qrSvg, registerUrl } from '@/lib/qr';

export async function GET(req: NextRequest) {
  const g = await requireStaffApi(req);
  if (g.fail) return g.fail;
  const url = registerUrl(req.headers);
  const name = 'mresult-booth-register-qr';
  if (req.nextUrl.searchParams.get('format') === 'svg') {
    return new Response(await qrSvg(url), { headers: {
      'Content-Type': 'image/svg+xml', 'Content-Disposition': `attachment; filename="${name}.svg"`, 'Cache-Control': 'no-store' } });
  }
  return new Response(new Uint8Array(await qrPng(url)), { headers: {
    'Content-Type': 'image/png', 'Content-Disposition': `attachment; filename="${name}.png"`, 'Cache-Control': 'no-store' } });
}
