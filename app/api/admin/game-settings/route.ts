/* GET /api/admin/game-settings → {fallSpeed}   (admin)
 * PUT /api/admin/game-settings {fallSpeed: 0.5–2.0} → 200 {fallSpeed} | 400
 * fallSpeed is a factor on the game's built-in pill fall times (1 = as built). Every game
 * screen picks it up with the questions at its next content refresh. */
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAdminApi } from '@/lib/api-auth';
import { FALL_SPEED, getFallSpeed, setFallSpeed } from '@/lib/data/content';
import { error, json, readJson } from '@/lib/http';

const body = z.object({ fallSpeed: z.number().min(FALL_SPEED.min).max(FALL_SPEED.max) });

export async function GET(req: NextRequest) {
  const g = await requireAdminApi(req);
  if (g.fail) return g.fail;
  return json({ fallSpeed: await getFallSpeed(g.user) });
}

export async function PUT(req: NextRequest) {
  const g = await requireAdminApi(req);
  if (g.fail) return g.fail;
  const p = body.safeParse(await readJson(req));
  if (!p.success) return error(400, `Fall speed must be between ${FALL_SPEED.min} and ${FALL_SPEED.max}.`);
  const v = Math.round(p.data.fallSpeed * 100) / 100;
  await setFallSpeed(g.user, v);
  return json({ fallSpeed: v });
}
