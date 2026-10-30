-- =====================================================================
-- 0010 LONGER QUESTIONS AND ANSWERS (approved 2026-10-30)
--
-- Matches the game's rules since the real question bank: no word limit on an
-- answer option, options up to 100 characters (the pill wraps them onto up to
-- three lines), question text up to 170 characters. Existing rows already meet
-- the looser rules.
-- =====================================================================

-- One answer option: not blank, at most 100 characters.
create or replace function hub.option_ok(o text) returns boolean
language sql immutable as $$
  select char_length(o) <= 100
     and char_length(btrim(o)) > 0
$$;

alter table hub.questions drop constraint questions_question_text_check;
alter table hub.questions add constraint questions_question_text_check
  check (hub.is_text(question_text, 170) and char_length(question_text) <= 170);
