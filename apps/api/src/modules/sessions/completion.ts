import type { AdaptationChange, CompleteSessionInput, CompleteSessionResponse } from "@gymfit/shared";
import { withTransaction, type Queryable } from "../../db/pool.js";
import { progress, volumeAdjustment, type Performance, type Prescription } from "../../engine/progression.js";
import { getLibrary } from "../exercises/repository.js";
import { getProfile } from "../profile/service.js";
import { completeSession, getSession } from "./service.js";

interface PerfRow {
  session_id: string;
  exercise_id: string;
  status: Performance["status"];
  difficulty_rating: number | null;
  target_sets: number;
  target_reps_min: number;
  target_reps_max: number;
  target_duration_seconds: number | null;
  target_weight_kg: number | null;
  sets: { reps: number | null; weightKg: number | null; durationSeconds: number | null }[] | null;
}

/** Last two completed performances per exercise, newest first. */
async function performanceHistory(db: Queryable, userId: string, exerciseIds: string[]): Promise<Map<string, Performance[]>> {
  const { rows } = await db.query<PerfRow>(
    `SELECT * FROM (
       SELECT se.session_id, se.exercise_id, se.status, ws.difficulty_rating, se.target_sets, se.target_reps_min,
              se.target_reps_max, se.target_duration_seconds, se.target_weight_kg,
              (SELECT json_agg(json_build_object('reps', es.reps, 'weightKg', es.weight_kg, 'durationSeconds', es.duration_seconds)
                       ORDER BY es.set_number) FROM exercise_sets es WHERE es.session_exercise_id = se.id) AS sets,
              row_number() OVER (PARTITION BY se.exercise_id ORDER BY ws.completed_at DESC) AS rn
       FROM session_exercises se JOIN workout_sessions ws ON ws.id = se.session_id
       WHERE ws.user_id = $1 AND ws.status = 'completed' AND se.exercise_id = ANY($2) AND se.status <> 'skipped'
     ) t WHERE rn <= 2 ORDER BY exercise_id, rn`,
    [userId, exerciseIds],
  );
  const map = new Map<string, Performance[]>();
  for (const r of rows) {
    const list = map.get(r.exercise_id) ?? [];
    list.push({
      difficultyRating: r.difficulty_rating,
      status: r.status,
      sets: r.sets ?? [],
      target: { sets: r.target_sets, repsMin: r.target_reps_min, repsMax: r.target_reps_max, durationSeconds: r.target_duration_seconds, targetWeightKg: r.target_weight_kg },
    });
    map.set(r.exercise_id, list);
  }
  return map;
}

interface PlanRow {
  id: string;
  exercise_id: string;
  position: number;
  sets: number;
  reps_min: number;
  reps_max: number;
  duration_seconds: number | null;
  target_weight_kg: number | null;
}

/**
 * Adapts the plan workout this session came from, using everything the
 * user logged: per-exercise load/rep progression and session-level volume.
 * Runs in the same transaction as completion.
 */
async function adaptPlan(db: Queryable, userId: string, sessionId: string): Promise<AdaptationChange[]> {
  const { rows: s } = await db.query<{ workout_id: string | null }>(
    `SELECT ws.workout_id FROM workout_sessions ws
     JOIN workouts w ON w.id = ws.workout_id JOIN workout_plans p ON p.id = w.plan_id AND p.status = 'active'
     WHERE ws.id = $1`,
    [sessionId],
  );
  const workoutId = s[0]?.workout_id;
  if (!workoutId) return []; // ad-hoc session or plan since replaced: nothing to adapt

  const { byId } = await getLibrary();
  const profile = await getProfile(userId, db);
  const { rows: planRows } = await db.query<PlanRow>(
    "SELECT id, exercise_id, position, sets, reps_min, reps_max, duration_seconds, target_weight_kg FROM workout_exercises WHERE workout_id = $1 ORDER BY position",
    [workoutId],
  );
  const { rows: done } = await db.query<{ exercise_id: string }>(
    "SELECT DISTINCT exercise_id FROM session_exercises WHERE session_id = $1 AND status = 'completed'",
    [sessionId],
  );
  const performed = new Set(done.map((d) => d.exercise_id));
  const history = await performanceHistory(db, userId, [...performed]);
  const changes: AdaptationChange[] = [];

  for (const row of planRows) {
    const ex = byId.get(row.exercise_id);
    if (!ex || !performed.has(row.exercise_id)) continue;
    const current: Prescription = {
      sets: row.sets, repsMin: row.reps_min, repsMax: row.reps_max, durationSeconds: row.duration_seconds, targetWeightKg: row.target_weight_kg,
    };
    const { next, change } = progress(ex, current, history.get(row.exercise_id) ?? []);
    if (!change) continue;
    await db.query(
      `UPDATE workout_exercises SET reps_min = $2, reps_max = $3, duration_seconds = $4, target_weight_kg = $5,
         note = CASE WHEN $5::numeric IS NOT NULL THEN '' ELSE note END
       WHERE id = $1`,
      [row.id, next.repsMin, next.repsMax, next.durationSeconds, next.targetWeightKg],
    );
    changes.push({ exerciseId: ex.id, exerciseName: ex.name, ...change });
  }

  // Session-level volume from the last few ratings.
  const { rows: ratings } = await db.query<{ difficulty_rating: number | null }>(
    "SELECT difficulty_rating FROM workout_sessions WHERE user_id = $1 AND status = 'completed' ORDER BY completed_at DESC LIMIT 3",
    [userId],
  );
  const adj = volumeAdjustment(ratings.map((r) => r.difficulty_rating));
  if (adj === -1) {
    const accessories = planRows.filter((r) => r.position >= 2 && r.sets > 2 && r.duration_seconds === null);
    for (const r of accessories) await db.query("UPDATE workout_exercises SET sets = sets - 1 WHERE id = $1", [r.id]);
    if (accessories.length) {
      changes.push({
        exerciseId: "*", exerciseName: "Accessory exercises", kind: "reduce_volume", from: "current sets", to: "1 fewer set",
        reason: "Your last two workouts felt too hard — easing volume to help you recover.",
      });
    }
  } else if (adj === 1) {
    const cap = profile.fitnessLevel === "beginner" ? 4 : 5;
    const main = planRows.find((r) => r.position === 0 && r.sets < cap && r.duration_seconds === null);
    if (main) {
      await db.query("UPDATE workout_exercises SET sets = sets + 1 WHERE id = $1", [main.id]);
      const ex = byId.get(main.exercise_id);
      changes.push({
        exerciseId: main.exercise_id, exerciseName: ex?.name ?? main.exercise_id, kind: "increase_volume",
        from: `${main.sets} sets`, to: `${main.sets + 1} sets`, reason: "Your recent workouts felt easy — adding a set to your main lift.",
      });
    }
  }

  if (changes.length) {
    await db.query(
      `INSERT INTO ai_recommendations (user_id, kind, source, model, input_context, output, validation_status)
       VALUES ($1, 'adaptation', 'rule_engine', NULL, $2, $3, 'not_applicable')`,
      [userId, JSON.stringify({ sessionId, workoutId }), JSON.stringify(changes)],
    );
  }
  return changes;
}

export async function completeAndAdapt(userId: string, sessionId: string, input: CompleteSessionInput): Promise<CompleteSessionResponse> {
  const adaptations = await withTransaction(async (db) => {
    await completeSession(userId, sessionId, input, db);
    return adaptPlan(db, userId, sessionId);
  });
  return { session: await getSession(userId, sessionId), adaptations };
}
