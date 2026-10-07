import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import {
  changePasswordSchema,
  claimAccountSchema,
  deleteAccountSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "@gymfit/shared";
import { env } from "../../config/env.js";
import { currentUserId, requireAuth } from "../../middleware/auth.js";
import { AUTH_COOKIE, cookieOptions } from "./tokens.js";
import * as auth from "./service.js";

export const authRouter = Router();

const limiter = (limit: number) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: env.NODE_ENV === "test" ? 1000 : limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: { code: "rate_limited", message: "Too many attempts, try again later" } },
  });
const authLimiter = limiter(20);
const guestLimiter = limiter(10);
const emailLimiter = limiter(5);
const clearCookie = (res: import("express").Response) => res.clearCookie(AUTH_COOKIE, { ...cookieOptions(), maxAge: undefined });

authRouter.post("/register", authLimiter, async (req, res) => {
  const { user, token } = await auth.register(registerSchema.parse(req.body));
  res.cookie(AUTH_COOKIE, token, cookieOptions());
  res.status(201).json({ user, token });
});

authRouter.post("/login", authLimiter, async (req, res) => {
  const { user, token } = await auth.login(loginSchema.parse(req.body));
  res.cookie(AUTH_COOKIE, token, cookieOptions());
  res.json({ user, token });
});

/** Start without an email or password. */
authRouter.post("/guest", guestLimiter, async (_req, res) => {
  const { user, token } = await auth.createGuest();
  res.cookie(AUTH_COOKIE, token, cookieOptions(true));
  res.status(201).json({ user, token });
});

/** Turn a guest account into a regular one by adding email + password. */
authRouter.post("/claim", requireAuth, authLimiter, async (req, res) => {
  const { email, password } = claimAccountSchema.parse(req.body);
  const { user, token } = await auth.claimAccount(currentUserId(req), email, password);
  res.cookie(AUTH_COOKIE, token, cookieOptions());
  res.json({ user, token });
});

authRouter.post("/logout", (_req, res) => {
  clearCookie(res);
  res.status(204).end();
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const { user, refreshedToken } = await auth.getAuthUser(currentUserId(req));
  // Guests: slide the session forward so an active guest never loses their data.
  // Only for cookie sessions; native clients manage their own bearer token.
  if (refreshedToken && !req.headers.authorization) res.cookie(AUTH_COOKIE, refreshedToken, cookieOptions(true));
  res.json({ user });
});

/* Password reset (unauthenticated) */
authRouter.post("/forgot-password", emailLimiter, async (req, res) => {
  await auth.requestPasswordReset(forgotPasswordSchema.parse(req.body).email);
  res.status(204).end();
});

authRouter.post("/reset-password", authLimiter, async (req, res) => {
  const { token, password } = resetPasswordSchema.parse(req.body);
  await auth.resetPassword(token, password);
  clearCookie(res);
  res.status(204).end();
});

/* Email verification */
authRouter.post("/verify-email", authLimiter, async (req, res) => {
  await auth.verifyEmail(verifyEmailSchema.parse(req.body).token);
  res.status(204).end();
});

authRouter.post("/verify-email/resend", requireAuth, emailLimiter, async (req, res) => {
  await auth.sendVerificationEmail(currentUserId(req));
  res.status(204).end();
});

/* Signed-in account management */
authRouter.post("/change-password", requireAuth, authLimiter, async (req, res) => {
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
  const token = await auth.changePassword(currentUserId(req), currentPassword, newPassword);
  res.cookie(AUTH_COOKIE, token, cookieOptions());
  res.json({ token });
});

authRouter.post("/sign-out-everywhere", requireAuth, async (req, res) => {
  await auth.signOutEverywhere(currentUserId(req));
  clearCookie(res);
  res.status(204).end();
});

authRouter.get("/export", requireAuth, async (req, res) => {
  res.setHeader("Content-Disposition", 'attachment; filename="gymfit-pro-data.json"');
  res.json(await auth.exportAccountData(currentUserId(req)));
});

authRouter.post("/delete-account", requireAuth, authLimiter, async (req, res) => {
  await auth.deleteAccount(currentUserId(req), deleteAccountSchema.parse(req.body).password);
  clearCookie(res);
  res.status(204).end();
});
