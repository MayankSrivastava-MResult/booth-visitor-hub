-- =====================================================================
-- 0011 MEETING MINUTES; CONVERSATIONS SAVED AS THEY ARE TYPED (approved 2026-10-30)
--
--   - interactions.minutes: a conversation's minutes as simple formatted text
--     (bold, italic, underline, numbered and bulleted lists). The API stores
--     only those tags, with no attributes (lib/rich-text.ts).
--   - Log interaction saves a conversation while it is being filled in, so the
--     interest level can't be required any more: it is often picked last.
-- =====================================================================

alter table hub.interactions add column minutes text
  check (minutes is null or char_length(minutes) <= 20000);

-- Replace the per-type rule (created unnamed in 0001): same rules, except a
-- conversation no longer needs an interest level, and only conversations have minutes.
do $$
declare c text;
begin
  select conname into c from pg_constraint
  where conrelid = 'hub.interactions'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%podcast_consent_signed IS NULL%';
  execute format('alter table hub.interactions drop constraint %I', c);
end $$;

alter table hub.interactions add constraint interactions_type_fields_check check (case type
  when 'conversation' then met_by is not null
       and podcast_topic is null and podcast_consent_signed is null and demo_name is null
  when 'podcast' then podcast_topic is not null and podcast_consent_signed is not null
       and met_by is null and problem_statement is null and domain_tags is null and interest_level is null
       and next_step is null and follow_up_owner is null and follow_up_date is null and demo_name is null and minutes is null
  when 'demo' then demo_name is not null
       and met_by is null and problem_statement is null and domain_tags is null and interest_level is null
       and next_step is null and follow_up_owner is null and follow_up_date is null
       and podcast_topic is null and podcast_consent_signed is null and minutes is null
  when 'other' then notes is not null and btrim(notes) <> ''
       and met_by is null and problem_statement is null and domain_tags is null and interest_level is null
       and next_step is null and follow_up_owner is null and follow_up_date is null
       and podcast_topic is null and podcast_consent_signed is null and demo_name is null and minutes is null
end);
