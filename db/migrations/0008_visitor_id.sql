-- =====================================================================
-- 0008 EMAIL OPTIONAL; VISITORS HAVE AN INTERNAL ID (approved 2026-10-30)
--
-- The organisers' pre-seed list has names but no email addresses, and some
-- visitors will not give one. So:
--   - visitors: primary key email → id (uuid); email optional, unique when given
--   - interactions.visitor_email → visitor_id
--   - visitors can be pre-seeded by an admin import (registration_mode 'import'):
--     no consent recorded until a team member completes their registration
--     (hub.complete_registration); job title optional for them
--   - game rounds still record the email the player typed (if any) and are
--     matched to a visitor by email; a trigger moves them when an email changes
--   - change_visitor_email() is replaced by that trigger
-- Existing rows are kept (the live database was empty at this point).
-- =====================================================================

-- Visitors: internal id as the key, email optional
alter table hub.interactions drop constraint interactions_visitor_email_fkey;
alter table hub.visitors drop constraint visitors_pkey;
alter table hub.visitors add column id uuid not null default gen_random_uuid();
alter table hub.visitors add primary key (id);
alter table hub.visitors alter column email drop not null;
alter table hub.visitors add constraint visitors_email_key unique (email);

-- Interactions point at the visitor's id
alter table hub.interactions add column visitor_id uuid;
update hub.interactions i set visitor_id = v.id from hub.visitors v where v.email = i.visitor_email;
alter table hub.interactions alter column visitor_id set not null;
alter table hub.interactions add constraint interactions_visitor_id_fkey
  foreign key (visitor_id) references hub.visitors (id) on delete cascade;
drop index hub.interactions_visitor_idx;
alter table hub.interactions drop column visitor_email;
create index interactions_visitor_idx on hub.interactions (visitor_id);

-- Pre-seeded visitors: no consent yet, job title optional
alter table hub.visitors drop constraint visitors_registration_mode_check;
alter table hub.visitors add constraint visitors_registration_mode_check
  check (registration_mode in ('self', 'staff', 'import'));
alter table hub.visitors drop constraint visitors_consent_given_check;
alter table hub.visitors alter column consent_version drop not null;
alter table hub.visitors alter column consent_at drop not null;
alter table hub.visitors add constraint visitors_consent_check
  check (case when consent_given then consent_version is not null and consent_at is not null
              else registration_mode = 'import' end);
alter table hub.visitors drop constraint visitors_job_title_check;
alter table hub.visitors alter column job_title drop not null;
alter table hub.visitors add constraint visitors_job_title_check
  check (case when job_title is null then registration_mode = 'import' else hub.is_text(job_title, 120) end);
create index visitors_full_name_idx on hub.visitors (lower(full_name));

-- Admins may import (recorded as themselves)
create policy visitors_import on hub.visitors for insert to hub_user
  with check (hub.is_admin() and registration_mode = 'import' and created_by = hub.current_user_id() and not consent_given);

-- A changed email takes the game rounds played under the old one along
drop function hub.change_visitor_email(text, text);
create function hub.visitor_email_moves_rounds()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.email is not null and new.email is not null and new.email <> old.email then
    update hub.game_rounds set player_email = new.email where player_email = old.email;
  end if;
  return new;
end $$;
revoke execute on function hub.visitor_email_moves_rounds() from public;
create trigger visitors_email_moves_rounds after update of email on hub.visitors
  for each row execute function hub.visitor_email_moves_rounds();

-- ---------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------

-- Registers a visitor from the public form. Never reads or overwrites an existing
-- record. Email is optional; when given it must be new.
-- Returns 'created', 'exists', 'invalid_email' or 'stale_consent'.
create or replace function hub.register_visitor_public(p jsonb)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_cfg   hub.settings;
  v_email text := nullif(lower(btrim(coalesce(p->>'email', ''))), '');
begin
  select * into v_cfg from hub.settings where id = 1;
  if v_email is not null and not hub.is_email(v_email) then return 'invalid_email'; end if;
  if (p->>'consentVersion')::int is distinct from v_cfg.consent_version then return 'stale_consent'; end if;

  insert into hub.visitors (email, full_name, company, job_title, mobile, linkedin_url,
                            consent_given, consent_version, consent_at, marketing_opt_in, registration_mode)
  values (v_email, btrim(p->>'fullName'), btrim(p->>'company'), btrim(p->>'jobTitle'),
          nullif(btrim(coalesce(p->>'mobile', '')), ''), nullif(btrim(coalesce(p->>'linkedinUrl', '')), ''),
          (p->>'consent')::boolean, v_cfg.consent_version, now(),
          coalesce((p->>'marketingOptIn')::boolean, false), 'self')
  on conflict (email) do nothing;

  return case when found then 'created' else 'exists' end;
end $$;

-- Staff complete the registration of a pre-seeded visitor in person: details
-- checked or filled in, consent recorded now. Returns 'ok', 'not_found',
-- 'already_registered', 'email_taken' or 'stale_consent'.
create function hub.complete_registration(p_id uuid, p jsonb)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_cfg   hub.settings;
  v_email text := nullif(lower(btrim(coalesce(p->>'email', ''))), '');
  v_row   hub.visitors;
begin
  if not hub.is_staff() then raise exception 'staff only' using errcode = '42501'; end if;
  select * into v_cfg from hub.settings where id = 1;
  if (p->>'consentVersion')::int is distinct from v_cfg.consent_version then return 'stale_consent'; end if;
  if not coalesce((p->>'consent')::boolean, false) then raise exception 'consent required' using errcode = '23514'; end if;
  select * into v_row from hub.visitors where id = p_id for update;
  if not found then return 'not_found'; end if;
  if v_row.consent_given then return 'already_registered'; end if;
  if v_email is not null and exists (select 1 from hub.visitors where email = v_email and id <> p_id) then return 'email_taken'; end if;

  update hub.visitors set
    email = v_email, full_name = btrim(p->>'fullName'), company = btrim(p->>'company'), job_title = btrim(p->>'jobTitle'),
    mobile = nullif(btrim(coalesce(p->>'mobile', '')), ''), linkedin_url = nullif(btrim(coalesce(p->>'linkedinUrl', '')), ''),
    consent_given = true, consent_version = v_cfg.consent_version, consent_at = now(),
    marketing_opt_in = coalesce((p->>'marketingOptIn')::boolean, false),
    updated_at = now(), updated_by = hub.current_user_id()
  where id = p_id;
  return 'ok';
end $$;
revoke execute on function hub.complete_registration(uuid, jsonb) from public;
grant execute on function hub.complete_registration(uuid, jsonb) to hub_user;
