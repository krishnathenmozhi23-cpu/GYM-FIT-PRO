-- GymFit Pro initial schema.
-- Conventions: UUID primary keys, timestamptz for instants, DATE for calendar
-- days, CHECK constraints mirror the shared Zod enums.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));

-- Current body weight is NOT stored here; it lives in progress_records so
-- there is a single source of truth for weight history.
CREATE TABLE user_profiles (
  user_id               UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  age                   SMALLINT NOT NULL CHECK (age BETWEEN 16 AND 100),
  gender                TEXT NOT NULL CHECK (gender IN ('male','female','non_binary','prefer_not_to_say')),
  height_cm             NUMERIC(5,1) NOT NULL CHECK (height_cm BETWEEN 120 AND 230),
  fitness_level         TEXT NOT NULL CHECK (fitness_level IN ('beginner','intermediate','advanced')),
  location              TEXT NOT NULL CHECK (location IN ('home','gym')),
  equipment             TEXT[] NOT NULL,
  days_per_week         SMALLINT NOT NULL CHECK (days_per_week BETWEEN 1 AND 6),
  session_minutes       SMALLINT NOT NULL CHECK (session_minutes BETWEEN 15 AND 120),
  preferred_time        TEXT NOT NULL CHECK (preferred_time IN ('morning','afternoon','evening','flexible')),
  limitations           TEXT[] NOT NULL DEFAULT '{}',
  limitation_notes      TEXT NOT NULL DEFAULT '',
  onboarding_completed  BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE fitness_goals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_type        TEXT NOT NULL CHECK (goal_type IN
                     ('weight_loss','muscle_gain','strength','endurance','general_fitness','body_recomposition')),
  target_weight_kg NUMERIC(5,1),
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at         TIMESTAMPTZ
);
-- At most one active goal per user.
CREATE UNIQUE INDEX fitness_goals_one_active ON fitness_goals (user_id) WHERE is_active;

CREATE TABLE exercises (
  id                 TEXT PRIMARY KEY,           -- stable slug, e.g. 'barbell-bench-press'
  name               TEXT NOT NULL,
  category           TEXT NOT NULL CHECK (category IN ('strength','cardio','core','mobility')),
  pattern            TEXT NOT NULL,
  mechanics          TEXT NOT NULL CHECK (mechanics IN ('compound','isolation')),
  primary_muscles    TEXT[] NOT NULL,
  secondary_muscles  TEXT[] NOT NULL DEFAULT '{}',
  equipment          TEXT[] NOT NULL,           -- ALL items required
  difficulty         TEXT NOT NULL CHECK (difficulty IN ('beginner','intermediate','advanced')),
  measure            TEXT NOT NULL CHECK (measure IN ('reps','time')),
  loaded             BOOLEAN NOT NULL,
  contraindications  TEXT[] NOT NULL DEFAULT '{}',
  instructions       TEXT[] NOT NULL,
  common_mistakes    TEXT[] NOT NULL,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX exercises_primary_muscles_idx ON exercises USING GIN (primary_muscles);
CREATE INDEX exercises_equipment_idx ON exercises USING GIN (equipment);
CREATE INDEX exercises_pattern_idx ON exercises (pattern);

CREATE TABLE ai_recommendations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind               TEXT NOT NULL CHECK (kind IN
                       ('workout_plan','daily_workout','adaptation','exercise_alternatives','insight','chat')),
  source             TEXT NOT NULL CHECK (source IN ('ai','rule_engine','dev_mock')),
  model              TEXT,
  input_context      JSONB NOT NULL,
  output             JSONB NOT NULL,
  validation_status  TEXT NOT NULL CHECK (validation_status IN ('valid','rejected','not_applicable')),
  validation_errors  JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_recommendations_user_kind_idx ON ai_recommendations (user_id, kind, created_at DESC);

CREATE TABLE workout_plans (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id             UUID REFERENCES fitness_goals(id) ON DELETE SET NULL,
  name                TEXT NOT NULL,
  split_type          TEXT NOT NULL,
  rationale           TEXT NOT NULL DEFAULT '',
  source              TEXT NOT NULL CHECK (source IN ('ai','rule_engine','dev_mock')),
  recommendation_id   UUID REFERENCES ai_recommendations(id) ON DELETE SET NULL,
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at         TIMESTAMPTZ
);
CREATE UNIQUE INDEX workout_plans_one_active ON workout_plans (user_id) WHERE status = 'active';

-- A template day inside a plan.
CREATE TABLE workouts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id            UUID NOT NULL REFERENCES workout_plans(id) ON DELETE CASCADE,
  position           SMALLINT NOT NULL,          -- rotation order
  day_of_week        SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  title              TEXT NOT NULL,
  focus              TEXT[] NOT NULL DEFAULT '{}',
  UNIQUE (plan_id, position)
);

CREATE TABLE workout_exercises (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id         UUID NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise_id        TEXT NOT NULL REFERENCES exercises(id),
  position           SMALLINT NOT NULL,
  sets               SMALLINT NOT NULL CHECK (sets BETWEEN 1 AND 6),
  reps_min           SMALLINT NOT NULL CHECK (reps_min BETWEEN 1 AND 30),
  reps_max           SMALLINT NOT NULL CHECK (reps_max BETWEEN 1 AND 30 AND reps_max >= reps_min),
  duration_seconds   SMALLINT CHECK (duration_seconds BETWEEN 10 AND 600),
  rest_seconds       SMALLINT NOT NULL CHECK (rest_seconds BETWEEN 15 AND 300),
  target_weight_kg   NUMERIC(6,2) CHECK (target_weight_kg >= 0),
  note               TEXT NOT NULL DEFAULT '',
  UNIQUE (workout_id, position)
);
CREATE INDEX workout_exercises_exercise_idx ON workout_exercises (exercise_id);

CREATE TABLE workout_sessions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workout_id         UUID REFERENCES workouts(id) ON DELETE SET NULL,
  title              TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed','abandoned')),
  started_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at       TIMESTAMPTZ,
  paused_at          TIMESTAMPTZ,
  paused_seconds     INTEGER NOT NULL DEFAULT 0,
  duration_seconds   INTEGER,
  difficulty_rating  SMALLINT CHECK (difficulty_rating BETWEEN 1 AND 5),
  feedback           TEXT NOT NULL DEFAULT ''
);
CREATE INDEX workout_sessions_user_started_idx ON workout_sessions (user_id, started_at DESC);
-- At most one in-progress session per user.
CREATE UNIQUE INDEX workout_sessions_one_active ON workout_sessions (user_id) WHERE status = 'in_progress';

-- Exercises performed within a session (snapshot of the prescription, so
-- history stays correct even if the plan later adapts).
CREATE TABLE session_exercises (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            UUID NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
  workout_exercise_id   UUID REFERENCES workout_exercises(id) ON DELETE SET NULL,
  exercise_id           TEXT NOT NULL REFERENCES exercises(id),
  replaced_from_id      TEXT REFERENCES exercises(id),
  position              SMALLINT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','skipped')),
  target_sets           SMALLINT NOT NULL,
  target_reps_min       SMALLINT NOT NULL,
  target_reps_max       SMALLINT NOT NULL,
  target_duration_seconds SMALLINT,
  target_rest_seconds   SMALLINT NOT NULL,
  target_weight_kg      NUMERIC(6,2),
  UNIQUE (session_id, position)
);
CREATE INDEX session_exercises_exercise_idx ON session_exercises (exercise_id);

CREATE TABLE exercise_sets (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_exercise_id  UUID NOT NULL REFERENCES session_exercises(id) ON DELETE CASCADE,
  set_number           SMALLINT NOT NULL,
  reps                 SMALLINT CHECK (reps BETWEEN 0 AND 100),
  weight_kg            NUMERIC(6,2) CHECK (weight_kg >= 0),
  duration_seconds     INTEGER CHECK (duration_seconds >= 0),
  completed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_exercise_id, set_number)
);

CREATE TABLE progress_records (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recorded_on   DATE NOT NULL,
  weight_kg     NUMERIC(5,1) NOT NULL CHECK (weight_kg BETWEEN 30 AND 300),
  body_fat_pct  NUMERIC(4,1) CHECK (body_fat_pct BETWEEN 2 AND 70),
  note          TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, recorded_on)
);

CREATE TABLE body_measurements (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recorded_on  DATE NOT NULL,
  chest_cm     NUMERIC(5,1),
  waist_cm     NUMERIC(5,1),
  hips_cm      NUMERIC(5,1),
  arm_cm       NUMERIC(5,1),
  thigh_cm     NUMERIC(5,1),
  neck_cm      NUMERIC(5,1),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, recorded_on)
);

CREATE TABLE ai_conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL DEFAULT 'Conversation',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_conversations_user_idx ON ai_conversations (user_id, updated_at DESC);

CREATE TABLE ai_messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role             TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content          TEXT NOT NULL,
  actions          JSONB NOT NULL DEFAULT '[]',
  safety_note      TEXT,
  source           TEXT CHECK (source IN ('ai','rule_engine','dev_mock')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_messages_conversation_idx ON ai_messages (conversation_id, created_at);
