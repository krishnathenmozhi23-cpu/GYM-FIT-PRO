import { SignJWT, jwtVerify } from "jose";
import { env } from "../../config/env.js";

export const AUTH_COOKIE = "gymfit_session";
const secret = new TextEncoder().encode(env.JWT_SECRET);
const ISSUER = "gymfit-pro";

/**
 * Guest sessions are the only key to a guest's data, so they last a year and
 * are refreshed on every app load (sliding). Regular sessions use JWT_TTL_HOURS.
 */
export const GUEST_TTL_HOURS = 24 * 365;
export const ttlHours = (guest: boolean) => (guest ? GUEST_TTL_HOURS : env.JWT_TTL_HOURS);

/** `sv` = the user's session version at issue time (see users.session_version). */
export async function signToken(userId: string, sessionVersion: number, guest = false): Promise<string> {
  return new SignJWT({ sv: sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${ttlHours(guest)}h`)
    .sign(secret);
}

export async function verifyToken(token: string): Promise<{ userId: string; sessionVersion: number }> {
  const { payload } = await jwtVerify(token, secret, { issuer: ISSUER, algorithms: ["HS256"] });
  if (!payload.sub) throw new Error("Token has no subject");
  return { userId: payload.sub, sessionVersion: typeof payload.sv === "number" ? payload.sv : -1 };
}

export const cookieOptions = (guest = false) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: env.NODE_ENV === "production",
  maxAge: ttlHours(guest) * 3600 * 1000,
  path: "/",
});
