import { createHash, randomBytes } from "node:crypto";
import type { AuthUser, LoginInput, RegisterInput } from "@gymfit/shared";
import { env } from "../../config/env.js";
import { pool, withTransaction, type Queryable } from "../../db/pool.js";
import { AppError, badRequest, conflict, unauthorized } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { getMailer } from "../../lib/mailer.js";
import { hashPassword, verifyPassword } from "./password.js";
import { signToken } from "./tokens.js";

interface UserRow {
  id: string;
  email: string | null;
  password_hash: string | null;
  session_version: number;
  email_verified_at: Date | null;
  onboarding_completed: boolean | null;
}

const USER_SELECT = `
  SELECT u.id, u.email, u.password_hash, u.session_version, u.email_verified_at, p.onboarding_completed
  FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id`;

const toAuthUser = (r: UserRow): AuthUser => ({
  id: r.id,
  email: r.email,
  isGuest: r.email === null,
  emailVerified: r.email_verified_at !== null,
  onboardingCompleted: r.onboarding_completed ?? false,
});

async function loadUser(userId: string, db: Queryable = pool): Promise<UserRow> {
  const { rows } = await db.query<UserRow>(`${USER_SELECT} WHERE u.id = $1`, [userId]);
  if (!rows[0]) throw unauthorized("Account no longer exists");
  return rows[0];
}

/* ---------------- one-time tokens ---------------- */

type TokenPurpose = "password_reset" | "email_verify";
const TOKEN_TTL_MINUTES: Record<TokenPurpose, number> = { password_reset: 60, email_verify: 24 * 60 };
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Creates a single-use token; only its hash is stored. Older unused tokens of the same purpose are revoked. */
async function issueToken(db: Queryable, userId: string, purpose: TokenPurpose): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  await db.query("UPDATE auth_tokens SET used_at = now() WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL", [userId, purpose]);
  await db.query(
    `INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at) VALUES ($1, $2, $3, now() + make_interval(mins => $4))`,
    [userId, purpose, sha256(raw), TOKEN_TTL_MINUTES[purpose]],
  );
  return raw;
}

async function consumeToken(db: Queryable, purpose: TokenPurpose, raw: string): Promise<string> {
  const { rows } = await db.query<{ user_id: string }>(
    `UPDATE auth_tokens SET used_at = now()
     WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > now()
     RETURNING user_id`,
    [sha256(raw), purpose],
  );
  if (!rows[0]) throw badRequest("This link is invalid or has expired. Request a new one.");
  return rows[0].user_id;
}

function requireMail() {
  const mailer = getMailer();
  if (!mailer.enabled) throw new AppError(503, "email_unavailable", "Email isn't configured on this server yet.");
  return mailer;
}

/* ---------------- registration & login ---------------- */

export async function register(input: RegisterInput): Promise<{ user: AuthUser; token: string }> {
  const passwordHash = await hashPassword(input.password);
  let row: UserRow;
  try {
    const { rows } = await pool.query<{ id: string }>(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id",
      [input.email, passwordHash],
    );
    row = await loadUser(rows[0]!.id);
  } catch (err) {
    if ((err as { code?: string }).code === "23505") throw conflict("An account with this email already exists");
    throw err;
  }
  // Verification email is best-effort: the account works while unverified.
  if (getMailer().enabled) {
    await sendVerificationEmail(row.id).catch((err) => logger.warn({ err }, "Could not send verification email"));
  }
  return { user: toAuthUser(row), token: await signToken(row.id, row.session_version) };
}

// Verified against when the email doesn't exist, so response time doesn't reveal registered accounts.
const dummyHash = hashPassword("timing-equalisation-dummy-password");

export async function login(input: LoginInput): Promise<{ user: AuthUser; token: string }> {
  const { rows } = await pool.query<UserRow>(`${USER_SELECT} WHERE lower(u.email) = $1`, [input.email]);
  const row = rows[0];
  const valid = await verifyPassword(input.password, row?.password_hash ?? (await dummyHash));
  // (guest rows have no email, so they never match a login lookup)
  // Same error for unknown email and wrong password to avoid account enumeration.
  if (!row || !valid) {
    throw unauthorized("Invalid email or password");
  }
  return { user: toAuthUser(row), token: await signToken(row.id, row.session_version) };
}

/** Starts an account with no email or password. */
export async function createGuest(): Promise<{ user: AuthUser; token: string }> {
  const { rows } = await pool.query<{ id: string }>("INSERT INTO users DEFAULT VALUES RETURNING id");
  const row = await loadUser(rows[0]!.id);
  return { user: toAuthUser(row), token: await signToken(row.id, row.session_version, true) };
}

/** Adds an email + password to a guest account, keeping all its data. */
export async function claimAccount(userId: string, email: string, password: string): Promise<{ user: AuthUser; token: string }> {
  const user = await loadUser(userId);
  if (user.email !== null) throw conflict("This account already has an email and password");
  const passwordHash = await hashPassword(password);
  try {
    await pool.query("UPDATE users SET email = $2, password_hash = $3, updated_at = now() WHERE id = $1", [userId, email, passwordHash]);
  } catch (err) {
    if ((err as { code?: string }).code === "23505") throw conflict("An account with this email already exists — log in to it instead");
    throw err;
  }
  if (getMailer().enabled) {
    await sendVerificationEmail(userId).catch((err) => logger.warn({ err }, "Could not send verification email"));
  }
  const row = await loadUser(userId);
  return { user: toAuthUser(row), token: await signToken(row.id, row.session_version) };
}

/** Current user; also records activity and, for guests, issues a refreshed (sliding) session. */
export async function getAuthUser(userId: string): Promise<{ user: AuthUser; refreshedToken: string | null }> {
  const row = await loadUser(userId);
  await pool.query("UPDATE users SET last_seen_at = now() WHERE id = $1 AND last_seen_at < now() - interval '1 hour'", [userId]);
  const user = toAuthUser(row);
  return { user, refreshedToken: user.isGuest ? await signToken(row.id, row.session_version, true) : null };
}

/**
 * Removes guest accounts that never finished onboarding and have been
 * inactive for `days`. Guests with a profile are kept: their session is the
 * only way back to their data and it may simply be a quiet month.
 */
export async function deleteAbandonedGuests(days = 7): Promise<number> {
  const { rowCount } = await pool.query(
    `DELETE FROM users u WHERE u.email IS NULL AND u.last_seen_at < now() - make_interval(days => $1)
       AND NOT EXISTS (SELECT 1 FROM user_profiles p WHERE p.user_id = u.id AND p.onboarding_completed)`,
    [days],
  );
  return rowCount ?? 0;
}

/* ---------------- password reset ---------------- */

/** Always succeeds for unknown emails too, so it can't be used to probe accounts. */
export async function requestPasswordReset(email: string): Promise<void> {
  const mailer = requireMail();
  const { rows } = await pool.query<{ id: string; email: string }>("SELECT id, email FROM users WHERE lower(email) = $1", [email]);
  const user = rows[0];
  if (!user) return;
  const token = await issueToken(pool, user.id, "password_reset");
  await mailer.send({
    to: user.email,
    subject: "Reset your GymFit Pro password",
    text: `Someone asked to reset the password for this GymFit Pro account.\n\nReset it here (valid for 60 minutes):\n${env.APP_URL}/reset-password?token=${token}\n\nIf this wasn't you, you can ignore this email — your password won't change.`,
  });
}

/** Sets a new password, signs out every existing session, and confirms the email (inbox ownership proven). */
export async function resetPassword(rawToken: string, password: string): Promise<void> {
  const passwordHash = await hashPassword(password);
  await withTransaction(async (db) => {
    const userId = await consumeToken(db, "password_reset", rawToken);
    await db.query(
      `UPDATE users SET password_hash = $2, session_version = session_version + 1,
         email_verified_at = coalesce(email_verified_at, now()), updated_at = now() WHERE id = $1`,
      [userId, passwordHash],
    );
  });
}

/* ---------------- email verification ---------------- */

export async function sendVerificationEmail(userId: string): Promise<void> {
  const mailer = requireMail();
  const user = await loadUser(userId);
  if (user.email === null) throw badRequest("Add an email to your account first");
  if (user.email_verified_at) return;
  const token = await issueToken(pool, userId, "email_verify");
  await mailer.send({
    to: user.email,
    subject: "Confirm your email for GymFit Pro",
    text: `Confirm your email address (link valid for 24 hours):\n${env.APP_URL}/verify-email?token=${token}`,
  });
}

export async function verifyEmail(rawToken: string): Promise<void> {
  await withTransaction(async (db) => {
    const userId = await consumeToken(db, "email_verify", rawToken);
    await db.query("UPDATE users SET email_verified_at = coalesce(email_verified_at, now()) WHERE id = $1", [userId]);
  });
}

/* ---------------- signed-in account management ---------------- */

async function assertPassword(user: UserRow, password: string | undefined) {
  if (user.password_hash === null) throw badRequest("This account doesn't have a password yet — add an email and password first");
  if (!password || !(await verifyPassword(password, user.password_hash))) {
    throw new AppError(403, "wrong_password", "Current password is incorrect");
  }
}

/** Changes the password, revokes all other sessions and returns a fresh token for this one. */
export async function changePassword(userId: string, current: string, next: string): Promise<string> {
  const user = await loadUser(userId);
  await assertPassword(user, current);
  if (current === next) throw badRequest("Choose a password different from your current one");
  const hash = await hashPassword(next);
  const { rows } = await pool.query<{ session_version: number }>(
    "UPDATE users SET password_hash = $2, session_version = session_version + 1, updated_at = now() WHERE id = $1 RETURNING session_version",
    [userId, hash],
  );
  return signToken(userId, rows[0]!.session_version);
}

export async function signOutEverywhere(userId: string): Promise<void> {
  await pool.query("UPDATE users SET session_version = session_version + 1 WHERE id = $1", [userId]);
}

/** Permanently deletes the account; every user-owned row cascades. Guests have no password to confirm. */
export async function deleteAccount(userId: string, password: string | undefined): Promise<void> {
  const user = await loadUser(userId);
  if (user.password_hash !== null) await assertPassword(user, password);
  await pool.query("DELETE FROM users WHERE id = $1", [userId]);
}

/** Everything stored about the user, as plain JSON (data portability). */
export async function exportAccountData(userId: string): Promise<Record<string, unknown>> {
  const q = async (sql: string) => (await pool.query(sql, [userId])).rows;
  const [account] = await q("SELECT id, email, email_verified_at, created_at FROM users WHERE id = $1");
  return {
    exportedAt: new Date().toISOString(),
    account,
    profile: (await q("SELECT * FROM user_profiles WHERE user_id = $1"))[0] ?? null,
    goals: await q("SELECT * FROM fitness_goals WHERE user_id = $1 ORDER BY created_at"),
    weightRecords: await q("SELECT recorded_on, weight_kg, body_fat_pct, note FROM progress_records WHERE user_id = $1 ORDER BY recorded_on"),
    bodyMeasurements: await q("SELECT recorded_on, chest_cm, waist_cm, hips_cm, arm_cm, thigh_cm, neck_cm FROM body_measurements WHERE user_id = $1 ORDER BY recorded_on"),
    plans: await q(`
      SELECT p.id, p.name, p.split_type, p.source, p.status, p.created_at,
        (SELECT json_agg(json_build_object('title', w.title, 'dayOfWeek', w.day_of_week,
           'exercises', (SELECT json_agg(json_build_object('exerciseId', we.exercise_id, 'sets', we.sets, 'repsMin', we.reps_min,
              'repsMax', we.reps_max, 'durationSeconds', we.duration_seconds, 'restSeconds', we.rest_seconds,
              'targetWeightKg', we.target_weight_kg) ORDER BY we.position) FROM workout_exercises we WHERE we.workout_id = w.id))
           ORDER BY w.position) FROM workouts w WHERE w.plan_id = p.id) AS workouts
      FROM workout_plans p WHERE p.user_id = $1 ORDER BY p.created_at`),
    sessions: await q(`
      SELECT ws.id, ws.title, ws.status, ws.performed_on, ws.started_at, ws.completed_at, ws.duration_seconds,
             ws.difficulty_rating, ws.feedback,
        (SELECT json_agg(json_build_object('exerciseId', se.exercise_id, 'status', se.status,
           'sets', (SELECT json_agg(json_build_object('reps', es.reps, 'weightKg', es.weight_kg, 'durationSeconds', es.duration_seconds)
                    ORDER BY es.set_number) FROM exercise_sets es WHERE es.session_exercise_id = se.id)) ORDER BY se.position)
         FROM session_exercises se WHERE se.session_id = ws.id) AS exercises
      FROM workout_sessions ws WHERE ws.user_id = $1 ORDER BY ws.started_at`),
    conversations: await q(`
      SELECT c.id, c.title, c.created_at,
        (SELECT json_agg(json_build_object('role', m.role, 'content', m.content, 'createdAt', m.created_at) ORDER BY m.created_at)
         FROM ai_messages m WHERE m.conversation_id = c.id) AS messages
      FROM ai_conversations c WHERE c.user_id = $1 ORDER BY c.created_at`),
    aiRecommendations: await q("SELECT kind, source, model, validation_status, created_at FROM ai_recommendations WHERE user_id = $1 ORDER BY created_at"),
  };
}
