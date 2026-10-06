import "./env.js";

/** Resets the test database, applies migrations and seeds the exercise library. */
export default async function setup() {
  const { pool } = await import("../src/db/pool.js");
  const { migrate } = await import("../src/db/migrate.js");
  const { seedExercises } = await import("../src/db/seed.js");
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await migrate();
  await seedExercises();
  await pool.end();
}
