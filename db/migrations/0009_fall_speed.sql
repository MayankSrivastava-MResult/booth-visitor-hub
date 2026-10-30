-- =====================================================================
-- 0009 PILL FALL SPEED (approved 2026-10-30)
--
-- Admin → Game settings has a slider for how fast the answer pills fall on
-- every game screen: a factor on the game's built-in fall times (1.0 = as
-- built, 0.5 = half as fast, 2.0 = twice as fast). The game receives it with
-- the questions, so a change reaches every screen at its next content refresh.
-- =====================================================================

alter table hub.settings add column fall_speed numeric(3, 2) not null default 1.00
  check (fall_speed between 0.5 and 2.0);

create or replace function hub.game_content()
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
      where q.enabled and d.enabled), '[]'::jsonb),
    'settings', (select jsonb_build_object('fallSpeed', s.fall_speed) from hub.settings s where s.id = 1))
$$;
