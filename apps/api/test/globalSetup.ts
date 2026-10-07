import "./env.js";

/** PostgreSQL mode: reset the test database, apply migrations and seed once per run. */
export default async function setup() {
  if (process.env.TEST_DB === "pglite") return; // each file sets up its own in-memory DB
  const { pool } = await import("../src/db/pool.js");
  const { migrate } = await import("../src/db/migrate.js");
  const { seedExercises } = await import("../src/db/seed.js");
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await migrate();
  await seedExercises();
  await pool.end();
}
