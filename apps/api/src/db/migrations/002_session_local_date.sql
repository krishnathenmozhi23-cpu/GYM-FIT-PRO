-- The user's local calendar date for a session. Timestamps are UTC, so a
-- late-evening workout could otherwise land on the wrong day in weekly
-- schedules, streaks and charts.
ALTER TABLE workout_sessions ADD COLUMN performed_on DATE;
UPDATE workout_sessions SET performed_on = (started_at AT TIME ZONE 'UTC')::date WHERE performed_on IS NULL;
ALTER TABLE workout_sessions ALTER COLUMN performed_on SET NOT NULL;
CREATE INDEX workout_sessions_user_performed_idx ON workout_sessions (user_id, performed_on DESC) WHERE status = 'completed';
