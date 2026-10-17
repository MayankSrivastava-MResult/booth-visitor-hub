/* Starts a fresh embedded Postgres 17, applies every migration with the real
 * migrator, sets the hub_api password, and stops the server after the run. */
import fs from 'node:fs';
import EmbeddedPostgres from 'embedded-postgres';
import postgres from 'postgres';
// @ts-expect-error plain ESM script without type declarations
import { migrate, setHubApiPassword } from '../scripts/migrate.mjs';
import { TEST_DB } from './test-db';

export default async function setup() {
  fs.rmSync(TEST_DB.dir, { recursive: true, force: true });
  const pg = new EmbeddedPostgres({
    databaseDir: TEST_DB.dir,
    port: TEST_DB.port,
    user: 'postgres',
    password: TEST_DB.ownerPassword,
    persistent: false,
    onLog: () => {},
  });
  await pg.initialise();
  await pg.start();

  const sql = postgres(TEST_DB.ownerUrl, { max: 1, onnotice: () => {} });
  await migrate(sql, { log: () => {} });
  await setHubApiPassword(sql, TEST_DB.appPassword);
  await sql.end();

  return async () => { await pg.stop(); };
}
