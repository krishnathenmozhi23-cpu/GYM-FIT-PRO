import pg from "pg";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

// Return NUMERIC and BIGINT columns as JS numbers. Values in this schema are
// small (kg, cm, counts), so precision loss is not a concern.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));
// Keep DATE columns as plain YYYY-MM-DD strings (no timezone shifting).
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

export const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 10 });

pool.on("error", (err) => logger.error({ err }, "Unexpected PostgreSQL pool error"));

export type Queryable = pg.Pool | pg.PoolClient;

/** Run `fn` inside a transaction, rolling back on any error. */
export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
