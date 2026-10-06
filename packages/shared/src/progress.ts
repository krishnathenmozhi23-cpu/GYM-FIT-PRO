import { z } from "zod";

const isoDate = z.iso.date();

export const weightEntrySchema = z.object({
  recordedOn: isoDate,
  weightKg: z.number().min(30).max(300),
  bodyFatPct: z.number().min(2).max(70).nullable().default(null),
  note: z.string().trim().max(240).default(""),
});
export type WeightEntryInput = z.infer<typeof weightEntrySchema>;

export const MEASUREMENT_SITES = ["chest", "waist", "hips", "arm", "thigh", "neck"] as const;
export type MeasurementSite = (typeof MEASUREMENT_SITES)[number];

const cm = z.number().min(10).max(250).nullable().default(null);
export const measurementEntrySchema = z
  .object({
    recordedOn: isoDate,
    chestCm: cm,
    waistCm: cm,
    hipsCm: cm,
    armCm: cm,
    thighCm: cm,
    neckCm: cm,
  })
  .refine(
    (m) => [m.chestCm, m.waistCm, m.hipsCm, m.armCm, m.thighCm, m.neckCm].some((v) => v !== null),
    { message: "Provide at least one measurement" },
  );
export type MeasurementEntryInput = z.infer<typeof measurementEntrySchema>;

export const progressEntrySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("weight"), data: weightEntrySchema }),
  z.object({ type: z.literal("measurement"), data: measurementEntrySchema }),
]);

export interface WeightPoint {
  date: string;
  weightKg: number;
  bodyFatPct: number | null;
}

export interface MeasurementPoint {
  date: string;
  chestCm: number | null;
  waistCm: number | null;
  hipsCm: number | null;
  armCm: number | null;
  thighCm: number | null;
  neckCm: number | null;
}

export interface WeeklyActivityPoint {
  weekStart: string;
  workouts: number;
  minutes: number;
  /** Rough estimate from MET values; see API docs for the method. */
  estimatedKcal: number | null;
  volumeKg: number;
}

export interface StrengthPoint {
  date: string;
  /** Estimated one-rep max (Epley) from the best set of the day. */
  estimated1RmKg: number;
  bestWeightKg: number;
  bestReps: number;
}

export interface StrengthSeries {
  exerciseId: string;
  exerciseName: string;
  points: StrengthPoint[];
}

export interface BmiInfo {
  value: number;
  /** WHO adult category. Informational only. */
  category: "underweight" | "healthy" | "overweight" | "obese";
}

export interface GoalProgress {
  goal: string;
  label: string;
  /** 0–100 or null when there is nothing measurable yet. */
  percent: number | null;
  detail: string;
}

export interface ProgressOverview {
  currentWeightKg: number | null;
  startWeightKg: number | null;
  bmi: BmiInfo | null;
  totalWorkouts: number;
  currentStreakDays: number;
  longestStreakDays: number;
  thisWeek: { completed: number; target: number };
  goal: GoalProgress;
  weight: WeightPoint[];
  measurements: MeasurementPoint[];
  weeklyActivity: WeeklyActivityPoint[];
  strength: StrengthSeries[];
}
