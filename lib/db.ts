/* Database access.
 *
 * The server connects as ONE low-privilege login (hub_api, from DATABASE_URL)
 * and runs every request inside a transaction that switches to the role for
 * the caller, so Postgres row-level security applies to everything:
 *
 *   asUser(user, fn)  signed-in team member (role hub_user + setting hub.user_id)
 *   asPublic(fn)      unauthenticated registration form (role hub_public)
 *   asGame(fn)        Pharma Ninja, for a signed-in account (role hub_game: game
 *                     content, badge first-name lookup and saving rounds ONLY)
 *
 * Calls that run as hub_api itself (sessions, rate limits) use rawSql().
 * prepare:false is required by Supabase's transaction pooler.
 */
import postgres from 'postgres';

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;

const globalForSql = globalThis as unknown as { __hubSql?: Sql };

/** The shared connection pool (created on first use, so builds don't need a database). */
export function rawSql(): Sql {
  if (!globalForSql.__hubSql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    globalForSql.__hubSql = postgres(url, {
      prepare: false,
      max: 3,
      idle_timeout: 20,
      connect_timeout: 10,
      onnotice: () => {},
    });
  }
  return globalForSql.__hubSql;
}

async function inRole<T>(role: 'hub_user' | 'hub_public' | 'hub_game', userId: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const result = await rawSql().begin(async (tx) => {
    if (userId) await tx`select set_config('hub.user_id', ${userId}, true)`;
    await tx.unsafe(`set local role ${role}`);
    return fn(tx);
  });
  return result as T;
}

export function asUser<T>(user: { id: string }, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return inRole('hub_user', user.id, fn);
}

export function asPublic<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return inRole('hub_public', null, fn);
}

export function asGame<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return inRole('hub_game', null, fn);
}

/** Postgres error codes we translate into friendly API responses. */
export const PG = {
  uniqueViolation: '23505',
  foreignKeyViolation: '23503',
  checkViolation: '23514',
  insufficientPrivilege: '42501',
} as const;

export function pgCode(e: unknown): string | undefined {
  return typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : undefined;
}
