import type { Exercise, GeneratedPlan, PlannedWorkout } from "@gymfit/shared";
import { eligibleExercises } from "../engine/filters.js";
import { estimateWorkoutMinutes } from "../engine/prescription.js";
import type { EngineProfile } from "../engine/types.js";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

/** Safety caps applied to anything an LLM proposes. */
export const LIMITS = {
  maxSetsPerWorkout: 30,
  maxSetsPerExercise: 6,
  minRestCompoundSeconds: 45,
  durationToleranceMinutes: 10,
  /** Max relative jump in a suggested load vs. the user's last working weight. */
  maxLoadIncreaseRatio: 0.1,
} as const;

/**
 * Domain validation for an LLM workout. Schema validity is already
 * guaranteed by Zod; this checks that it is safe and possible for *this*
 * user: known exercises, available equipment, limitations, level, time
 * budget, sane volume and conservative loads.
 */
export function validateWorkout(
  w: PlannedWorkout,
  ctx: { profile: EngineProfile; library: readonly Exercise[]; budgetMinutes: number; loadHistory: ReadonlyMap<string, number> },
  label = w.title,
): string[] {
  const errors: string[] = [];
  const eligible = new Map(eligibleExercises(ctx.library, ctx.profile).map((e) => [e.id, e]));
  const byId = new Map(ctx.library.map((e) => [e.id, e]));
  const seen = new Set<string>();
  let totalSets = 0;

  for (const e of w.exercises) {
    const ex = byId.get(e.exerciseId);
    if (!ex) {
      errors.push(`${label}: unknown exercise "${e.exerciseId}"`);
      continue;
    }
    if (!eligible.has(e.exerciseId)) errors.push(`${label}: ${ex.name} is not allowed for this user (equipment, limitations or level)`);
    if (seen.has(e.exerciseId)) errors.push(`${label}: ${ex.name} appears twice`);
    seen.add(e.exerciseId);
    if (e.repsMin > e.repsMax) errors.push(`${label}: ${ex.name} has repsMin > repsMax`);
    if (e.sets > LIMITS.maxSetsPerExercise) errors.push(`${label}: ${ex.name} has too many sets`);
    if (ex.measure === "time" && !e.durationSeconds) errors.push(`${label}: ${ex.name} is time-based but has no duration`);
    if (ex.mechanics === "compound" && ex.loaded && e.restSeconds < LIMITS.minRestCompoundSeconds) {
      errors.push(`${label}: rest for ${ex.name} is too short`);
    }
    if (e.targetWeightKg !== null) {
      if (!ex.loaded) errors.push(`${label}: ${ex.name} is not a loaded exercise`);
      const last = ctx.loadHistory.get(e.exerciseId);
      if (last === undefined) errors.push(`${label}: no history to justify a load for ${ex.name}`);
      else if (e.targetWeightKg > last * (1 + LIMITS.maxLoadIncreaseRatio) + 0.01) {
        errors.push(`${label}: suggested load for ${ex.name} jumps more than 10% above the last working weight`);
      }
    }
    totalSets += e.sets;
  }
  if (totalSets > LIMITS.maxSetsPerWorkout) errors.push(`${label}: ${totalSets} total sets is excessive`);
  const minutes = estimateWorkoutMinutes(w.exercises);
  if (minutes > ctx.budgetMinutes + LIMITS.durationToleranceMinutes) {
    errors.push(`${label}: estimated ${minutes} min exceeds the ${ctx.budgetMinutes}-min budget`);
  }
  return errors;
}

export function validatePlan(
  plan: GeneratedPlan,
  ctx: { profile: EngineProfile; library: readonly Exercise[]; loadHistory: ReadonlyMap<string, number> },
): ValidationResult {
  const errors: string[] = [];
  if (plan.workouts.length !== ctx.profile.daysPerWeek) {
    errors.push(`Plan has ${plan.workouts.length} workouts but the user trains ${ctx.profile.daysPerWeek} days/week`);
  }
  const days = plan.workouts.map((w) => w.dayOfWeek);
  if (new Set(days).size !== days.length) errors.push("Two workouts are scheduled on the same day");
  for (const w of plan.workouts) {
    errors.push(...validateWorkout(w, { ...ctx, budgetMinutes: ctx.profile.sessionMinutes }));
  }
  return { ok: errors.length === 0, errors };
}
