import express from "express";
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

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(",").map((o) => o.trim()),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  if (env.NODE_ENV !== "test") app.use(pinoHttp({ logger }));

  app.get("/health", async (_req, res) => {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  });

  app.use("/auth", authRouter);
  app.use("/profile", requireAuth, profileRouter);
  app.use("/exercises", requireAuth, exercisesRouter);
  app.use("/workouts", requireAuth, workoutsRouter);
  app.use("/workout-session", requireAuth, sessionsRouter);
  app.use("/progress", requireAuth, progressRouter);
  app.use("/ai", requireAuth, aiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
