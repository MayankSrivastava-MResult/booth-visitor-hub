/* GET /api/game/content   (any signed-in account: game, staff or admin)
 * → 200 {version, domains:[{id, name, desc, icon, accent, enabled}], questions:[{id, domainId, difficulty,
 *        questionText, options[], correctIndex, explanation, source, enabled}]}   enabled items only, game shape
 * → 304 when If-None-Match matches the current version (nothing changed) */
import { createHash } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { requireGameApi } from '@/lib/api-auth';
import { asGame } from '@/lib/db';
import { json } from '@/lib/http';

export async function GET(req: NextRequest) {
  const g = await requireGameApi(req);
  if (g.fail) return g.fail;
  const [row] = await asGame((tx) => tx<{ c: { domains: unknown[]; questions: unknown[] } }[]>`select hub.game_content() as c`);
  const version = createHash('sha256').update(JSON.stringify(row.c)).digest('base64url').slice(0, 16);
  const etag = `"${version}"`;
  if (req.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag, 'Cache-Control': 'no-cache' } });
  }
  return json({ version, ...row.c }, 200, { ETag: etag, 'Cache-Control': 'no-cache' });
}
