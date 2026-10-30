/* POST /api/game/rounds   (any signed-in account: game, staff or admin) — the game's outbox sync.
 * Each round records the account that sent it.
 * Body: {items:[{round:{roundId, ts, date, displayName, email, emailConfirmed, domainId, score, questions,
 *                       correct, longestStreak, endReason},
 *                plays:[{ts, questionId, result, msToSlice}]}]}   1–20 items
 * → 200 {acked:[roundId], rejected:[{roundId, reason}]}
 * Idempotent: a round id already stored is acknowledged again without changes, so
 * retries never duplicate. A malformed item is rejected without blocking the others. */
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireGameApi } from '@/lib/api-auth';
import { asGame } from '@/lib/db';
import { error, json, readJson } from '@/lib/http';
import { allow, LIMITS } from '@/lib/ratelimit';

const Item = z.object({
  round: z.object({
    roundId: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/),
    ts: z.number().finite().positive(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    displayName: z.string().min(1).max(40),
    email: z.string().max(254).optional().default(''),
    emailConfirmed: z.boolean().optional().default(false),
    // rounds saved on a screen before the switch to email still carry the old field names
    visitorId: z.string().max(254).optional(),
    badgeConfirmed: z.boolean().optional(),
    domainId: z.string().min(1).max(40),
    score: z.number().int().min(0),
    questions: z.number().int().min(0),
    correct: z.number().int().min(0),
    longestStreak: z.number().int().min(0),
    endReason: z.enum(['time', 'lives', 'cleared']),
  }),
  plays: z.array(z.object({
    ts: z.number().finite().positive(),
    questionId: z.string().min(1).max(40),
    result: z.enum(['correct', 'wrong', 'missed']),
    msToSlice: z.union([z.number().int().min(0), z.literal(''), z.null()]).optional(),
  })).max(300),
});

export async function POST(req: NextRequest) {
  const g = await requireGameApi(req);
  if (g.fail) return g.fail;
  if (!(await allow(`sync:user:${g.user.id}`, LIMITS.syncPerAccount))) return error(429, 'Too many requests.');
  const body = await readJson(req, 1024 * 1024) as { items?: unknown } | undefined;
  if (!body || !Array.isArray(body.items) || body.items.length < 1 || body.items.length > 20) return error(400, 'Send 1–20 items.');

  const valid: z.infer<typeof Item>[] = [];
  const rejected: { roundId: string; reason: string }[] = [];
  for (const raw of body.items) {
    const p = Item.safeParse(raw);
    if (p.success) {
      // a round saved before the switch to email carries visitorId / badgeConfirmed instead
      const r = p.data.round;
      valid.push({ ...p.data, round: { ...r, email: r.email || r.visitorId || '', emailConfirmed: r.emailConfirmed || !!r.badgeConfirmed } });
    }
    else rejected.push({ roundId: String((raw as { round?: { roundId?: unknown } })?.round?.roundId ?? ''), reason: p.error.issues[0]?.message ?? 'invalid' });
  }
  let acked: string[] = [];
  if (valid.length) {
    const [row] = await asGame((tx) => tx<{ r: { acked: string[]; rejected: { roundId: string; reason: string }[] } }[]>`
      select hub.game_ingest(${g.user.id}::uuid, ${tx.json(valid as never)}) as r`);
    acked = row.r.acked;
    rejected.push(...row.r.rejected);
  }
  return json({ acked, rejected });
}
