import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { pool } from "./db/pool.js";
import { migrate } from "./db/migrate.js";
import { seedExercises } from "./db/seed.js";
import { createApp } from "./app.js";
import { deleteAbandonedGuests } from "./modules/auth/service.js";

async function main() {
  // Development: bring the database up to date automatically so a fresh
  // checkout works with just `npm run dev`. Production runs these explicitly.
  if (env.NODE_ENV === "development") {
    await migrate();
    await seedExercises();
  }
  // Housekeeping: remove abandoned guest sign-ups now and once a day.
  const sweep = () =>
    deleteAbandonedGuests()
      .then((n) => n && logger.info({ deleted: n }, "Removed abandoned guest accounts"))
      .catch((err) => logger.warn({ err }, "Guest cleanup failed"));
  void sweep();
  setInterval(sweep, 24 * 3600 * 1000).unref();

  const server = createApp().listen(env.PORT, () => {
    logger.info({ port: env.PORT, database: pool.driver, aiProvider: env.AI_PROVIDER }, "GymFit Pro API listening");
  });
  const shutdown = (signal: string) => {
    logger.info({ signal }, "Shutting down");
    server.close(() => {
      pool.end().finally(() => process.exit(0));
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  logger.fatal({ err }, "API failed to start");
  process.exit(1);
});
