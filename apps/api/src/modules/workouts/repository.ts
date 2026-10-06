import type { Exercise, GeneratedPlan, PlanSource, PlanView, WorkoutExerciseView, WorkoutView } from "@gymfit/shared";
import { pool, type Queryable } from "../../db/pool.js";
import { estimateExerciseSeconds, estimateWorkoutMinutes } from "../../engine/prescription.js";

export async function savePlan(
  db: Queryable,
  userId: string,
  plan: GeneratedPlan,
  source: PlanSource,
  recommendationId: string | null,
): Promise<string> {
  await db.query(
    "UPDATE workout_plans SET status = 'archived', archived_at = now() WHERE user_id = $1 AND status = 'active'",
    [userId],
  );
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO workout_plans (user_id, goal_id, name, split_type, rationale, source, recommendation_id)
     VALUES ($1, (SELECT id FROM fitness_goals WHERE user_id = $1 AND is_active), $2, $3, $4, $5, $6)
     RETURNING id`,
    [userId, plan.name, plan.splitType, plan.rationale, source, recommendationId],
  );
  const planId = rows[0]!.id;
  for (const [position, w] of plan.workouts.entries()) {
    const { rows: wr } = await db.query<{ id: string }>(
      `INSERT INTO workouts (plan_id, position, day_of_week, title, focus) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [planId, position, w.dayOfWeek, w.title, w.focus],
    );
    const workoutId = wr[0]!.id;
    for (const [i, e] of w.exercises.entries()) {
      await db.query(
        `INSERT INTO workout_exercises (workout_id, exercise_id, position, sets, reps_min, reps_max,
           duration_seconds, rest_seconds, target_weight_kg, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [workoutId, e.exerciseId, i, e.sets, e.repsMin, e.repsMax, e.durationSeconds, e.restSeconds, e.targetWeightKg, e.note],
      );
    }
  }
  return planId;
}

interface PlanRow {
  id: string;
  name: string;
  split_type: string;
  rationale: string;
  source: PlanSource;
  created_at: Date;
  goal_type: PlanView["goal"] | null;
}

interface WorkoutExerciseRow {
  we_id: string;
  workout_id: string;
  plan_id: string;
  w_position: number;
  day_of_week: number;
  title: string;
  focus: string[];
  exercise_id: string;
  position: number;
  sets: number;
  reps_min: number;
  reps_max: number;
  duration_seconds: number | null;
  rest_seconds: number;
  target_weight_kg: number | null;
  note: string;
}

const WORKOUT_EXERCISES_SQL = `
  SELECT w.id AS workout_id, w.plan_id, w.position AS w_position, w.day_of_week, w.title, w.focus,
         we.id AS we_id, we.exercise_id, we.position, we.sets, we.reps_min, we.reps_max,
         we.duration_seconds, we.rest_seconds, we.target_weight_kg, we.note
  FROM workouts w
  LEFT JOIN workout_exercises we ON we.workout_id = w.id`;

function assembleWorkouts(rows: WorkoutExerciseRow[], byId: Map<string, Exercise>): WorkoutView[] {
  const workouts = new Map<string, WorkoutView>();
  for (const r of rows) {
    let w = workouts.get(r.workout_id);
    if (!w) {
      w = {
        id: r.workout_id,
        planId: r.plan_id,
        dayOfWeek: r.day_of_week,
        position: r.w_position,
        title: r.title,
        focus: r.focus,
        estimatedMinutes: 0,
        exercises: [],
      };
      workouts.set(r.workout_id, w);
    }
    if (!r.we_id) continue;
    const ex = byId.get(r.exercise_id);
    const view: WorkoutExerciseView = {
      id: r.we_id,
      position: r.position,
      exerciseId: r.exercise_id,
      exerciseName: ex?.name ?? r.exercise_id,
      primaryMuscles: ex?.primaryMuscles ?? [],
      difficulty: ex?.difficulty ?? "beginner",
      measure: ex?.measure ?? "reps",
      loaded: ex?.loaded ?? false,
      sets: r.sets,
      repsMin: r.reps_min,
      repsMax: r.reps_max,
      durationSeconds: r.duration_seconds,
      restSeconds: r.rest_seconds,
      targetWeightKg: r.target_weight_kg,
      note: r.note,
      estimatedMinutes: Math.round(estimateExerciseSeconds({
        sets: r.sets, repsMin: r.reps_min, repsMax: r.reps_max, durationSeconds: r.duration_seconds, restSeconds: r.rest_seconds,
      }) / 60),
    };
    w.exercises.push(view);
  }
  for (const w of workouts.values()) {
    w.exercises.sort((a, b) => a.position - b.position);
    w.estimatedMinutes = estimateWorkoutMinutes(w.exercises);
  }
  return [...workouts.values()].sort((a, b) => a.position - b.position);
}

export async function getActivePlan(userId: string, byId: Map<string, Exercise>, db: Queryable = pool): Promise<PlanView | null> {
  const { rows } = await db.query<PlanRow>(
    `SELECT p.id, p.name, p.split_type, p.rationale, p.source, p.created_at, g.goal_type
     FROM workout_plans p LEFT JOIN fitness_goals g ON g.id = p.goal_id
     WHERE p.user_id = $1 AND p.status = 'active'`,
    [userId],
  );
  const plan = rows[0];
  if (!plan) return null;
  const { rows: wRows } = await db.query<WorkoutExerciseRow>(`${WORKOUT_EXERCISES_SQL} WHERE w.plan_id = $1`, [plan.id]);
  return {
    id: plan.id,
    name: plan.name,
    goal: plan.goal_type ?? "general_fitness",
    splitType: plan.split_type,
    rationale: plan.rationale,
    source: plan.source,
    createdAt: plan.created_at.toISOString(),
    workouts: assembleWorkouts(wRows, byId),
  };
}

/** A workout owned by the user (via its plan). */
export async function getWorkoutForUser(userId: string, workoutId: string, byId: Map<string, Exercise>): Promise<WorkoutView | null> {
  const { rows } = await pool.query<WorkoutExerciseRow>(
    `${WORKOUT_EXERCISES_SQL} JOIN workout_plans p ON p.id = w.plan_id WHERE w.id = $1 AND p.user_id = $2`,
    [workoutId, userId],
  );
  return assembleWorkouts(rows, byId)[0] ?? null;
}

/** Most recent working weight per exercise from completed sessions. */
export async function getLoadHistory(userId: string, db: Queryable = pool): Promise<Map<string, number>> {
  const { rows } = await db.query<{ exercise_id: string; weight: number }>(
    `SELECT DISTINCT ON (se.exercise_id) se.exercise_id, s.weight
     FROM session_exercises se
     JOIN workout_sessions ws ON ws.id = se.session_id
     JOIN LATERAL (SELECT max(weight_kg) AS weight FROM exercise_sets es WHERE es.session_exercise_id = se.id) s ON true
     WHERE ws.user_id = $1 AND ws.status = 'completed' AND s.weight IS NOT NULL AND s.weight > 0
     ORDER BY se.exercise_id, ws.completed_at DESC`,
    [userId],
  );
  return new Map(rows.map((r) => [r.exercise_id, r.weight]));
}

export interface CompletedSessionRef {
  id: string;
  workoutId: string | null;
  date: string;
  title: string;
}

export async function getCompletedSessionsSince(userId: string, since: string, db: Queryable = pool): Promise<CompletedSessionRef[]> {
  const { rows } = await db.query<{ id: string; workout_id: string | null; performed_on: string; title: string }>(
    `SELECT id, workout_id, performed_on, title FROM workout_sessions
     WHERE user_id = $1 AND status = 'completed' AND performed_on >= $2
     ORDER BY completed_at`,
    [userId, since],
  );
  return rows.map((r) => ({ id: r.id, workoutId: r.workout_id, date: r.performed_on, title: r.title }));
}
