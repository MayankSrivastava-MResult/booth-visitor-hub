-- =====================================================================
-- 0006 GAME ACCOUNTS (replaces device keys; approved 2026-10-17)
--
-- Pharma Ninja now syncs using a normal Hub sign-in on whatever device runs it.
-- A new account type, role 'game', exists for public game screens: it can
-- ONLY run the game (fetch questions, badge first-name lookup, save rounds)
-- and can never read visitor data. Admin and staff accounts may also run the
-- game. Each synced round records the account that sent it (created_by).
--
--   - app_users.role: 'admin' | 'staff' | 'game'
--   - hub.is_staff() is now admin/staff only, so every staff policy excludes
--     game accounts at the database level
--   - role hub_device → hub_game; device_* functions → game_*
--   - device keys removed (table, column, functions)
-- =====================================================================

alter table hub.app_users drop constraint app_users_role_check;
alter table hub.app_users add constraint app_users_role_check check (role in ('admin', 'staff', 'game'));

-- Staff = an active admin or staff member. Game accounts are deliberately not staff.
create or replace function hub.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from hub.app_users u where u.id = hub.current_user_id() and u.role in ('admin', 'staff'))
$$;

alter role hub_device rename to hub_game;

-- Rounds record the signed-in account that sent them.
alter table hub.game_rounds add column created_by uuid references hub.app_users (id);
alter table hub.game_rounds drop column device_key_id;
drop function hub.device_ingest(uuid, jsonb);
drop function hub.device_authenticate(bytea);
drop table hub.device_keys;

alter function hub.device_content() rename to game_content;
alter function hub.device_lookup(text) rename to game_lookup;

-- Stores synced rounds and their plays for the given (signed-in) account.
-- Idempotent: a round id already stored is acknowledged again without changes,
-- so retries never create duplicates. Each item is all-or-nothing; a bad item
-- is reported and the others still go in.
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
      insert into hub.game_rounds (round_id, created_by, badge_id, badge_confirmed, display_name, domain_id,
                                   score, questions, correct, longest_streak, end_reason, played_at, play_date)
      values (v_id, p_user,
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

revoke execute on function hub.game_ingest(uuid, jsonb) from public;
grant execute on function hub.game_ingest(uuid, jsonb) to hub_game;
