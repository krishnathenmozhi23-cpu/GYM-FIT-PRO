import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool, withTransaction } from "./pool.js";
import { logger } from "../lib/logger.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(here, "migrations");

/** Applies pending `*.sql` migrations in filename order, each in a transaction. */
export async function migrate(): Promise<string[]> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  const { rows } = await pool.query<{ name: string }>("SELECT name FROM schema_migrations");
  const applied = new Set(rows.map((r) => r.name));
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  const newlyApplied: string[] = [];

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
    try {
      await withTransaction(async (db) => {
        await db.query(sql);
        await db.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      });
    } catch (err) {
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
    }
    newlyApplied.push(file);
    logger.info({ file }, "Applied migration");
  }
  return newlyApplied;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  migrate()
    .then((applied) => {
      logger.info({ count: applied.length }, "Migrations complete");
      return pool.end();
    })
    .catch((err) => {
      logger.error({ err }, "Migration failed");
      process.exit(1);
    });
}
