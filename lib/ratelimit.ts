/* Rate limits, counted in Postgres so they hold across Vercel's many
 * short-lived server instances (no extra service needed). */
import { rawSql } from './db';

export const LIMITS = {
  loginPerIp:        { windowSec: 15 * 60, max: 30 },
  loginPerEmail:     { windowSec: 15 * 60, max: 8 },
  registerPerIp:     { windowSec: 60,      max: 60 },   // generous: venue Wi-Fi may share one IP
  lookupPerDevice:   { windowSec: 60,      max: 30 },
  lookupPerDeviceDay:{ windowSec: 86400,   max: 600 },
  lookupPerIp:       { windowSec: 60,      max: 60 },
} as const;

/** Count one hit against a bucket. Returns true if it is within the limit. */
export async function allow(bucket: string, limit: { windowSec: number; max: number }): Promise<boolean> {
  const [row] = await rawSql()<{ ok: boolean }[]>`
    select hub.hit_rate_limit(${bucket}, ${limit.windowSec}, ${limit.max}) as ok`;
  return row.ok;
}
