import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync } from "node:fs";
import pg from "pg";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

/**
 * Minimal database interface used by the whole app. Two drivers implement it:
 *  - PostgreSQL via `pg` (production, and whenever DATABASE_URL is set)
 *  - PGlite: embedded PostgreSQL (WASM) for zero-setup local development
 *    when DATABASE_URL is not set. Never used in production.
 */
export interface QueryResult<R> {
  rows: R[];
  rowCount: number | null;
}

export interface Queryable {
  query<R = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<R>>;
}

export interface Database extends Queryable {
  readonly driver: "postgres" | "pglite";
  /** Runs `fn` with exclusive use of one connection (needed for transactions). */
  withConnection<T>(fn: (conn: Queryable) => Promise<T>): Promise<T>;
  end(): Promise<void>;
}

/* ---------------- PostgreSQL (pg) ---------------- */

// Return NUMERIC and BIGINT columns as JS numbers. Values in this schema are
// small (kg, cm, counts), so precision loss is not a concern.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));
// Keep DATE columns as plain YYYY-MM-DD strings (no timezone shifting).
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

function createPgDatabase(connectionString: string): Database {
  const p = new pg.Pool({ connectionString, max: 10 });
  p.on("error", (err) => logger.error({ err }, "Unexpected PostgreSQL pool error"));
  return {
    driver: "postgres",
    query: (sql, params) => p.query(sql, params as unknown[]) as never,
    async withConnection(fn) {
      const client = await p.connect();
      try {
        return await fn({ query: (sql, params) => client.query(sql, params as unknown[]) as never });
      } finally {
        client.release();
      }
    },
    end: () => p.end(),
  };
}

/* ---------------- PGlite (embedded, development only) ---------------- */

/**
 * PGlite is a single connection. Operations are serialised with a lock so
 * one request's queries never land inside another request's transaction.
 * Code running inside a transaction (tracked with AsyncLocalStorage) uses
 * the connection directly instead of waiting for its own lock.
 */
function createPgliteDatabase(dataDir: string): Database {
  type PGliteInstance = import("@electric-sql/pglite").PGlite;
  let instance: Promise<PGliteInstance> | null = null;
  const open = () =>
    (instance ??= import("@electric-sql/pglite").then(({ PGlite, types }) => {
      if (dataDir !== "memory://") mkdirSync(dataDir, { recursive: true });
      return new PGlite(dataDir, {
        parsers: {
          [types.NUMERIC]: (v: string) => Number(v),
          [types.DATE]: (v: string) => v,
        },
      });
    }));

  const holder = new AsyncLocalStorage<symbol>();
  let current: symbol | null = null;
  let queue: Promise<void> = Promise.resolve();

  async function acquire(): Promise<{ token: symbol; release: () => void }> {
    let release!: () => void;
    const prev = queue;
    queue = new Promise<void>((r) => (release = r));
    await prev;
    const token = Symbol("db-lock");
    current = token;
    return {
      token,
      release: () => {
        current = null;
        release();
      },
    };
  }

  async function run<R>(sql: string, params?: unknown[]): Promise<QueryResult<R>> {
    const db = await open();
    // Without parameters, use the simple protocol so multi-statement SQL (migrations) works.
    if (!params || params.length === 0) {
      const results = await db.exec(sql);
      const last = results.at(-1);
      return { rows: (last?.rows ?? []) as R[], rowCount: last?.affectedRows ?? last?.rows.length ?? 0 };
    }
    const res = await db.query<R>(sql, params);
    return { rows: res.rows, rowCount: res.affectedRows ?? res.rows.length };
  }

  return {
    driver: "pglite",
    async query<R>(sql: string, params?: unknown[]) {
      const store = holder.getStore();
      if (store && store === current) return run<R>(sql, params); // inside the lock holder's transaction
      const lock = await acquire();
      try {
        return await run<R>(sql, params);
      } finally {
        lock.release();
      }
    },
    async withConnection(fn) {
      const lock = await acquire();
      try {
        // Everything awaited inside `fn` (including code that calls pool.query
        // directly) runs on this connection, inside this lock.
        return await holder.run(lock.token, () => fn({ query: (sql, params) => run(sql, params) }));
      } finally {
        lock.release();
      }
    },
    async end() {
      if (instance) await (await instance).close();
      instance = null;
    },
  };
}

function createDatabase(): Database {
  if (env.DATABASE_URL) return createPgDatabase(env.DATABASE_URL);
  logger.warn({ dataDir: env.PGLITE_DIR }, "DATABASE_URL not set — using embedded PGlite (development only)");
  return createPgliteDatabase(env.PGLITE_DIR);
}

export const pool: Database = createDatabase();

/** Run `fn` inside a transaction, rolling back on any error. */
export function withTransaction<T>(fn: (client: Queryable) => Promise<T>): Promise<T> {
  return pool.withConnection(async (conn) => {
    await conn.query("BEGIN");
    try {
      const result = await fn(conn);
      await conn.query("COMMIT");
      return result;
    } catch (err) {
      await conn.query("ROLLBACK");
      throw err;
    }
  });
}
