// Test-only configuration.
//  - default: a dedicated PostgreSQL database, reset once per run (globalSetup)
//  - TEST_DB=pglite: an in-memory embedded PostgreSQL per test file (setupDb.ts)
process.env.NODE_ENV = "test";
if (process.env.TEST_DB === "pglite") {
  // Empty (not deleted) so dotenv can't fill it back in from a local .env file.
  process.env.DATABASE_URL = "";
  process.env.PGLITE_DIR = "memory://";
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://gymfit:gymfit@localhost:5432/gymfit_test";
}
process.env.JWT_SECRET = "test-secret-test-secret-test-secret-123456";
process.env.AI_PROVIDER = process.env.AI_PROVIDER_TEST ?? "none";
