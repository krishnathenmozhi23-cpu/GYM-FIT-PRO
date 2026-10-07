-- Guest accounts: users can start without an email or password and add them
-- later ("claim" the account). Multiple NULL emails are allowed by the
-- existing unique index on lower(email).
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_email_password_together
  CHECK ((email IS NULL) = (password_hash IS NULL));
-- Used to clean up abandoned guest accounts.
ALTER TABLE users ADD COLUMN last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now();
