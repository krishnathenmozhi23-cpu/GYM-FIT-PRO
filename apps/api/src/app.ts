import path from "node:path";
import express, { Router } from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { pinoHttp } from "pino-http";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { pool } from "./db/pool.js";
import { requireAuth } from "./middleware/auth.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { authRouter } from "./modules/auth/routes.js";
import { profileRouter } from "./modules/profile/routes.js";
import { exercisesRouter } from "./modules/exercises/routes.js";
import { workoutsRouter } from "./modules/workouts/routes.js";
import { sessionsRouter } from "./modules/sessions/routes.js";
import { progressRouter } from "./modules/progress/routes.js";
import { aiRouter } from "./ai/routes.js";
import { getDevOutbox } from "./lib/mailer.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // On-device pose detection compiles WebAssembly.
          scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
          // Pose model fallback when it wasn't self-hosted at build time.
          connectSrc: ["'self'", "https://storage.googleapis.com"],
          // Reviewed demonstration videos (privacy-enhanced YouTube embeds).
          frameSrc: ["https://www.youtube-nocookie.com"],
          mediaSrc: ["'self'", "blob:", "https:"],
          imgSrc: ["'self'", "data:", "blob:"],
        },
      },
    }),
  );
  // The camera is used only by our own pages (form check); never by embeds.
  app.use((_req, res, next) => {
    res.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
    next();
  });
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(",").map((o) => o.trim()),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  if (env.NODE_ENV !== "test") app.use(pinoHttp({ logger }));

  const api = Router();
  api.get("/health", async (_req, res) => {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  });
  api.use("/auth", authRouter);
  api.use("/profile", requireAuth, profileRouter);
  api.use("/exercises", requireAuth, exercisesRouter);
  api.use("/workouts", requireAuth, workoutsRouter);
  api.use("/workout-session", requireAuth, sessionsRouter);
  api.use("/progress", requireAuth, progressRouter);
  api.use("/ai", requireAuth, aiRouter);
  // Local development only: read emails the console mailer "sent" (used by e2e tests).
  if (env.NODE_ENV === "development" && getDevOutbox()) {
    api.get("/dev/mail", (req, res) => {
      const to = String(req.query.to ?? "").toLowerCase();
      res.json({ emails: getDevOutbox()!.filter((e) => !to || e.to.toLowerCase() === to) });
    });
  }
  api.use(notFoundHandler);
  app.use(env.API_PREFIX || "/", api);

  // Production: serve the web build with SPA fallback (only when an API prefix separates the two).
  if (env.WEB_DIST_DIR && env.API_PREFIX) {
    const dist = path.resolve(env.WEB_DIST_DIR);
    app.use(express.static(dist, { index: false, maxAge: "1h", immutable: false }));
    app.use("/assets", express.static(path.join(dist, "assets"), { immutable: true, maxAge: "1y" }));
    const prefix = env.API_PREFIX;
    app.get(/.*/, (req, res, next) =>
      req.path === prefix || req.path.startsWith(`${prefix}/`) ? next() : res.sendFile(path.join(dist, "index.html")),
    );
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
