// Tests run against a real, throwaway Postgres 17 (embedded-postgres) started
// by tests/global-setup.ts, with every migration applied: the same SQL that
// runs on Supabase. Test files share one database, so they run one at a time.
import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { TEST_DB } from './tests/test-db';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname) } },
  test: {
    globalSetup: ['./tests/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 120000,
    env: {
      DATABASE_URL: TEST_DB.appUrl,
      TEST_OWNER_URL: TEST_DB.ownerUrl,
      IP_HASH_SECRET: 'test-secret',
    },
  },
});
