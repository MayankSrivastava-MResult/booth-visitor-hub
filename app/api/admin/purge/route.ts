/* GET  /api/admin/purge → {visitors, interactions, rounds, plays}  current event data counts   (admin)
 * POST /api/admin/purge {confirm: "PURGE ALL EVENT DATA"} → 200 {visitors, interactions, rounds, plays} (what was deleted)
 * Deletes every visitor, interaction, game round and play. Keeps game content, settings,
 * consent texts and team accounts. All-or-nothing. Cannot be undone: export first. */
import type { NextRequest } from 'next/server';
import { requireAdminApi } from '@/lib/api-auth';
import { eventCounts, PURGE_PHRASE, purgeEvent } from '@/lib/data/erase';
import { error, json, readJson } from '@/lib/http';

export async function GET(req: NextRequest) {
  const g = await requireAdminApi(req);
  if (g.fail) return g.fail;
  return json(await eventCounts(g.user));
}

export async function POST(req: NextRequest) {
  const g = await requireAdminApi(req);
  if (g.fail) return g.fail;
  const body = await readJson(req) as { confirm?: unknown } | undefined;
  if (body?.confirm !== PURGE_PHRASE) return error(400, `Type ${PURGE_PHRASE} exactly to confirm.`);
  return json(await purgeEvent(g.user));
}
