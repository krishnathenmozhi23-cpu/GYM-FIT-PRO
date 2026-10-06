import { z } from "zod";
import { DIFFICULTY_RATING_MAX, DIFFICULTY_RATING_MIN, fitnessLevelSchema, goalSchema } from "./enums.js";

/** A single prescribed exercise inside a workout. */
export const prescribedExerciseSchema = z.object({
  exerciseId: z.string(),
  sets: z.number().int().min(1).max(6),
  repsMin: z.number().int().min(1).max(30),
  repsMax: z.number().int().min(1).max(30),
  /** Only for time-based exercises. */
  durationSeconds: z.number().int().min(10).max(600).nullable(),
  restSeconds: z.number().int().min(15).max(300),
  /** Suggested load in kg; null when there is not enough history yet. */
  targetWeightKg: z.number().min(0).max(500).nullable(),
  note: z.string().max(240).default(""),
});
export type PrescribedExercise = z.infer<typeof prescribedExerciseSchema>;

export const plannedWorkoutSchema = z.object({
  /** 0 = Monday ... 6 = Sunday */
  dayOfWeek: z.number().int().min(0).max(6),
  title: z.string().min(1).max(60),
  focus: z.array(z.string()).max(6),
  exercises: z.array(prescribedExerciseSchema).min(1).max(12),
});
export type PlannedWorkout = z.infer<typeof plannedWorkoutSchema>;

export const generatedPlanSchema = z.object({
  name: z.string().min(1).max(80),
  splitType: z.string().min(1).max(40),
  rationale: z.string().max(1200),
  workouts: z.array(plannedWorkoutSchema).min(1).max(6),
});
export type GeneratedPlan = z.infer<typeof generatedPlanSchema>;

export type PlanSource = "rule_engine" | "ai" | "dev_mock";

/** Rendered exercise inside a stored workout (joined with library data). */
export interface WorkoutExerciseView extends PrescribedExercise {
  id: string;
  position: number;
  exerciseName: string;
  primaryMuscles: string[];
  difficulty: z.infer<typeof fitnessLevelSchema>;
  measure: "reps" | "time";
  loaded: boolean;
  estimatedMinutes: number;
}

export interface WorkoutView {
  id: string;
  planId: string;
  dayOfWeek: number;
  position: number;
  title: string;
  focus: string[];
  estimatedMinutes: number;
  exercises: WorkoutExerciseView[];
}

export interface PlanView {
  id: string;
  name: string;
  goal: z.infer<typeof goalSchema>;
  splitType: string;
  rationale: string;
  source: PlanSource;
  createdAt: string;
  workouts: WorkoutView[];
}

export type ScheduledDayStatus = "completed" | "planned" | "rest" | "missed_rescheduled";

export interface ScheduledDay {
  date: string; // YYYY-MM-DD
  dayOfWeek: number;
  status: ScheduledDayStatus;
  workoutId: string | null;
  title: string | null;
  sessionId: string | null;
}

export interface WeekSchedule {
  weekStart: string;
  days: ScheduledDay[];
  completedCount: number;
  targetCount: number;
  /** Workouts that could not fit in the remaining days this week. */
  carriedOver: string[];
  notes: string[];
}

export interface TodayResponse {
  plan: { id: string; name: string } | null;
  workout: WorkoutView | null;
  isRestDay: boolean;
  activeSessionId: string | null;
  completedToday: boolean;
  schedule: WeekSchedule | null;
}

/* ---------- Sessions ---------- */

export const startSessionSchema = z.object({
  workoutId: z.uuid().optional(),
});

export const logSetSchema = z.object({
  sessionExerciseId: z.uuid(),
  reps: z.number().int().min(0).max(100).nullable(),
  weightKg: z.number().min(0).max(500).nullable(),
  durationSeconds: z.number().int().min(0).max(3600).nullable(),
});
export type LogSetInput = z.infer<typeof logSetSchema>;

export const updateSessionExerciseSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("skip") }),
  z.object({ action: z.literal("complete") }),
  z.object({ action: z.literal("replace"), exerciseId: z.string().min(1) }),
]);
export type UpdateSessionExerciseInput = z.infer<typeof updateSessionExerciseSchema>;

export const pauseSessionSchema = z.object({ paused: z.boolean() });

export const completeSessionSchema = z.object({
  difficultyRating: z.number().int().min(DIFFICULTY_RATING_MIN).max(DIFFICULTY_RATING_MAX),
  feedback: z.string().trim().max(1000).default(""),
});
export type CompleteSessionInput = z.infer<typeof completeSessionSchema>;

export interface SetView {
  id: string;
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  durationSeconds: number | null;
  completedAt: string;
}

export interface SessionExerciseView {
  id: string;
  position: number;
  exerciseId: string;
  exerciseName: string;
  primaryMuscles: string[];
  measure: "reps" | "time";
  loaded: boolean;
  status: "pending" | "completed" | "skipped";
  replacedFromName: string | null;
  prescription: {
    sets: number;
    repsMin: number;
    repsMax: number;
    durationSeconds: number | null;
    restSeconds: number;
    targetWeightKg: number | null;
  };
  sets: SetView[];
}

export interface SessionView {
  id: string;
  workoutId: string | null;
  title: string;
  status: "in_progress" | "completed" | "abandoned";
  startedAt: string;
  completedAt: string | null;
  pausedAt: string | null;
  pausedSeconds: number;
  durationSeconds: number | null;
  difficultyRating: number | null;
  feedback: string;
  exercises: SessionExerciseView[];
}

export interface AdaptationChange {
  exerciseId: string;
  exerciseName: string;
  kind: "increase_load" | "increase_reps" | "maintain" | "reduce_load" | "reduce_volume" | "increase_volume";
  from: string;
  to: string;
  reason: string;
}

export interface CompleteSessionResponse {
  session: SessionView;
  adaptations: AdaptationChange[];
}

export interface SessionSummary {
  id: string;
  title: string;
  startedAt: string;
  completedAt: string | null;
  durationSeconds: number | null;
  difficultyRating: number | null;
  setsCompleted: number;
  volumeKg: number;
}
