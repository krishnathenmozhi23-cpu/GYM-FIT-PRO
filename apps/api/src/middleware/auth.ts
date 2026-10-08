import type { Request, RequestHandler } from "express";
import { unauthorized } from "../lib/errors.js";
import { pool } from "../db/pool.js";
import { verifyToken, AUTH_COOKIE } from "../modules/auth/tokens.js";

declare module "express-serve-static-core" {
  interface Request {
    userId?: string;
  }
}

/**
 * Accepts either `Authorization: Bearer <jwt>` (native/mobile clients) or the
 * httpOnly session cookie set by the web client.
 */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : (req.cookies?.[AUTH_COOKIE] as string | undefined);
  if (!token) return next(unauthorized());
  let claims: Awaited<ReturnType<typeof verifyToken>>;
  try {
    claims = await verifyToken(token);
  } catch {
    return next(unauthorized("Session expired or invalid"));
  }
  // Revocation check: password changes and "sign out everywhere" bump the version.
  const { rows } = await pool.query<{ session_version: number }>("SELECT session_version FROM users WHERE id = $1", [claims.userId]);
  if (!rows[0] || rows[0].session_version !== claims.sessionVersion) return next(unauthorized("Session expired or invalid"));
  req.userId = claims.userId;
  next();
};

export function currentUserId(req: Request): string {
  if (!req.userId) throw unauthorized();
  return req.userId;
}
