-- Reference videos and camera form checks.

ALTER TABLE exercises ADD COLUMN video_url TEXT;

-- One row per camera-checked set. Only metrics are stored: the video is
-- processed on the user's device and never uploaded.
CREATE TABLE form_checks (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_exercise_id  UUID NOT NULL REFERENCES session_exercises(id) ON DELETE CASCADE,
  exercise_id          TEXT NOT NULL REFERENCES exercises(id),
  profile              TEXT NOT NULL,
  reps                 SMALLINT NOT NULL CHECK (reps >= 0),
  clean_reps           SMALLINT NOT NULL CHECK (clean_reps >= 0 AND clean_reps <= reps),
  duration_seconds     INTEGER NOT NULL CHECK (duration_seconds >= 0),
  issues               JSONB NOT NULL DEFAULT '[]',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX form_checks_user_idx ON form_checks (user_id, created_at DESC);
CREATE INDEX form_checks_session_exercise_idx ON form_checks (session_exercise_id);
