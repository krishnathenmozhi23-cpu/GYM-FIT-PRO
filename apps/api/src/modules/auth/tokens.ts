import { SignJWT, jwtVerify } from "jose";
import { env } from "../../config/env.js";

export const AUTH_COOKIE = "gymfit_session";
const secret = new TextEncoder().encode(env.JWT_SECRET);
const ISSUER = "gymfit-pro";

/** `sv` = the user's session version at issue time (see users.session_version). */
export async function signToken(userId: string, sessionVersion: number): Promise<string> {
  return new SignJWT({ sv: sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${env.JWT_TTL_HOURS}h`)
    .sign(secret);
}

export async function verifyToken(token: string): Promise<{ userId: string; sessionVersion: number }> {
  const { payload } = await jwtVerify(token, secret, { issuer: ISSUER, algorithms: ["HS256"] });
  if (!payload.sub) throw new Error("Token has no subject");
  return { userId: payload.sub, sessionVersion: typeof payload.sv === "number" ? payload.sv : -1 };
}

export const cookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: env.NODE_ENV === "production",
  maxAge: env.JWT_TTL_HOURS * 3600 * 1000,
  path: "/",
});
