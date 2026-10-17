-- =====================================================================
-- 0002 SECURITY: database roles, explicit grants, row-level security.
--
-- How requests reach the database
--   hub_api     the ONE login the Next.js server uses (DATABASE_URL). It has
--               almost no rights of its own (NOINHERIT): for each request the
--               server opens a transaction and switches to one of these roles:
--   hub_user    a signed-in team member. The server also sets the setting
--               hub.user_id to that person's id; the policies below read it.
--               Staff vs admin is decided live from hub.app_users, so removing
--               a person or changing their role takes effect immediately.
--   hub_public  the unauthenticated registration form. No table rights at all;
--               may only call the registration functions in 0003.
--   hub_device  a Pharma Ninja device (authenticated by device key in the API).
--               No table rights at all; may only call the device functions in 0003,
--               which never return visitor data beyond a first name.
--
-- Every table has row-level security enabled. Nothing is granted to PUBLIC.
-- The hub_api password is never stored here: scripts/migrate.mjs sets it from
-- the DATABASE_URL environment variable.
-- =====================================================================

do $$
begin
  if not exists (select from pg_roles where rolname = 'hub_api')    then create role hub_api login noinherit; end if;
  if not exists (select from pg_roles where rolname = 'hub_user')   then create role hub_user nologin; end if;
  if not exists (select from pg_roles where rolname = 'hub_public') then create role hub_public nologin; end if;
  if not exists (select from pg_roles where rolname = 'hub_device') then create role hub_device nologin; end if;
end $$;

grant hub_user, hub_public, hub_device to hub_api;

-- Nothing in the hub schema is available to anyone by default.
revoke all on schema hub from public;
revoke all on all tables in schema hub from public;
revoke execute on all functions in schema hub from public;
alter default privileges in schema hub revoke execute on functions from public;

grant usage on schema hub to hub_api, hub_user, hub_public, hub_device;

-- Pure validation helpers used by CHECK constraints.
grant execute on function hub.is_email(text), hub.is_text(text, int), hub.option_ok(text), hub.options_ok(text[])
  to hub_user, hub_public, hub_device;

-- ---------------------------------------------------------------------
-- Who is asking? (used by every policy)
-- ---------------------------------------------------------------------

-- The signed-in team member's id, or null if the setting is missing or the person was removed.
create or replace function hub.current_user_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select u.id from hub.app_users u
  where u.id = nullif(current_setting('hub.user_id', true), '')::uuid and u.active
$$;

-- Any active team member (staff or admin).
create or replace function hub.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select hub.current_user_id() is not null
$$;

create or replace function hub.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from hub.app_users u where u.id = hub.current_user_id() and u.role = 'admin')
$$;

grant execute on function hub.current_user_id(), hub.is_staff(), hub.is_admin() to hub_user;

-- ---------------------------------------------------------------------
-- Housekeeping triggers
-- ---------------------------------------------------------------------

-- Keep updated_at current on every update.
create or replace function hub.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['app_users', 'settings', 'visitors', 'interactions', 'domains', 'questions'] loop
    execute format('create trigger %I before update on hub.%I for each row execute function hub.touch_updated_at()',
                   t || '_touch', t);
  end loop;
end $$;

-- Removing a person, changing their role or resetting their password ends their sessions.
create or replace function hub.revoke_sessions_on_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.active is distinct from old.active
     or new.role is distinct from old.role
     or new.password_hash is distinct from old.password_hash then
    delete from hub.sessions where user_id = new.id;
  end if;
  return new;
end $$;

create trigger app_users_revoke_sessions after update on hub.app_users
  for each row execute function hub.revoke_sessions_on_change();

-- ---------------------------------------------------------------------
-- Row-level security: enabled on every table
-- ---------------------------------------------------------------------
alter table hub.app_users        enable row level security;
alter table hub.sessions         enable row level security;
alter table hub.consent_versions enable row level security;
alter table hub.settings         enable row level security;
alter table hub.visitors         enable row level security;
alter table hub.interactions     enable row level security;
alter table hub.domains          enable row level security;
alter table hub.questions        enable row level security;
alter table hub.device_keys      enable row level security;
alter table hub.game_rounds      enable row level security;
alter table hub.game_plays       enable row level security;
alter table hub.rate_limits      enable row level security;
-- sessions and rate_limits get no grants and no policies: only the
-- SECURITY DEFINER functions in 0003 touch them.

-- Team list. Staff can read names and roles (for "met by" and follow-up pickers)
-- but never password hashes; only admins can add, change or remove people.
grant select (id, email, display_name, role, active, created_at, created_by, updated_at, updated_by)
  on hub.app_users to hub_user;
grant insert, update on hub.app_users to hub_user;
create policy app_users_read  on hub.app_users for select to hub_user using (hub.is_staff());
create policy app_users_add   on hub.app_users for insert to hub_user with check (hub.is_admin());
create policy app_users_edit  on hub.app_users for update to hub_user using (hub.is_admin()) with check (hub.is_admin());

-- Settings and consent text: everyone signed in reads, admins change.
grant select, update on hub.settings to hub_user;
create policy settings_read on hub.settings for select to hub_user using (hub.is_staff());
create policy settings_edit on hub.settings for update to hub_user using (hub.is_admin()) with check (hub.is_admin());

grant select, insert on hub.consent_versions to hub_user;
create policy consent_read on hub.consent_versions for select to hub_user using (hub.is_staff());
create policy consent_add  on hub.consent_versions for insert to hub_user with check (hub.is_admin());

-- Visitors: staff read and register (staff-assisted mode, recorded as themselves);
-- admins edit and delete.
grant select, insert, update, delete on hub.visitors to hub_user;
create policy visitors_read   on hub.visitors for select to hub_user using (hub.is_staff());
create policy visitors_add    on hub.visitors for insert to hub_user
  with check (hub.is_staff() and registration_mode = 'staff' and created_by = hub.current_user_id());
create policy visitors_edit   on hub.visitors for update to hub_user using (hub.is_admin()) with check (hub.is_admin());
create policy visitors_delete on hub.visitors for delete to hub_user using (hub.is_admin());

-- Interactions: staff read all and log as themselves; staff edit/delete only
-- their own; admins edit/delete any.
grant select, insert, update, delete on hub.interactions to hub_user;
create policy interactions_read on hub.interactions for select to hub_user using (hub.is_staff());
create policy interactions_add  on hub.interactions for insert to hub_user
  with check (hub.is_staff() and created_by = hub.current_user_id());
create policy interactions_edit on hub.interactions for update to hub_user
  using (hub.is_admin() or (hub.is_staff() and created_by = hub.current_user_id()))
  with check (hub.is_admin() or (hub.is_staff() and created_by = hub.current_user_id()));
create policy interactions_delete on hub.interactions for delete to hub_user
  using (hub.is_admin() or (hub.is_staff() and created_by = hub.current_user_id()));

-- Game domains: staff read (domain tags on conversations); admins manage.
grant select, insert, update, delete on hub.domains to hub_user;
create policy domains_read  on hub.domains for select to hub_user using (hub.is_staff());
create policy domains_admin on hub.domains for all    to hub_user using (hub.is_admin()) with check (hub.is_admin());

-- Questions: admins only.
grant select, insert, update, delete on hub.questions to hub_user;
create policy questions_admin on hub.questions for all to hub_user using (hub.is_admin()) with check (hub.is_admin());

-- Device keys: admins only, and never the stored hash.
grant select (id, label, key_prefix, created_at, created_by, last_used_at, revoked_at, revoked_by)
  on hub.device_keys to hub_user;
grant insert, update on hub.device_keys to hub_user;
create policy device_keys_admin on hub.device_keys for all to hub_user using (hub.is_admin()) with check (hub.is_admin());

-- Game rounds and plays: written only by devices through device_ingest();
-- staff read (visitor timeline); admins delete (erasure and purge).
grant select, delete on hub.game_rounds, hub.game_plays to hub_user;
create policy rounds_read   on hub.game_rounds for select to hub_user using (hub.is_staff());
create policy rounds_delete on hub.game_rounds for delete to hub_user using (hub.is_admin());
create policy plays_read    on hub.game_plays  for select to hub_user using (hub.is_staff());
create policy plays_delete  on hub.game_plays  for delete to hub_user using (hub.is_admin());
