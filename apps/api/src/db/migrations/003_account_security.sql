-- Email verification, password reset and session revocation.

ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMPTZ;
-- Bumped on password change/reset or "sign out everywhere"; JWTs carry the
-- version they were issued with and are rejected once it changes.
ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0;

-- Single-use tokens. Only a SHA-256 hash is stored, never the token itself.
CREATE TABLE auth_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     TEXT NOT NULL CHECK (purpose IN ('password_reset','email_verify')),
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX auth_tokens_user_purpose_idx ON auth_tokens (user_id, purpose, created_at DESC);
