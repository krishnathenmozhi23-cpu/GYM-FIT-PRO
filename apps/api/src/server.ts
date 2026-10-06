import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { pool } from "./db/pool.js";
import { createApp } from "./app.js";

const server = createApp().listen(env.PORT, () => {
  logger.info({ port: env.PORT, aiProvider: env.AI_PROVIDER }, "GymFit Pro API listening");
});

function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down");
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
