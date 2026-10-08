import "dotenv/config";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

/** apps/api/.data — local, git-ignored storage for development only. */
const DEV_DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.data");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  /** PostgreSQL connection string. Optional in development (embedded PGlite is used instead). */
  DATABASE_URL: z.string().optional().transform((v) => v || undefined),
  /** Where embedded PGlite stores data when DATABASE_URL is not set ("memory://" for in-memory). */
  PGLITE_DIR: z.string().default(path.join(DEV_DATA_DIR, "pglite")),
  /** Optional in development: a random secret is generated and kept in apps/api/.data. */
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters").optional(),
  JWT_TTL_HOURS: z.coerce.number().int().positive().default(24 * 7),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  /**
   * `anthropic` — call Claude through the official SDK (needs ANTHROPIC_API_KEY
   *               or another credential source the SDK understands).
   * `mock`      — development mock provider; responses are marked `dev_mock`.
   * `none`      — no LLM; the deterministic rule engine answers everything.
   */
  AI_PROVIDER: z.enum(["anthropic", "mock", "none"]).default("none"),
  AI_MODEL: z.string().default("claude-opus-5-5"),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  /** Public URL of the web app, used in emailed links. */
  APP_URL: z.string().url().default("http://localhost:5173"),
  /**
   * `console`  — DEVELOPMENT ONLY: prints emails (with links) to the log.
   * `disabled` — no email; reset/verification endpoints return 503.
   * Production needs a real provider implemented in lib/mailer.ts.
   */
  MAIL_PROVIDER: z.enum(["console", "disabled"]).optional(),
  /** Path prefix for API routes. Use "/api" when the API also serves the web build. */
  API_PREFIX: z.string().regex(/^(\/[a-z0-9-]+)*$/i).default(""),
  /** If set, serve the built web app (apps/web/dist) from this directory. */
  WEB_DIST_DIR: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  const data = parsed.data;
  const production = data.NODE_ENV === "production";
  if (production && !data.DATABASE_URL) throw new Error("DATABASE_URL is required in production");
  if (production && !data.JWT_SECRET) throw new Error("JWT_SECRET is required in production");
  if (production && data.MAIL_PROVIDER === "console") {
    throw new Error("MAIL_PROVIDER=console prints links to logs and must not be used in production");
  }
  return {
    ...data,
    JWT_SECRET: data.JWT_SECRET ?? devJwtSecret(),
    MAIL_PROVIDER: data.MAIL_PROVIDER ?? (production ? "disabled" : "console"),
  };
}

/**
 * Development convenience: a random secret persisted to apps/api/.data so
 * sessions survive restarts (the dev server restarts on every file change).
 */
function devJwtSecret(): string {
  const file = path.join(DEV_DATA_DIR, "dev-jwt-secret");
  if (existsSync(file)) return readFileSync(file, "utf8").trim();
  mkdirSync(DEV_DATA_DIR, { recursive: true });
  const secret = randomBytes(48).toString("hex");
  writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

export const env = loadEnv();
