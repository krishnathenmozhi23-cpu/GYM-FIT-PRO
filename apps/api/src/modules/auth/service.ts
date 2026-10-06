import type { AuthUser, LoginInput, RegisterInput } from "@gymfit/shared";
import { pool } from "../../db/pool.js";
import { conflict, unauthorized } from "../../lib/errors.js";
import { hashPassword, verifyPassword } from "./password.js";
import { signToken } from "./tokens.js";

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  onboarding_completed: boolean | null;
}

const USER_SELECT = `
  SELECT u.id, u.email, u.password_hash, p.onboarding_completed
  FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id`;

const toAuthUser = (r: UserRow): AuthUser => ({
  id: r.id,
  email: r.email,
  onboardingCompleted: r.onboarding_completed ?? false,
});

export async function register(input: RegisterInput): Promise<{ user: AuthUser; token: string }> {
  const passwordHash = await hashPassword(input.password);
  try {
    const { rows } = await pool.query<{ id: string; email: string }>(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
      [input.email, passwordHash],
    );
    const row = rows[0]!;
    return { user: { id: row.id, email: row.email, onboardingCompleted: false }, token: await signToken(row.id) };
  } catch (err) {
    if ((err as { code?: string }).code === "23505") throw conflict("An account with this email already exists");
    throw err;
  }
}

export async function login(input: LoginInput): Promise<{ user: AuthUser; token: string }> {
  const { rows } = await pool.query<UserRow>(`${USER_SELECT} WHERE lower(u.email) = $1`, [input.email]);
  const row = rows[0];
  // Same error for unknown email and wrong password to avoid account enumeration.
  if (!row || !(await verifyPassword(input.password, row.password_hash))) {
    throw unauthorized("Invalid email or password");
  }
  return { user: toAuthUser(row), token: await signToken(row.id) };
}

export async function getAuthUser(userId: string): Promise<AuthUser> {
  const { rows } = await pool.query<UserRow>(`${USER_SELECT} WHERE u.id = $1`, [userId]);
  if (!rows[0]) throw unauthorized("Account no longer exists");
  return toAuthUser(rows[0]);
}
