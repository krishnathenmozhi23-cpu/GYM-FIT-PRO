import type { MeasurementEntryInput, MeasurementPoint, ProgressOverview, StrengthSeries, WeightEntryInput, WeightPoint } from "@gymfit/shared";
import { pool } from "../../db/pool.js";
import { addDays } from "../../lib/dates.js";
import { bmi, goalProgress, strengthSeries, weekStreak, weeklyActivity, type SessionFact, type SetFact } from "../../engine/analytics.js";
import { getLibrary } from "../exercises/repository.js";
import { getProfile } from "../profile/service.js";

export async function addWeight(userId: string, e: WeightEntryInput): Promise<void> {
  await pool.query(
    `INSERT INTO progress_records (user_id, recorded_on, weight_kg, body_fat_pct, note) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (user_id, recorded_on) DO UPDATE SET weight_kg = EXCLUDED.weight_kg,
       body_fat_pct = EXCLUDED.body_fat_pct, note = EXCLUDED.note`,
    [userId, e.recordedOn, e.weightKg, e.bodyFatPct, e.note],
  );
}

export async function addMeasurement(userId: string, m: MeasurementEntryInput): Promise<void> {
  await pool.query(
    `INSERT INTO body_measurements (user_id, recorded_on, chest_cm, waist_cm, hips_cm, arm_cm, thigh_cm, neck_cm)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (user_id, recorded_on) DO UPDATE SET
       chest_cm = coalesce(EXCLUDED.chest_cm, body_measurements.chest_cm),
       waist_cm = coalesce(EXCLUDED.waist_cm, body_measurements.waist_cm),
       hips_cm = coalesce(EXCLUDED.hips_cm, body_measurements.hips_cm),
       arm_cm = coalesce(EXCLUDED.arm_cm, body_measurements.arm_cm),
       thigh_cm = coalesce(EXCLUDED.thigh_cm, body_measurements.thigh_cm),
       neck_cm = coalesce(EXCLUDED.neck_cm, body_measurements.neck_cm)`,
    [userId, m.recordedOn, m.chestCm, m.waistCm, m.hipsCm, m.armCm, m.thighCm, m.neckCm],
  );
}

/** Raw facts shared by the progress dashboard and the insight engine. */
export async function loadProgressFacts(userId: string) {
  const [weights, measurements, sessions, sets, goal] = await Promise.all([
    pool.query<{ recorded_on: string; weight_kg: number; body_fat_pct: number | null }>(
      "SELECT recorded_on, weight_kg, body_fat_pct FROM progress_records WHERE user_id = $1 ORDER BY recorded_on",
      [userId],
    ),
    pool.query<{ recorded_on: string; chest_cm: number | null; waist_cm: number | null; hips_cm: number | null; arm_cm: number | null; thigh_cm: number | null; neck_cm: number | null }>(
      "SELECT * FROM body_measurements WHERE user_id = $1 ORDER BY recorded_on",
      [userId],
    ),
    pool.query<{ performed_on: string; duration_seconds: number | null; volume: number; difficulty_rating: number | null }>(
      `SELECT ws.performed_on, ws.duration_seconds, ws.difficulty_rating,
              coalesce((SELECT sum(es.weight_kg * es.reps) FROM session_exercises se
                JOIN exercise_sets es ON es.session_exercise_id = se.id WHERE se.session_id = ws.id), 0) AS volume
       FROM workout_sessions ws WHERE ws.user_id = $1 AND ws.status = 'completed' ORDER BY ws.completed_at`,
      [userId],
    ),
    pool.query<{ exercise_id: string; performed_on: string; weight_kg: number; reps: number }>(
      `SELECT se.exercise_id, ws.performed_on, es.weight_kg, es.reps
       FROM exercise_sets es JOIN session_exercises se ON se.id = es.session_exercise_id
       JOIN workout_sessions ws ON ws.id = se.session_id
       WHERE ws.user_id = $1 AND ws.status = 'completed' AND es.weight_kg > 0 AND es.reps > 0`,
      [userId],
    ),
    pool.query<{ created_at: Date }>("SELECT created_at FROM fitness_goals WHERE user_id = $1 AND is_active", [userId]),
  ]);

  const weightPoints: WeightPoint[] = weights.rows.map((r) => ({ date: r.recorded_on, weightKg: r.weight_kg, bodyFatPct: r.body_fat_pct }));
  const measurementPoints: MeasurementPoint[] = measurements.rows.map((r) => ({
    date: r.recorded_on, chestCm: r.chest_cm, waistCm: r.waist_cm, hipsCm: r.hips_cm, armCm: r.arm_cm, thighCm: r.thigh_cm, neckCm: r.neck_cm,
  }));
  const sessionFacts: (SessionFact & { difficultyRating: number | null })[] = sessions.rows.map((r) => ({
    date: r.performed_on, durationSeconds: r.duration_seconds ?? 0, volumeKg: r.volume, difficultyRating: r.difficulty_rating,
  }));
  const setFacts: SetFact[] = sets.rows.map((r) => ({ exerciseId: r.exercise_id, date: r.performed_on, weightKg: r.weight_kg, reps: r.reps }));
  const goalSince = goal.rows[0]?.created_at.toISOString().slice(0, 10) ?? null;
  return { weightPoints, measurementPoints, sessionFacts, setFacts, goalSince };
}

export async function getOverview(userId: string, today: string): Promise<ProgressOverview> {
  const profile = await getProfile(userId);
  const { byId } = await getLibrary();
  const { weightPoints, measurementPoints, sessionFacts, setFacts, goalSince } = await loadProgressFacts(userId);
  const current = weightPoints.at(-1)?.weightKg ?? null;
  // Start weight: the last entry on or before the goal was set, else the first entry.
  const startEntry = goalSince ? [...weightPoints].reverse().find((w) => w.date <= goalSince) ?? weightPoints[0] : weightPoints[0];
  const start = startEntry?.weightKg ?? null;

  const streak = weekStreak(sessionFacts.map((s) => s.date), profile.daysPerWeek, today);
  const fourWeeksAgo = addDays(today, -27);
  const series: StrengthSeries[] = [...strengthSeries(setFacts)]
    .filter(([, points]) => points.length >= 1)
    .map(([exerciseId, points]) => ({ exerciseId, exerciseName: byId.get(exerciseId)?.name ?? exerciseId, points }))
    .sort((a, b) => b.points.length - a.points.length)
    .slice(0, 8);
  const activity = weeklyActivity(sessionFacts, current, today);

  return {
    currentWeightKg: current,
    startWeightKg: start,
    bmi: current ? bmi(profile.heightCm, current, profile.age) : null,
    totalWorkouts: sessionFacts.length,
    currentStreakWeeks: streak.current,
    longestStreakWeeks: streak.longest,
    thisWeek: { completed: activity.at(-1)?.workouts ?? 0, target: profile.daysPerWeek },
    goal: goalProgress({
      goal: profile.goal,
      startWeightKg: start,
      currentWeightKg: current,
      targetWeightKg: profile.targetWeightKg ?? null,
      workoutsLast4Weeks: sessionFacts.filter((s) => s.date >= fourWeeksAgo).length,
      daysPerWeek: profile.daysPerWeek,
    }),
    weight: weightPoints,
    measurements: measurementPoints,
    weeklyActivity: activity,
    strength: series,
  };
}
