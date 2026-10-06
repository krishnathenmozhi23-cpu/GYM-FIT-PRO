import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { loginSchema, registerSchema } from "@gymfit/shared";
import { env } from "../../config/env.js";
import { currentUserId, requireAuth } from "../../middleware/auth.js";
import { AUTH_COOKIE, cookieOptions } from "./tokens.js";
import * as auth from "./service.js";

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.NODE_ENV === "test" ? 1000 : 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: { code: "rate_limited", message: "Too many attempts, try again later" } },
});

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

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(AUTH_COOKIE, { ...cookieOptions(), maxAge: undefined });
  res.status(204).end();
});

authRouter.get("/me", requireAuth, async (req, res) => {
  res.json({ user: await auth.getAuthUser(currentUserId(req)) });
});
