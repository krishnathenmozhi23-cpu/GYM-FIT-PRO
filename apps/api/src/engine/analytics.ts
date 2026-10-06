import type { BmiInfo, GoalProgress, StrengthPoint, WeeklyActivityPoint } from "@gymfit/shared";
import { GOAL_LABELS, type Goal } from "@gymfit/shared";
import { addDays, startOfWeek } from "../lib/dates.js";

/**
 * Estimated one-rep max (Epley: w × (1 + reps/30)). Only computed for
 * 1–12 reps, where rep-max formulas are reasonably reliable.
 */
export function epley1Rm(weightKg: number, reps: number): number | null {
  if (weightKg <= 0 || reps < 1 || reps > 12) return null;
  return reps === 1 ? weightKg : weightKg * (1 + reps / 30);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** BMI with WHO adult categories. Informational only; adult cut-offs don't apply under 18. */
export function bmi(heightCm: number, weightKg: number, age: number): BmiInfo {
  const value = round1(weightKg / (heightCm / 100) ** 2);
  const category =
    age < 18 ? null : value < 18.5 ? "underweight" : value < 25 ? "healthy" : value < 30 ? "overweight" : "obese";
  return { value, category };
}

/**
 * MET used for the rough calorie estimate. ~3.5 corresponds to general
 * resistance training in the Compendium of Physical Activities; real
 * expenditure varies widely, so the UI labels this as an estimate.
 */
export const RESISTANCE_TRAINING_MET = 3.5;

export function estimateKcal(durationSeconds: number, bodyWeightKg: number | null): number | null {
  if (!bodyWeightKg) return null;
  return Math.round(RESISTANCE_TRAINING_MET * bodyWeightKg * (durationSeconds / 3600));
}

export interface SessionFact {
  date: string; // local date
  durationSeconds: number;
  volumeKg: number;
}

export function weeklyActivity(sessions: SessionFact[], bodyWeightKg: number | null, today: string, weeks = 8): WeeklyActivityPoint[] {
  const thisWeek = startOfWeek(today);
  return Array.from({ length: weeks }, (_, i) => {
    const weekStart = addDays(thisWeek, -7 * (weeks - 1 - i));
    const weekEnd = addDays(weekStart, 6);
    const inWeek = sessions.filter((s) => s.date >= weekStart && s.date <= weekEnd);
    const seconds = inWeek.reduce((n, s) => n + s.durationSeconds, 0);
    return {
      weekStart,
      workouts: inWeek.length,
      minutes: Math.round(seconds / 60),
      estimatedKcal: inWeek.length ? estimateKcal(seconds, bodyWeightKg) : 0,
      volumeKg: Math.round(inWeek.reduce((n, s) => n + s.volumeKg, 0)),
    };
  });
}

/**
 * Streak in weeks: consecutive weeks meeting the weekly target. The current
 * week counts once met, and an unfinished current week never breaks it.
 * (A day streak would punish planned rest days.)
 */
export function weekStreak(sessionDates: string[], weeklyTarget: number, today: string): { current: number; longest: number } {
  if (weeklyTarget <= 0 || sessionDates.length === 0) return { current: 0, longest: 0 };
  const counts = new Map<string, number>();
  for (const d of sessionDates) {
    const w = startOfWeek(d);
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  const thisWeek = startOfWeek(today);
  const earliest = [...counts.keys()].sort()[0]!;
  let longest = 0;
  let run = 0;
  for (let w = earliest; w <= thisWeek; w = addDays(w, 7)) {
    if ((counts.get(w) ?? 0) >= weeklyTarget) {
      run += 1;
      longest = Math.max(longest, run);
    } else if (w !== thisWeek) {
      run = 0;
    }
  }
  return { current: run, longest };
}

export interface SetFact {
  exerciseId: string;
  date: string;
  weightKg: number;
  reps: number;
}

/** Best estimated 1RM per exercise per day, for loaded exercises. */
export function strengthSeries(sets: SetFact[]): Map<string, StrengthPoint[]> {
  const best = new Map<string, Map<string, StrengthPoint>>();
  for (const s of sets) {
    const e1rm = epley1Rm(s.weightKg, s.reps);
    if (e1rm === null) continue;
    const byDate = best.get(s.exerciseId) ?? new Map<string, StrengthPoint>();
    const cur = byDate.get(s.date);
    if (!cur || e1rm > cur.estimated1RmKg) {
      byDate.set(s.date, { date: s.date, estimated1RmKg: round1(e1rm), bestWeightKg: s.weightKg, bestReps: s.reps });
    }
    best.set(s.exerciseId, byDate);
  }
  return new Map([...best].map(([id, m]) => [id, [...m.values()].sort((a, b) => a.date.localeCompare(b.date))]));
}

export function goalProgress(input: {
  goal: Goal;
  startWeightKg: number | null;
  currentWeightKg: number | null;
  targetWeightKg: number | null;
  workoutsLast4Weeks: number;
  daysPerWeek: number;
}): GoalProgress {
  const label = GOAL_LABELS[input.goal];
  const { startWeightKg: start, currentWeightKg: cur, targetWeightKg: target } = input;
  const weightGoal = ["weight_loss", "muscle_gain", "body_recomposition"].includes(input.goal);
  if (weightGoal && start !== null && cur !== null && target !== null && start !== target) {
    const pct = ((start - cur) / (start - target)) * 100;
    const clamped = Math.max(0, Math.min(100, Math.round(pct)));
    return {
      goal: input.goal,
      label,
      percent: clamped,
      detail: `${round1(Math.abs(cur - start))} kg ${cur <= start ? "down" : "up"} of ${round1(Math.abs(target - start))} kg (${start} → ${target} kg)`,
    };
  }
  const planned = input.daysPerWeek * 4;
  return {
    goal: input.goal,
    label,
    percent: planned ? Math.min(100, Math.round((input.workoutsLast4Weeks / planned) * 100)) : null,
    detail: `${input.workoutsLast4Weeks} of ${planned} planned workouts in the last 4 weeks`,
  };
}
