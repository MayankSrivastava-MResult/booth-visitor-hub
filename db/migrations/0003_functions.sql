-- =====================================================================
-- 0003 FUNCTIONS: the only doors into tables that the request roles
-- cannot touch directly. All are SECURITY DEFINER with an empty
-- search_path, and each is granted to exactly the role that needs it.
--
--   Sign-in and sessions (hub_api) ....... auth_user_by_email, session_create,
--                                          session_lookup, session_delete
--   Rate limiting (hub_api) .............. hit_rate_limit
--   Public registration (hub_public) ..... registration_config, register_visitor_public
--   Game devices (hub_device) ............ device_authenticate, device_content,
--                                          device_lookup, device_ingest
-- =====================================================================

-- ---------------------------------------------------------------------
-- Sign-in and sessions
-- ---------------------------------------------------------------------

-- Password check happens in the server (scrypt); this only fetches the stored hash.
create or replace function hub.auth_user_by_email(p_email text)
returns table (id uuid, password_hash text, active boolean)
language sql stable security definer set search_path = '' as $$
  select u.id, u.password_hash, u.active from hub.app_users u where u.email = lower(btrim(p_email))
$$;

create or replace function hub.session_create(p_user uuid, p_token_hash bytea, p_ttl_seconds int)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from hub.sessions where expires_at < now();          -- tidy up expired sessions
  insert into hub.sessions (token_hash, user_id, expires_at)
  values (p_token_hash, p_user, now() + make_interval(secs => p_ttl_seconds));
end $$;

-- Returns the signed-in person, or no row if the session is unknown, expired or the person was removed.
create or replace function hub.session_lookup(p_token_hash bytea)
returns table (user_id uuid, email text, display_name text, role text)
language plpgsql security definer set search_path = '' as $$
begin
  update hub.sessions s set last_seen_at = now()
  where s.token_hash = p_token_hash and s.last_seen_at < now() - interval '5 minutes';
  return query
    select u.id, u.email, u.display_name, u.role
    from hub.sessions s join hub.app_users u on u.id = s.user_id
    where s.token_hash = p_token_hash and s.expires_at > now() and u.active;
end $$;

create or replace function hub.session_delete(p_token_hash bytea)
returns void
language sql security definer set search_path = '' as $$
  delete from hub.sessions where token_hash = p_token_hash
$$;

grant execute on function hub.auth_user_by_email(text), hub.session_create(uuid, bytea, int),
  hub.session_lookup(bytea), hub.session_delete(bytea) to hub_api;

-- ---------------------------------------------------------------------
-- Rate limiting: fixed windows. Returns true if this hit is allowed.
-- ---------------------------------------------------------------------
create or replace function hub.hit_rate_limit(p_bucket text, p_window_seconds int, p_max int)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_start timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits int;
begin
  insert into hub.rate_limits (bucket, window_start, hits) values (p_bucket, v_start, 1)
  on conflict (bucket, window_start) do update set hits = hub.rate_limits.hits + 1
  returning hits into v_hits;
  if random() < 0.01 then
    delete from hub.rate_limits where window_start < now() - interval '2 days';
  end if;
  return v_hits <= p_max;
end $$;

grant execute on function hub.hit_rate_limit(text, int, int) to hub_api;

-- ---------------------------------------------------------------------
-- Public registration
-- ---------------------------------------------------------------------

-- What the registration form needs to render: current consent text and the badge rule.
create or replace function hub.registration_config()
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'consentVersion', s.consent_version,
    'noticeText',     c.notice_text,
    'marketingText',  c.marketing_text,
    'badgePattern',   s.badge_pattern,
    'badgeHint',      s.badge_hint)
  from hub.settings s join hub.consent_versions c on c.version = s.consent_version
  where s.id = 1
$$;

-- Registers a visitor from the public form. Never reads or overwrites an
-- existing record. Returns 'created', 'exists', 'invalid_badge' or 'stale_consent'.
-- The API has already validated every field; CHECK constraints are the backstop.
create or replace function hub.register_visitor_public(p jsonb)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_cfg   hub.settings;
  v_badge text := upper(btrim(coalesce(p->>'badgeId', '')));
begin
  select * into v_cfg from hub.settings where id = 1;
  if v_badge !~ v_cfg.badge_pattern then return 'invalid_badge'; end if;
  if (p->>'consentVersion')::int is distinct from v_cfg.consent_version then return 'stale_consent'; end if;

  insert into hub.visitors (badge_id, full_name, company, job_title, email, mobile, linkedin_url,
                            consent_given, consent_version, consent_at, marketing_opt_in, registration_mode)
  values (v_badge, btrim(p->>'fullName'), btrim(p->>'company'), btrim(p->>'jobTitle'), btrim(p->>'email'),
          nullif(btrim(coalesce(p->>'mobile', '')), ''), nullif(btrim(coalesce(p->>'linkedinUrl', '')), ''),
          (p->>'consent')::boolean, v_cfg.consent_version, now(),
          coalesce((p->>'marketingOptIn')::boolean, false), 'self')
  on conflict (badge_id) do nothing;

  return case when found then 'created' else 'exists' end;
end $$;

grant execute on function hub.registration_config() to hub_public, hub_user;
grant execute on function hub.register_visitor_public(jsonb) to hub_public;

-- ---------------------------------------------------------------------
-- Game devices
-- ---------------------------------------------------------------------

-- First name for the game's "Welcome, <first name>" prompt: the first word of
-- the full name, skipping common honorifics (Dr, Mr, Mrs, Ms, Miss, Prof).
create or replace function hub.first_name(p_full_name text)
returns text
language sql immutable set search_path = '' as $$
  select coalesce(
    (select w from unnest(regexp_split_to_array(btrim(p_full_name), '\s+')) with ordinality as t(w, n)
     where lower(regexp_replace(w, '\.$', '')) not in ('dr', 'mr', 'mrs', 'ms', 'miss', 'prof')
     order by n limit 1),
    split_part(btrim(p_full_name), ' ', 1))
$$;

-- Returns the device id for a valid, unrevoked key (by SHA-256), or null.
create or replace function hub.device_authenticate(p_key_hash bytea)
returns uuid
language sql security definer set search_path = '' as $$
  update hub.device_keys set last_used_at = now()
  where key_hash = p_key_hash and revoked_at is null
  returning id
$$;

-- Enabled domains and questions, in exactly the shape Pharma Ninja stores them.
create or replace function hub.device_content()
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'domains', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'desc', d.description, 'icon', d.icon_key,
                                          'accent', d.accent, 'enabled', true) order by d.sort_order, d.id)
      from hub.domains d where d.enabled), '[]'::jsonb),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object('id', q.id, 'domainId', q.domain_id, 'difficulty', q.difficulty,
                                          'questionText', q.question_text, 'options', to_jsonb(q.options),
                                          'correctIndex', q.correct_index, 'explanation', q.explanation,
                                          'source', q.source, 'enabled', true) order by q.id)
      from hub.questions q join hub.domains d on d.id = q.domain_id
      where q.enabled and d.enabled), '[]'::jsonb))
$$;

-- Badge lookup for the game. Returns ONLY whether the badge exists and a first name.
create or replace function hub.device_lookup(p_badge text)
returns table (found boolean, first_name text)
language sql stable security definer set search_path = '' as $$
  select v.badge_id is not null, hub.first_name(v.full_name)
  from (select 1) as one
  left join hub.visitors v on v.badge_id = upper(btrim(p_badge))
$$;

-- Stores synced rounds and their plays. Idempotent: a round id already stored
-- is acknowledged again without changes, so retries never create duplicates.
-- Each item is all-or-nothing; a bad item is reported and the rest still go in.
create or replace function hub.device_ingest(p_device uuid, p_items jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  it       jsonb;
  r        jsonb;
  v_id     text;
  acked    text[] := '{}';
  rejected jsonb := '[]'::jsonb;
begin
  for it in select value from jsonb_array_elements(p_items) loop
    r := it->'round';
    v_id := r->>'roundId';
    begin
      insert into hub.game_rounds (round_id, device_key_id, badge_id, badge_confirmed, display_name, domain_id,
                                   score, questions, correct, longest_streak, end_reason, played_at, play_date)
      values (v_id, p_device,
              nullif(upper(btrim(coalesce(r->>'visitorId', ''))), ''),
              coalesce((r->>'badgeConfirmed')::boolean, false),
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

grant execute on function hub.device_authenticate(bytea), hub.device_content(), hub.device_lookup(text),
  hub.device_ingest(uuid, jsonb) to hub_device;
