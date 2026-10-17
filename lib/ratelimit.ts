/* Rate limits, counted in Postgres so they hold across Vercel's many
 * short-lived server instances (no extra service needed). */
import { rawSql } from './db';

export const LIMITS = {
  loginPerIp:        { windowSec: 15 * 60, max: 30 },
  loginPerEmail:     { windowSec: 15 * 60, max: 8 },
  registerPerIp:     { windowSec: 60,      max: 60 },   // generous: venue Wi-Fi may share one IP
  // Badge lookups, per signed-in account (one game account may run several screens)
  lookupPerAccount:    { windowSec: 60,    max: 60 },
  lookupPerAccountDay: { windowSec: 86400, max: 1500 },
  lookupPerIp:         { windowSec: 60,    max: 60 },
  syncPerAccount:      { windowSec: 60,    max: 240 },  // round-sync requests per account
} as const;

/** Count one hit against a bucket. Returns true if it is within the limit. */
export async function allow(bucket: string, limit: { windowSec: number; max: number }): Promise<boolean> {
  const [row] = await rawSql()<{ ok: boolean }[]>`
    select hub.hit_rate_limit(${bucket}, ${limit.windowSec}, ${limit.max}) as ok`;
  return row.ok;
}
