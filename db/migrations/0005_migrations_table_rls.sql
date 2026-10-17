-- 0005: row-level security on the migrator's own bookkeeping table too, so that
-- literally every table in the hub schema has RLS. No grants: only the owner
-- (who runs migrations) ever touches it.
alter table hub.schema_migrations enable row level security;
revoke all on hub.schema_migrations from public;
