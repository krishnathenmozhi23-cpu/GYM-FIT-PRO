import { beforeAll } from "vitest";

// PGlite mode: fresh in-memory database for this test file.
if (process.env.TEST_DB === "pglite") {
  beforeAll(async () => {
    const { pool } = await import("../src/db/pool.js");
    if (pool.driver !== "pglite") throw new Error(`TEST_DB=pglite but the app is using ${pool.driver}`);
    const { migrate } = await import("../src/db/migrate.js");
    const { seedExercises } = await import("../src/db/seed.js");
    await migrate();
    await seedExercises();
  }, 60_000);
}
