/* Connection details for the throwaway test database (local only, not secrets). */
const port = 54329;
export const TEST_DB = {
  port,
  dir: '.tmp/pg-test',
  ownerPassword: 'owner-test-pw',
  appPassword: 'hub-api-test-pw',
  ownerUrl: `postgres://postgres:owner-test-pw@localhost:${port}/postgres`,
  appUrl: `postgres://hub_api:hub-api-test-pw@localhost:${port}/postgres`,
};
