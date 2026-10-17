-- =====================================================================
-- 0001 SCHEMA: all Booth Visitor Hub tables, in their own schema "hub".
--
-- Plain Postgres (16+). No Supabase-specific features: the same file runs
-- on Supabase today and on Postgres on EC2 later. The "hub" schema is not
-- exposed by Supabase's Data API, so these tables are reachable only
-- through the Hub's own server.
--
-- Security (roles, grants, row-level security) is in 0002.
-- Functions used by the server, the public form and game devices are in 0003.
-- =====================================================================

create schema if not exists hub;

-- ---------------------------------------------------------------------
-- Validation helpers shared by CHECK constraints
-- ---------------------------------------------------------------------

-- A plausible email address (full validation happens in the API).
create or replace function hub.is_email(v text) returns boolean
language sql immutable as $$
  select v ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(v) <= 254
$$;

-- Non-blank text of at most max_len characters.
create or replace function hub.is_text(v text, max_len int) returns boolean
language sql immutable as $$
  select char_length(btrim(v)) between 1 and max_len
$$;

-- One answer option, matching Pharma Ninja's validate.js exactly:
-- at most 28 characters and at most 4 words (whitespace-separated).
create or replace function hub.option_ok(o text) returns boolean
language sql immutable as $$
  select char_length(o) <= 28
     and char_length(btrim(o)) > 0
     and cardinality(regexp_split_to_array(btrim(o), '\s+')) <= 4
$$;

-- A question's option list: 4 or 5 valid options, no duplicates.
create or replace function hub.options_ok(opts text[]) returns boolean
language sql immutable as $$
  select cardinality(opts) between 4 and 5
     and array_position(opts, null) is null
     and (select bool_and(hub.option_ok(o)) from unnest(opts) as o)
     and (select count(distinct o) from unnest(opts) as o) = cardinality(opts)
$$;

-- ---------------------------------------------------------------------
-- Team: the people who can sign in (admin-managed list) and their sessions
-- ---------------------------------------------------------------------
create table hub.app_users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null check (email = lower(btrim(email)) and hub.is_email(email)),
  display_name  text not null check (hub.is_text(display_name, 80)),
  role          text not null check (role in ('admin', 'staff')),
  active        boolean not null default true,      -- false = removed; kept so "created by" stays readable
  password_hash text,                                -- scrypt; null = cannot sign in until a password is set
  created_at    timestamptz not null default now(),
  created_by    uuid references hub.app_users (id),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references hub.app_users (id)
);
create unique index app_users_email_key on hub.app_users (email);

-- Server-side sessions. The browser cookie holds a random token; only its SHA-256 is stored.
create table hub.sessions (
  token_hash   bytea primary key,
  user_id      uuid not null references hub.app_users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  last_seen_at timestamptz not null default now()
);
create index sessions_user_idx on hub.sessions (user_id);

-- ---------------------------------------------------------------------
-- Settings (one row) and consent notice versions
-- ---------------------------------------------------------------------
create table hub.consent_versions (
  version        int primary key,
  notice_text    text not null check (hub.is_text(notice_text, 3000)),
  marketing_text text not null check (hub.is_text(marketing_text, 1000)),
  created_at     timestamptz not null default now(),
  created_by     uuid references hub.app_users (id)
);

create table hub.settings (
  id              smallint primary key default 1 check (id = 1),
  badge_pattern   text not null,          -- regular expression applied to the trimmed, uppercased badge ID
  badge_hint      text not null,          -- shown under the badge field, e.g. "4–20 letters, digits or hyphens"
  consent_version int not null references hub.consent_versions (version),
  podcast_topics  text[] not null default '{}',
  demos           text[] not null default '{}',
  updated_at      timestamptz not null default now(),
  updated_by      uuid references hub.app_users (id)
);

-- ---------------------------------------------------------------------
-- Visitors: one row per organiser-issued badge ID
-- ---------------------------------------------------------------------
create table hub.visitors (
  badge_id          text primary key
                    check (badge_id = upper(btrim(badge_id)) and char_length(badge_id) between 1 and 64),
  full_name         text not null check (hub.is_text(full_name, 120)),
  company           text not null check (hub.is_text(company, 120)),
  job_title         text not null check (hub.is_text(job_title, 120)),
  email             text not null check (hub.is_email(email)),
  mobile            text check (mobile is null or hub.is_text(mobile, 32)),
  linkedin_url      text check (linkedin_url is null or hub.is_text(linkedin_url, 300)),
  consent_given     boolean not null check (consent_given),
  consent_version   int not null references hub.consent_versions (version),
  consent_at        timestamptz not null,
  marketing_opt_in  boolean not null default false,
  registration_mode text not null check (registration_mode in ('self', 'staff')),
  created_at        timestamptz not null default now(),
  created_by        uuid references hub.app_users (id),   -- null when the visitor registered themselves
  updated_at        timestamptz not null default now(),
  updated_by        uuid references hub.app_users (id),
  check ((registration_mode = 'self') = (created_by is null))
);
create index visitors_created_at_idx on hub.visitors (created_at);

-- ---------------------------------------------------------------------
-- Interactions: conversations, podcast guests, demos seen, other notes
-- One table; each type has its own columns, enforced by the CHECK below.
-- ---------------------------------------------------------------------
create table hub.interactions (
  id                     uuid primary key default gen_random_uuid(),
  badge_id               text not null references hub.visitors (badge_id) on update cascade on delete cascade,
  type                   text not null check (type in ('conversation', 'podcast', 'demo', 'other')),
  occurred_at            timestamptz not null default now(),
  notes                  text check (notes is null or char_length(notes) <= 4000),
  -- conversation
  met_by                 uuid references hub.app_users (id),
  problem_statement      text check (problem_statement is null or char_length(problem_statement) <= 4000),
  domain_tags            text[],
  interest_level         text check (interest_level in ('hot', 'warm', 'cold')),
  next_step              text check (next_step is null or char_length(next_step) <= 1000),
  follow_up_owner        uuid references hub.app_users (id),
  follow_up_date         date,
  -- podcast guest
  podcast_topic          text check (podcast_topic is null or hub.is_text(podcast_topic, 200)),
  podcast_consent_signed boolean,
  -- demo seen
  demo_name              text check (demo_name is null or hub.is_text(demo_name, 200)),
  -- audit
  created_at             timestamptz not null default now(),
  created_by             uuid not null references hub.app_users (id),
  updated_at             timestamptz not null default now(),
  updated_by             uuid references hub.app_users (id),
  check (case type
    when 'conversation' then met_by is not null and interest_level is not null
         and podcast_topic is null and podcast_consent_signed is null and demo_name is null
    when 'podcast' then podcast_topic is not null and podcast_consent_signed is not null
         and met_by is null and problem_statement is null and domain_tags is null and interest_level is null
         and next_step is null and follow_up_owner is null and follow_up_date is null and demo_name is null
    when 'demo' then demo_name is not null
         and met_by is null and problem_statement is null and domain_tags is null and interest_level is null
         and next_step is null and follow_up_owner is null and follow_up_date is null
         and podcast_topic is null and podcast_consent_signed is null
    when 'other' then notes is not null and btrim(notes) <> ''
         and met_by is null and problem_statement is null and domain_tags is null and interest_level is null
         and next_step is null and follow_up_owner is null and follow_up_date is null
         and podcast_topic is null and podcast_consent_signed is null and demo_name is null
  end)
);
create index interactions_badge_idx on hub.interactions (badge_id, occurred_at desc);
create index interactions_type_idx on hub.interactions (type, occurred_at);
create index interactions_created_by_idx on hub.interactions (created_by);

-- ---------------------------------------------------------------------
-- Game content: domains and questions (Pharma Ninja's data model)
-- ---------------------------------------------------------------------
create table hub.domains (
  id          text primary key check (id ~ '^[a-z0-9][a-z0-9-]{0,23}$'),
  name        text not null check (hub.is_text(name, 40)),
  description text not null check (hub.is_text(description, 80)),
  icon_key    text not null check (icon_key in ('clipboard', 'shield', 'factory', 'flask', 'chip', 'cloud', 'chart', 'globe')),
  accent      text not null check (accent ~ '^#[0-9A-Fa-f]{6}$'),
  enabled     boolean not null default true,
  sort_order  int not null default 0,        -- order of tiles in the game's domain picker
  created_at  timestamptz not null default now(),
  created_by  uuid references hub.app_users (id),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references hub.app_users (id)
);

create table hub.questions (
  id            text primary key check (id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$'),
  domain_id     text not null references hub.domains (id) on update cascade on delete restrict,
  question_text text not null check (hub.is_text(question_text, 120) and char_length(question_text) <= 120),
  options       text[] not null check (hub.options_ok(options)),
  correct_index smallint not null check (correct_index >= 0 and correct_index < cardinality(options)),
  difficulty    smallint not null check (difficulty between 1 and 3),
  explanation   text not null default '' check (char_length(explanation) <= 1000),
  source        text not null default '' check (char_length(source) <= 200),
  enabled       boolean not null default true,
  created_at    timestamptz not null default now(),
  created_by    uuid references hub.app_users (id),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references hub.app_users (id)
);
create index questions_domain_idx on hub.questions (domain_id);

-- ---------------------------------------------------------------------
-- Game devices and the rounds / plays they sync
-- ---------------------------------------------------------------------
create table hub.device_keys (
  id           uuid primary key default gen_random_uuid(),
  label        text not null check (hub.is_text(label, 60)),
  key_hash     bytea not null unique,          -- SHA-256 of the key; the key itself is shown once and never stored
  key_prefix   text not null,                  -- first characters, so admins can tell keys apart
  created_at   timestamptz not null default now(),
  created_by   uuid not null references hub.app_users (id),
  last_used_at timestamptz,
  revoked_at   timestamptz,
  revoked_by   uuid references hub.app_users (id)
);

-- badge_id has no foreign key on purpose: players may type a badge that is not
-- (yet) registered. Matching to visitors happens at read time.
create table hub.game_rounds (
  round_id        text primary key check (round_id ~ '^[A-Za-z0-9_-]{6,64}$'),
  device_key_id   uuid references hub.device_keys (id) on delete set null,   -- the device that created the record
  badge_id        text check (badge_id is null or (badge_id = upper(btrim(badge_id)) and char_length(badge_id) between 1 and 64)),
  badge_confirmed boolean not null default false,
  display_name    text not null check (char_length(display_name) between 1 and 40),
  domain_id       text not null check (char_length(domain_id) between 1 and 40),
  score           int not null check (score >= 0),
  questions       int not null check (questions >= 0),
  correct         int not null check (correct >= 0),
  longest_streak  int not null check (longest_streak >= 0),
  end_reason      text not null check (end_reason in ('time', 'lives', 'cleared')),
  played_at       timestamptz not null,       -- device clock
  play_date       date not null,              -- Asia/Kolkata calendar date, as computed by the game
  received_at     timestamptz not null default now()
);
create index game_rounds_badge_idx on hub.game_rounds (badge_id);
create index game_rounds_played_idx on hub.game_rounds (played_at);

create table hub.game_plays (
  round_id      text not null references hub.game_rounds (round_id) on delete cascade,
  seq           smallint not null check (seq >= 0),
  played_at     timestamptz not null,
  question_id   text not null check (char_length(question_id) between 1 and 40),
  question_text text,                         -- copied at sync time so exports stay readable after questions are deleted
  result        text not null check (result in ('correct', 'wrong', 'missed')),
  ms_to_slice   int check (ms_to_slice is null or ms_to_slice >= 0),
  primary key (round_id, seq)
);

-- ---------------------------------------------------------------------
-- Rate limiting (fixed windows). IPs are stored only as keyed hashes.
-- ---------------------------------------------------------------------
create table hub.rate_limits (
  bucket       text not null,
  window_start timestamptz not null,
  hits         int not null default 0,
  primary key (bucket, window_start)
);
