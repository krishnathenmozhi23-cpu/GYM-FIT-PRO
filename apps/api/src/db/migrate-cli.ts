// CLI: apply pending migrations (`npm run db:migrate`, or `node dist/migrate-cli.js` in production).
import { logger } from "../lib/logger.js";
import { pool } from "./pool.js";
import { migrate } from "./migrate.js";

migrate()
  .then((applied) => {
    logger.info({ count: applied.length }, "Migrations complete");
    return pool.end();
  })
  .catch((err) => {
    logger.error({ err }, "Migration failed");
    process.exit(1);
  });
