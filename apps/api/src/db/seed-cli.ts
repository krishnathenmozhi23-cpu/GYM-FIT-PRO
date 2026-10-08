// CLI: upsert the exercise library (`npm run db:seed`, or `node dist/seed-cli.js` in production).
import { logger } from "../lib/logger.js";
import { pool } from "./pool.js";
import { seedExercises } from "./seed.js";

seedExercises()
  .then((n) => {
    logger.info({ count: n }, "Seeded exercises");
    return pool.end();
  })
  .catch((err) => {
    logger.error({ err }, "Seeding failed");
    process.exit(1);
  });
