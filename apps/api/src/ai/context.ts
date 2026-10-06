import type { Exercise, Insight, PlanView, Profile, TodayResponse } from "@gymfit/shared";
import { pool } from "../db/pool.js";
import { computeInsights } from "../engine/insights.js";
import { strengthSeries, weekStreak } from "../engine/analytics.js";
import type { EngineProfile } from "../engine/types.js";
import { getLibrary } from "../modules/exercises/repository.js";
import { getProfile } from "../modules/profile/service.js";
import { loadProgressFacts } from "../modules/progress/service.js";
import { getLoadHistory } from "../modules/workouts/repository.js";
import { getActivePlan, getToday, toEngineProfile } from "../modules/workouts/service.js";

export interface RecentWorkout {
  date: string;
  title: string;
  durationMin: number | null;
  difficultyRating: number | null;
  feedback: string;
  exercises: { name: string; status: string; sets: string }[];
}

/** Everything the AI layer knows about a user — always from the database. */
export interface UserContext {
  today: string;
  profile: Profile;
  engineProfile: EngineProfile;
  library: Exercise[];
  byId: Map<string, Exercise>;
  loadHistory: Map<string, number>;
  plan: PlanView | null;
  todayInfo: TodayResponse;
  recent: RecentWorkout[];
  insights: Insight[];
}

async function recentWorkouts(userId: string, byId: Map<string, Exercise>, limit = 8): Promise<RecentWorkout[]> {
  const { rows } = await pool.query<{
    id: string; performed_on: string; title: string; duration_seconds: number | null; difficulty_rating: number | null; feedback: string;
  }>(
    `SELECT id, performed_on, title, duration_seconds, difficulty_rating, feedback FROM workout_sessions
     WHERE user_id = $1 AND status = 'completed' ORDER BY completed_at DESC LIMIT $2`,
    [userId, limit],
  );
  if (!rows.length) return [];
  const { rows: ex } = await pool.query<{ session_id: string; exercise_id: string; status: string; sets: { r: number | null; w: number | null; d: number | null }[] | null }>(
    `SELECT se.session_id, se.exercise_id, se.status,
       (SELECT json_agg(json_build_object('r', es.reps, 'w', es.weight_kg, 'd', es.duration_seconds) ORDER BY es.set_number)
        FROM exercise_sets es WHERE es.session_exercise_id = se.id) AS sets
     FROM session_exercises se WHERE se.session_id = ANY($1) ORDER BY se.position`,
    [rows.map((r) => r.id)],
  );
  return rows.map((s) => ({
    date: s.performed_on,
    title: s.title,
    durationMin: s.duration_seconds === null ? null : Math.round(s.duration_seconds / 60),
    difficultyRating: s.difficulty_rating,
    feedback: s.feedback,
    exercises: ex
      .filter((e) => e.session_id === s.id)
      .map((e) => ({
        name: byId.get(e.exercise_id)?.name ?? e.exercise_id,
        status: e.status,
        sets: (e.sets ?? []).map((x) => (x.d !== null ? `${x.d}s` : `${x.r}${x.w ? `@${x.w}kg` : ""}`)).join(", ") || "—",
      })),
  }));
}

export async function buildUserContext(userId: string, today: string): Promise<UserContext> {
  const profile = await getProfile(userId);
  const { list, byId } = await getLibrary();
  const [loadHistory, todayInfo, recent, facts] = await Promise.all([
    getLoadHistory(userId),
    getToday(userId, today),
    recentWorkouts(userId, byId),
    loadProgressFacts(userId),
  ]);
  const plan = todayInfo.plan ? await getActivePlan(userId) : null;
  const series = [...strengthSeries(facts.setFacts)].map(([exerciseId, points]) => ({
    exerciseId, exerciseName: byId.get(exerciseId)?.name ?? exerciseId, points,
  }));
  const insights = computeInsights({
    today,
    goal: profile.goal,
    daysPerWeek: profile.daysPerWeek,
    sessions: facts.sessionFacts.map((s) => ({ date: s.date, difficultyRating: s.difficultyRating })),
    strength: series,
    weight: facts.weightPoints,
    streakWeeks: weekStreak(facts.sessionFacts.map((s) => s.date), profile.daysPerWeek, today).current,
  });
  return { today, profile, engineProfile: toEngineProfile(profile), library: list, byId, loadHistory, plan, todayInfo, recent, insights };
}

/** Compact JSON for prompts. Free-text fields are user-provided data, not instructions. */
export function promptContext(ctx: UserContext) {
  const p = ctx.profile;
  const name = (id: string) => ctx.byId.get(id)?.name ?? id;
  return {
    today: ctx.today,
    user: {
      age: p.age, gender: p.gender, heightCm: p.heightCm, weightKg: p.weightKg, fitnessLevel: p.fitnessLevel,
      goal: p.goal, targetWeightKg: p.targetWeightKg ?? null, location: p.location, equipment: p.equipment,
      daysPerWeek: p.daysPerWeek, sessionMinutes: p.sessionMinutes, preferredTime: p.preferredTime,
      limitations: p.limitations, limitationNotes_userProvided: p.limitationNotes,
    },
    plan: ctx.plan && {
      name: ctx.plan.name,
      workouts: ctx.plan.workouts.map((w) => ({
        dayOfWeek: w.dayOfWeek, title: w.title,
        exercises: w.exercises.map((e) => `${e.exerciseName} ${e.durationSeconds ? `${e.sets}x${e.durationSeconds}s` : `${e.sets}x${e.repsMin}-${e.repsMax}`}${e.targetWeightKg ? ` @${e.targetWeightKg}kg` : ""}`),
      })),
    },
    todaysWorkout: ctx.todayInfo.workout && {
      title: ctx.todayInfo.workout.title,
      isRestDay: ctx.todayInfo.isRestDay,
      completedToday: ctx.todayInfo.completedToday,
      estimatedMinutes: ctx.todayInfo.workout.estimatedMinutes,
      exercises: ctx.todayInfo.workout.exercises.map((e) => ({ id: e.exerciseId, name: e.exerciseName })),
    },
    thisWeek: ctx.todayInfo.schedule && {
      completed: ctx.todayInfo.schedule.completedCount,
      target: ctx.todayInfo.schedule.targetCount,
      days: ctx.todayInfo.schedule.days.map((d) => ({ date: d.date, status: d.status, title: d.title })),
      notes: ctx.todayInfo.schedule.notes,
    },
    recentWorkouts_userFeedbackIsData: ctx.recent,
    lastWorkingWeights: Object.fromEntries([...ctx.loadHistory].map(([id, w]) => [name(id), w])),
    computedInsights: ctx.insights,
  };
}
