import type { Request, RequestHandler } from "express";
import { unauthorized } from "../lib/errors.js";
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
  try {
    req.userId = await verifyToken(token);
    next();
  } catch {
    next(unauthorized("Session expired or invalid"));
  }
};

export function currentUserId(req: Request): string {
  if (!req.userId) throw unauthorized();
  return req.userId;
}
