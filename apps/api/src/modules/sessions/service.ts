import { EXERCISE_FORM_PROFILE, type FormCheckResult, type FormCheckView } from "@gymfit/shared";
import type {
  CompleteSessionInput,
  LogSetInput,
  PrescribedExercise,
  SessionSummary,
  SessionView,
  SetView,
  UpdateSessionExerciseInput,
} from "@gymfit/shared";
import { pool, withTransaction, type Queryable } from "../../db/pool.js";
import { badRequest, conflict, notFound } from "../../lib/errors.js";
import { respectsLimitations } from "../../engine/filters.js";
import { prescribe } from "../../engine/prescription.js";
import { getLibrary } from "../exercises/repository.js";
import { getProfile } from "../profile/service.js";
import { getLoadHistory, getWorkoutForUser } from "../workouts/repository.js";

interface SessionRow {
  id: string;
  user_id: string;
  workout_id: string | null;
  title: string;
  status: SessionView["status"];
  started_at: Date;
  completed_at: Date | null;
  paused_at: Date | null;
  paused_seconds: number;
  duration_seconds: number | null;
  difficulty_rating: number | null;
  feedback: string;
  performed_on: string;
}

interface SessionExerciseRow {
  id: string;
  exercise_id: string;
  replaced_from_id: string | null;
  position: number;
  status: "pending" | "completed" | "skipped";
  target_sets: number;
  target_reps_min: number;
  target_reps_max: number;
  target_duration_seconds: number | null;
  target_rest_seconds: number;
  target_weight_kg: number | null;
  workout_exercise_id: string | null;
}

interface SetRow {
  id: string;
  session_exercise_id: string;
  set_number: number;
  reps: number | null;
  weight_kg: number | null;
  duration_seconds: number | null;
  completed_at: Date;
}

interface FormCheckRow {
  id: string;
  session_exercise_id: string;
  profile: FormCheckView["profile"];
  reps: number;
  clean_reps: number;
  duration_seconds: number;
  issues: FormCheckView["issues"];
  created_at: Date;
}

const toFormCheck = (r: FormCheckRow): FormCheckView => ({
  id: r.id,
  profile: r.profile,
  reps: r.reps,
  cleanReps: r.clean_reps,
  durationSeconds: r.duration_seconds,
  issues: r.issues,
  createdAt: r.created_at.toISOString(),
});

const toSet = (s: SetRow): SetView => ({
  id: s.id,
  setNumber: s.set_number,
  reps: s.reps,
  weightKg: s.weight_kg,
  durationSeconds: s.duration_seconds,
  completedAt: s.completed_at.toISOString(),
});

async function loadSessionRow(db: Queryable, userId: string, sessionId: string, lock = false): Promise<SessionRow> {
  const { rows } = await db.query<SessionRow>(
    `SELECT * FROM workout_sessions WHERE id = $1 AND user_id = $2${lock ? " FOR UPDATE" : ""}`,
    [sessionId, userId],
  );
  if (!rows[0]) throw notFound("Workout session");
  return rows[0];
}

export async function getSession(userId: string, sessionId: string, db: Queryable = pool): Promise<SessionView> {
  const s = await loadSessionRow(db, userId, sessionId);
  const { byId } = await getLibrary();
  const { rows: exRows } = await db.query<SessionExerciseRow>(
    "SELECT * FROM session_exercises WHERE session_id = $1 ORDER BY position",
    [sessionId],
  );
  const { rows: checkRows } = await db.query<FormCheckRow>(
    `SELECT fc.* FROM form_checks fc JOIN session_exercises se ON se.id = fc.session_exercise_id
     WHERE se.session_id = $1 ORDER BY fc.created_at`,
    [sessionId],
  );
  const { rows: setRows } = await db.query<SetRow>(
    `SELECT es.* FROM exercise_sets es JOIN session_exercises se ON se.id = es.session_exercise_id
     WHERE se.session_id = $1 ORDER BY es.set_number`,
    [sessionId],
  );
  return {
    id: s.id,
    workoutId: s.workout_id,
    title: s.title,
    status: s.status,
    startedAt: s.started_at.toISOString(),
    completedAt: s.completed_at?.toISOString() ?? null,
    pausedAt: s.paused_at?.toISOString() ?? null,
    pausedSeconds: s.paused_seconds,
    durationSeconds: s.duration_seconds,
    difficultyRating: s.difficulty_rating,
    feedback: s.feedback,
    exercises: exRows.map((e) => {
      const ex = byId.get(e.exercise_id);
      return {
        id: e.id,
        position: e.position,
        exerciseId: e.exercise_id,
        exerciseName: ex?.name ?? e.exercise_id,
        primaryMuscles: ex?.primaryMuscles ?? [],
        measure: ex?.measure ?? "reps",
        loaded: ex?.loaded ?? false,
        status: e.status,
        replacedFromName: e.replaced_from_id ? (byId.get(e.replaced_from_id)?.name ?? e.replaced_from_id) : null,
        videoUrl: ex?.videoUrl ?? null,
        prescription: {
          sets: e.target_sets,
          repsMin: e.target_reps_min,
          repsMax: e.target_reps_max,
          durationSeconds: e.target_duration_seconds,
          restSeconds: e.target_rest_seconds,
          targetWeightKg: e.target_weight_kg,
        },
        sets: setRows.filter((r) => r.session_exercise_id === e.id).map(toSet),
        formChecks: checkRows.filter((r) => r.session_exercise_id === e.id).map(toFormCheck),
      };
    }),
  };
}

async function insertSession(
  userId: string,
  title: string,
  workoutId: string | null,
  today: string,
  exercises: (PrescribedExercise & { workoutExerciseId: string | null })[],
): Promise<SessionView> {
  try {
    return await withTransaction(async (db) => {
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO workout_sessions (user_id, workout_id, title, performed_on) VALUES ($1,$2,$3,$4) RETURNING id`,
        [userId, workoutId, title, today],
      );
      const sessionId = rows[0]!.id;
      for (const [i, e] of exercises.entries()) {
        await db.query(
          `INSERT INTO session_exercises (session_id, workout_exercise_id, exercise_id, position, target_sets,
             target_reps_min, target_reps_max, target_duration_seconds, target_rest_seconds, target_weight_kg)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [sessionId, e.workoutExerciseId, e.exerciseId, i, e.sets, e.repsMin, e.repsMax, e.durationSeconds, e.restSeconds, e.targetWeightKg],
        );
      }
      return getSession(userId, sessionId, db);
    });
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      throw conflict("You already have a workout in progress. Finish or end it before starting another.");
    }
    throw err;
  }
}

export async function startFromWorkout(userId: string, workoutId: string, today: string): Promise<SessionView> {
  const { byId } = await getLibrary();
  const workout = await getWorkoutForUser(userId, workoutId, byId);
  if (!workout) throw notFound("Workout");
  return insertSession(
    userId,
    workout.title,
    workout.id,
    today,
    workout.exercises.map((e) => ({ ...e, workoutExerciseId: e.id })),
  );
}

/** Ad-hoc session (quick workout, condensed workout) not tied to a plan day. */
export async function startAdHoc(
  userId: string,
  title: string,
  exercises: PrescribedExercise[],
  today: string,
  workoutId: string | null = null,
): Promise<SessionView> {
  const { byId } = await getLibrary();
  const profile = await getProfile(userId);
  for (const e of exercises) {
    const ex = byId.get(e.exerciseId);
    if (!ex) throw badRequest(`Unknown exercise: ${e.exerciseId}`);
    if (!respectsLimitations(ex, profile.limitations)) throw badRequest(`${ex.name} conflicts with your limitations`);
  }
  return insertSession(userId, title, workoutId, today, exercises.map((e) => ({ ...e, workoutExerciseId: null })));
}

export async function getActiveSession(userId: string): Promise<SessionView | null> {
  const { rows } = await pool.query<{ id: string }>(
    "SELECT id FROM workout_sessions WHERE user_id = $1 AND status = 'in_progress'",
    [userId],
  );
  return rows[0] ? getSession(userId, rows[0].id) : null;
}

function assertInProgress(s: SessionRow) {
  if (s.status !== "in_progress") throw conflict("This workout has already ended");
}

export async function logSet(userId: string, sessionId: string, input: LogSetInput): Promise<SetView> {
  return withTransaction(async (db) => {
    assertInProgress(await loadSessionRow(db, userId, sessionId, true));
    const { rows: exRows } = await db.query<{ id: string }>(
      "SELECT id FROM session_exercises WHERE id = $1 AND session_id = $2",
      [input.sessionExerciseId, sessionId],
    );
    if (!exRows[0]) throw notFound("Session exercise");
    if (input.reps === null && input.durationSeconds === null) throw badRequest("Log reps or a duration for the set");
    const { rows } = await db.query<SetRow>(
      `INSERT INTO exercise_sets (session_exercise_id, set_number, reps, weight_kg, duration_seconds)
       VALUES ($1, (SELECT coalesce(max(set_number), 0) + 1 FROM exercise_sets WHERE session_exercise_id = $1), $2, $3, $4)
       RETURNING *`,
      [input.sessionExerciseId, input.reps, input.weightKg, input.durationSeconds],
    );
    // Logging a set re-opens a skipped exercise.
    await db.query("UPDATE session_exercises SET status = 'pending' WHERE id = $1 AND status = 'skipped'", [input.sessionExerciseId]);
    return toSet(rows[0]!);
  });
}

export async function deleteSet(userId: string, sessionId: string, setId: string): Promise<void> {
  await withTransaction(async (db) => {
    assertInProgress(await loadSessionRow(db, userId, sessionId, true));
    const { rowCount } = await db.query(
      `DELETE FROM exercise_sets es USING session_exercises se
       WHERE es.id = $1 AND es.session_exercise_id = se.id AND se.session_id = $2`,
      [setId, sessionId],
    );
    if (!rowCount) throw notFound("Set");
  });
}

export async function updateSessionExercise(
  userId: string,
  sessionId: string,
  sessionExerciseId: string,
  input: UpdateSessionExerciseInput,
): Promise<SessionView> {
  await withTransaction(async (db) => {
    assertInProgress(await loadSessionRow(db, userId, sessionId, true));
    const { rows } = await db.query<SessionExerciseRow>(
      "SELECT * FROM session_exercises WHERE id = $1 AND session_id = $2",
      [sessionExerciseId, sessionId],
    );
    const current = rows[0];
    if (!current) throw notFound("Session exercise");

    if (input.action === "skip" || input.action === "complete") {
      await db.query("UPDATE session_exercises SET status = $2 WHERE id = $1", [
        sessionExerciseId,
        input.action === "skip" ? "skipped" : "completed",
      ]);
      return;
    }

    // Replace: the swap must respect the user's limitations.
    const { byId } = await getLibrary();
    const next = byId.get(input.exerciseId);
    const prev = byId.get(current.exercise_id);
    if (!next) throw badRequest("Unknown exercise");
    const profile = await getProfile(userId, db);
    if (!respectsLimitations(next, profile.limitations)) throw badRequest(`${next.name} conflicts with your limitations`);
    const { rows: setCount } = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM exercise_sets WHERE session_exercise_id = $1",
      [sessionExerciseId],
    );
    if ((setCount[0]?.n ?? 0) > 0) throw conflict("Sets are already logged for this exercise — skip it and add a new one instead");

    const sameMeasure = prev && prev.measure === next.measure;
    const p = sameMeasure
      ? {
          sets: current.target_sets,
          repsMin: current.target_reps_min,
          repsMax: current.target_reps_max,
          durationSeconds: current.target_duration_seconds,
          restSeconds: current.target_rest_seconds,
        }
      : prescribe(next, "accessory", profile.goal, profile.fitnessLevel);
    const history = await getLoadHistory(userId, db);
    await db.query(
      `UPDATE session_exercises SET exercise_id = $2, replaced_from_id = coalesce(replaced_from_id, $3), status = 'pending',
         target_sets = $4, target_reps_min = $5, target_reps_max = $6, target_duration_seconds = $7,
         target_rest_seconds = $8, target_weight_kg = $9
       WHERE id = $1`,
      [
        sessionExerciseId, next.id, current.exercise_id, p.sets, p.repsMin, p.repsMax, p.durationSeconds, p.restSeconds,
        next.loaded ? (history.get(next.id) ?? null) : null,
      ],
    );
  });
  return getSession(userId, sessionId);
}

export async function setPaused(userId: string, sessionId: string, paused: boolean): Promise<SessionView> {
  await withTransaction(async (db) => {
    const s = await loadSessionRow(db, userId, sessionId, true);
    assertInProgress(s);
    if (paused && !s.paused_at) {
      await db.query("UPDATE workout_sessions SET paused_at = now() WHERE id = $1", [sessionId]);
    } else if (!paused && s.paused_at) {
      await db.query(
        `UPDATE workout_sessions SET paused_seconds = paused_seconds + extract(epoch FROM now() - paused_at)::int,
           paused_at = NULL WHERE id = $1`,
        [sessionId],
      );
    }
  });
  return getSession(userId, sessionId);
}

/** Marks the session complete. Returns the final view; adaptation runs separately. */
export async function completeSession(userId: string, sessionId: string, input: CompleteSessionInput, db: Queryable): Promise<void> {
  const s = await loadSessionRow(db, userId, sessionId, true);
  assertInProgress(s);
  const { rows } = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM exercise_sets es JOIN session_exercises se ON se.id = es.session_exercise_id
     WHERE se.session_id = $1`,
    [sessionId],
  );
  if ((rows[0]?.n ?? 0) === 0) throw badRequest("Log at least one set before finishing, or end the workout instead");
  await db.query(
    `UPDATE session_exercises se SET status = CASE
        WHEN EXISTS (SELECT 1 FROM exercise_sets es WHERE es.session_exercise_id = se.id) THEN 'completed'
        ELSE 'skipped' END
     WHERE se.session_id = $1 AND se.status = 'pending'`,
    [sessionId],
  );
  await db.query(
    `UPDATE workout_sessions SET status = 'completed', completed_at = now(),
       paused_seconds = paused_seconds + coalesce(extract(epoch FROM now() - paused_at)::int, 0), paused_at = NULL,
       duration_seconds = greatest(0, extract(epoch FROM now() - started_at)::int
         - (paused_seconds + coalesce(extract(epoch FROM now() - paused_at)::int, 0))),
       difficulty_rating = $2, feedback = $3
     WHERE id = $1`,
    [sessionId, input.difficultyRating, input.feedback],
  );
}

export async function abandonSession(userId: string, sessionId: string): Promise<void> {
  await withTransaction(async (db) => {
    assertInProgress(await loadSessionRow(db, userId, sessionId, true));
    await db.query("UPDATE workout_sessions SET status = 'abandoned', completed_at = now(), paused_at = NULL WHERE id = $1", [sessionId]);
  });
}

export async function listHistory(userId: string, limit = 30): Promise<SessionSummary[]> {
  const { rows } = await pool.query<{
    id: string;
    title: string;
    started_at: Date;
    completed_at: Date | null;
    duration_seconds: number | null;
    difficulty_rating: number | null;
    sets_completed: number;
    volume_kg: number | null;
  }>(
    `SELECT ws.id, ws.title, ws.started_at, ws.completed_at, ws.duration_seconds, ws.difficulty_rating,
            count(es.id)::int AS sets_completed,
            coalesce(sum(es.weight_kg * es.reps), 0) AS volume_kg
     FROM workout_sessions ws
     LEFT JOIN session_exercises se ON se.session_id = ws.id
     LEFT JOIN exercise_sets es ON es.session_exercise_id = se.id
     WHERE ws.user_id = $1 AND ws.status = 'completed'
     GROUP BY ws.id ORDER BY ws.completed_at DESC LIMIT $2`,
    [userId, limit],
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    startedAt: r.started_at.toISOString(),
    completedAt: r.completed_at?.toISOString() ?? null,
    durationSeconds: r.duration_seconds,
    difficultyRating: r.difficulty_rating,
    setsCompleted: r.sets_completed,
    volumeKg: Math.round(r.volume_kg ?? 0),
  }));
}

/** Stores the metrics from an on-device camera form check (no video). */
export async function saveFormCheck(userId: string, sessionId: string, input: FormCheckResult): Promise<FormCheckView> {
  return withTransaction(async (db) => {
    assertInProgress(await loadSessionRow(db, userId, sessionId, true));
    const { rows } = await db.query<{ exercise_id: string }>(
      "SELECT exercise_id FROM session_exercises WHERE id = $1 AND session_id = $2",
      [input.sessionExerciseId, sessionId],
    );
    const exerciseId = rows[0]?.exercise_id;
    if (!exerciseId) throw notFound("Session exercise");
    if (EXERCISE_FORM_PROFILE[exerciseId] !== input.profile) throw badRequest("This exercise doesn't support that form check");
    if (input.cleanReps > input.reps) throw badRequest("cleanReps can't exceed reps");
    const { rows: saved } = await db.query<FormCheckRow>(
      `INSERT INTO form_checks (user_id, session_exercise_id, exercise_id, profile, reps, clean_reps, duration_seconds, issues)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [userId, input.sessionExerciseId, exerciseId, input.profile, input.reps, input.cleanReps, input.durationSeconds, JSON.stringify(input.issues)],
    );
    return toFormCheck(saved[0]!);
  });
}
