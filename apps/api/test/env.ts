// Test-only configuration. Uses a dedicated database that is reset on each run.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://gymfit:gymfit@localhost:5432/gymfit_test";
process.env.JWT_SECRET = "test-secret-test-secret-test-secret-123456";
process.env.AI_PROVIDER = process.env.AI_PROVIDER_TEST ?? "none";
