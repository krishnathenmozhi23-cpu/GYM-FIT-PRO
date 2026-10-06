import type { DailyWorkoutRequest, PlannedWorkout, PrescribedExercise } from "@gymfit/shared";
import { eligibleExercises } from "./filters.js";
import { buildDay, type LoadHistory } from "./planGenerator.js";
import { estimateExerciseSeconds, WARMUP_SECONDS } from "./prescription.js";
import { TEMPLATES, type TemplateKey } from "./templates.js";
import type { EngineProfile, ExerciseLibrary } from "./types.js";

const FOCUS_TEMPLATE: Record<NonNullable<DailyWorkoutRequest["focus"]>, TemplateKey> = {
  upper: "upperA",
  lower: "lowerA",
  full_body: "fullBodyA",
  push: "push",
  pull: "pull",
  legs: "legs",
  core: "core",
  conditioning: "conditioning",
};

/** A one-off workout for a given focus and time budget. */
export function generateQuickWorkout(
  library: ExerciseLibrary,
  profile: EngineProfile,
  request: { minutes: number; focus: NonNullable<DailyWorkoutRequest["focus"]> },
  history: LoadHistory = new Map(),
  dayOfWeek = 0,
): PlannedWorkout {
  const template = TEMPLATES[FOCUS_TEMPLATE[request.focus]];
  const { exercises } = buildDay(template, {
    profile,
    candidates: eligibleExercises(library, profile),
    budgetMinutes: request.minutes,
    variant: 0,
    history,
    forceConditioning: request.focus === "conditioning" || request.focus === "core" ? true : undefined,
  });
  return {
    dayOfWeek,
    title: `${request.minutes}-min ${template.title}`,
    focus: template.focus,
    exercises,
  };
}

/**
 * Shrinks an existing workout to fit `minutes`: keeps exercises in order
 * (the plan lists the most important first), trims sets on later
 * exercises, then drops the lowest-priority ones.
 */
export function condenseWorkout(exercises: readonly PrescribedExercise[], minutes: number): PrescribedExercise[] {
  const budget = minutes * 60 - Math.min(WARMUP_SECONDS, minutes * 10);
  const result = exercises.map((e) => ({ ...e }));
  const total = () => result.reduce((s, e) => s + estimateExerciseSeconds(e), 0);
  for (let i = result.length - 1; i >= 0 && total() > budget; i--) {
    if (result[i]!.sets > 2) result[i]!.sets = 2;
  }
  while (result.length > 2 && total() > budget) result.pop();
  return result;
}

