import type { Exercise } from "@gymfit/shared";
import { pool } from "../../db/pool.js";

interface ExerciseRow {
  id: string;
  name: string;
  category: Exercise["category"];
  pattern: Exercise["pattern"];
  mechanics: Exercise["mechanics"];
  primary_muscles: Exercise["primaryMuscles"];
  secondary_muscles: Exercise["secondaryMuscles"];
  equipment: Exercise["equipment"];
  difficulty: Exercise["difficulty"];
  measure: Exercise["measure"];
  loaded: boolean;
  contraindications: Exercise["contraindications"];
  instructions: string[];
  common_mistakes: string[];
}

const toExercise = (r: ExerciseRow): Exercise => ({
  id: r.id,
  name: r.name,
  category: r.category,
  pattern: r.pattern,
  mechanics: r.mechanics,
  primaryMuscles: r.primary_muscles,
  secondaryMuscles: r.secondary_muscles,
  equipment: r.equipment,
  difficulty: r.difficulty,
  measure: r.measure,
  loaded: r.loaded,
  contraindications: r.contraindications,
  instructions: r.instructions,
  commonMistakes: r.common_mistakes,
});

const CACHE_TTL_MS = 60_000;
let cache: { at: number; list: Exercise[]; byId: Map<string, Exercise> } | null = null;

/**
 * The library is small and read-heavy, so it is cached in memory for a
 * minute. All recommendation logic works from this list.
 */
export async function getLibrary(): Promise<{ list: Exercise[]; byId: Map<string, Exercise> }> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache;
  const { rows } = await pool.query<ExerciseRow>("SELECT * FROM exercises ORDER BY name");
  const list = rows.map(toExercise);
  cache = { at: Date.now(), list, byId: new Map(list.map((e) => [e.id, e])) };
  return cache;
}

export function clearLibraryCache() {
  cache = null;
}
