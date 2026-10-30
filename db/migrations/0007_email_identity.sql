-- =====================================================================
-- 0007 EMAIL AS THE VISITOR'S IDENTITY (approved 2026-10-30)
--
-- The organisers will not issue badge IDs, so a visitor is identified by their
-- email address (stored trimmed and lower-case, one record per email).
--   - visitors: primary key badge_id → email
--   - interactions.badge_id → visitor_email (cascades on email change and erasure)
--   - game_rounds.badge_id / badge_confirmed → player_email / email_confirmed
--   - settings: badge rule columns removed
--   - functions: registration, game lookup and round ingest work by email;
--     change_visitor_email() lets an admin correct a mistyped email
-- Event data existing at this point was test data only and is cleared (approved):
-- the test visitors shared email addresses, so they cannot become email-keyed.
-- Game content, settings, consent texts and team accounts are untouched.
-- =====================================================================

delete from hub.game_rounds;   -- and their plays
delete from hub.visitors;      -- and their interactions

-- Visitors: email is the key
alter table hub.interactions drop constraint interactions_badge_id_fkey;
alter table hub.visitors drop constraint visitors_pkey;
alter table hub.visitors drop column badge_id;
alter table hub.visitors add constraint visitors_email_normalised check (email = lower(btrim(email)));
alter table hub.visitors add primary key (email);

-- Interactions point at the visitor's email
alter table hub.interactions rename column badge_id to visitor_email;
alter table hub.interactions add constraint interactions_visitor_email_fkey
  foreign key (visitor_email) references hub.visitors (email) on update cascade on delete cascade;
alter index hub.interactions_badge_idx rename to interactions_visitor_idx;

-- Game rounds record the email the player typed (no foreign key: it may not be registered yet)
alter table hub.game_rounds drop constraint game_rounds_badge_id_check;
alter table hub.game_rounds rename column badge_id to player_email;
alter table hub.game_rounds rename column badge_confirmed to email_confirmed;
alter table hub.game_rounds add constraint game_rounds_player_email_check
  check (player_email is null or (player_email = lower(btrim(player_email)) and char_length(player_email) between 3 and 254));
alter index hub.game_rounds_badge_idx rename to game_rounds_player_email_idx;

-- Settings: no badge rule any more
alter table hub.settings drop column badge_pattern;
alter table hub.settings drop column badge_hint;

-- ---------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------

-- What the registration form needs: the current consent texts.
create or replace function hub.registration_config()
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'consentVersion', s.consent_version,
    'noticeText',     c.notice_text,
    'marketingText',  c.marketing_text)
  from hub.settings s join hub.consent_versions c on c.version = s.consent_version
  where s.id = 1
$$;

-- Registers a visitor from the public form. Never reads or overwrites an existing
-- record. Returns 'created', 'exists', 'invalid_email' or 'stale_consent'.
create or replace function hub.register_visitor_public(p jsonb)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_cfg   hub.settings;
  v_email text := lower(btrim(coalesce(p->>'email', '')));
begin
  select * into v_cfg from hub.settings where id = 1;
  if not hub.is_email(v_email) then return 'invalid_email'; end if;
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

-- Game lookup by email. Returns ONLY whether it is registered and a first name.
drop function hub.game_lookup(text);
create function hub.game_lookup(p_email text)
returns table (found boolean, first_name text)
language sql stable security definer set search_path = '' as $$
  select v.email is not null, hub.first_name(v.full_name)
  from (select 1) as one
  left join hub.visitors v on v.email = lower(btrim(p_email))
$$;
revoke execute on function hub.game_lookup(text) from public;
grant execute on function hub.game_lookup(text) to hub_game;

-- Stores synced rounds and their plays for the signed-in account. Idempotent by round id.
-- Accepts the game's new fields (email, emailConfirmed) and, for rounds saved on a
-- screen before this change, the old ones (visitorId, badgeConfirmed).
create or replace function hub.game_ingest(p_user uuid, p_items jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  it       jsonb;
  r        jsonb;
  v_id     text;
  acked    text[] := '{}';
  rejected jsonb := '[]'::jsonb;
begin
  if not exists (select 1 from hub.app_users u where u.id = p_user and u.active) then
    raise exception 'unknown or removed account';
  end if;
  for it in select value from jsonb_array_elements(p_items) loop
    r := it->'round';
    v_id := r->>'roundId';
    begin
      insert into hub.game_rounds (round_id, created_by, player_email, email_confirmed, display_name, domain_id,
                                   score, questions, correct, longest_streak, end_reason, played_at, play_date)
      values (v_id, p_user,
              nullif(lower(btrim(coalesce(r->>'email', r->>'visitorId', ''))), ''),
              coalesce((r->>'emailConfirmed')::boolean, (r->>'badgeConfirmed')::boolean, false),
              r->>'displayName', r->>'domainId',
              (r->>'score')::int, (r->>'questions')::int, (r->>'correct')::int, (r->>'longestStreak')::int,
              r->>'endReason',
              to_timestamp((r->>'ts')::double precision / 1000), (r->>'date')::date)
      on conflict (round_id) do nothing;

      if found then
        insert into hub.game_plays (round_id, seq, played_at, question_id, question_text, result, ms_to_slice)
        select v_id, (e.ord - 1)::smallint,
               to_timestamp((e.p->>'ts')::double precision / 1000),
               e.p->>'questionId', q.question_text, e.p->>'result',
               nullif(e.p->>'msToSlice', '')::int
        from jsonb_array_elements(coalesce(it->'plays', '[]'::jsonb)) with ordinality as e(p, ord)
        left join hub.questions q on q.id = e.p->>'questionId';
      end if;
      acked := acked || v_id;
    exception when others then
      rejected := rejected || jsonb_build_array(jsonb_build_object('roundId', v_id, 'reason', sqlerrm));
    end;
  end loop;
  return jsonb_build_object('acked', to_jsonb(acked), 'rejected', rejected);
end $$;

-- Admin only: correct a visitor's email. Interactions follow by foreign key;
-- game rounds played under the old email are moved too. One transaction.
-- Returns 'ok', 'not_found' or 'exists' (the new email already belongs to someone).
create or replace function hub.change_visitor_email(p_old text, p_new text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_old text := lower(btrim(p_old));
  v_new text := lower(btrim(p_new));
begin
  if not hub.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  if not hub.is_email(v_new) then raise exception 'invalid email' using errcode = '23514'; end if;
  if v_old = v_new then return 'ok'; end if;
  if exists (select 1 from hub.visitors where email = v_new) then return 'exists'; end if;
  update hub.visitors set email = v_new, updated_by = hub.current_user_id() where email = v_old;
  if not found then return 'not_found'; end if;
  update hub.game_rounds set player_email = v_new where player_email = v_old;
  return 'ok';
end $$;
revoke execute on function hub.change_visitor_email(text, text) from public;
grant execute on function hub.change_visitor_email(text, text) to hub_user;
