import { exerciseSchema } from "@gymfit/shared";
import { withTransaction } from "./pool.js";
import { EXERCISE_SEED } from "./seed/exercises.js";
import { EXERCISE_VIDEOS } from "./seed/exerciseVideos.js";

/** Validates and upserts the exercise library. Safe to run repeatedly. */
export async function seedExercises(): Promise<number> {
  const ids = new Set<string>();
  for (const [id, url] of Object.entries(EXERCISE_VIDEOS)) {
    if (!EXERCISE_SEED.some((e) => e.id === id)) throw new Error(`exerciseVideos: unknown exercise id "${id}"`);
    if (!/^https:\/\//.test(url)) throw new Error(`exerciseVideos: "${id}" must be an https URL`);
  }
  for (const e of EXERCISE_SEED) {
    exerciseSchema.parse(e);
    if (ids.has(e.id)) throw new Error(`Duplicate exercise id: ${e.id}`);
    ids.add(e.id);
  }

  await withTransaction(async (db) => {
    for (const e of EXERCISE_SEED) {
      await db.query(
        `INSERT INTO exercises (id, name, category, pattern, mechanics, primary_muscles, secondary_muscles,
           equipment, difficulty, measure, loaded, contraindications, instructions, common_mistakes, video_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name, category = EXCLUDED.category, pattern = EXCLUDED.pattern,
           mechanics = EXCLUDED.mechanics, primary_muscles = EXCLUDED.primary_muscles,
           secondary_muscles = EXCLUDED.secondary_muscles, equipment = EXCLUDED.equipment,
           difficulty = EXCLUDED.difficulty, measure = EXCLUDED.measure, loaded = EXCLUDED.loaded,
           contraindications = EXCLUDED.contraindications, instructions = EXCLUDED.instructions,
           common_mistakes = EXCLUDED.common_mistakes, video_url = EXCLUDED.video_url, updated_at = now()`,
        [
          e.id, e.name, e.category, e.pattern, e.mechanics, e.primaryMuscles, e.secondaryMuscles,
          e.equipment, e.difficulty, e.measure, e.loaded, e.contraindications, e.instructions, e.commonMistakes,
          EXERCISE_VIDEOS[e.id] ?? null,
        ],
      );
    }
  });
  return EXERCISE_SEED.length;
}

