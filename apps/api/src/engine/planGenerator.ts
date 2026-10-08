import { GOAL_LABELS, type Exercise, type GeneratedPlan, type PlannedWorkout, type PrescribedExercise } from "@gymfit/shared";
import { eligibleExercises } from "./filters.js";
import {
  estimateExerciseSeconds,
  FIRST_SESSION_NOTE,
  prescribe,
  WARMUP_SECONDS,
} from "./prescription.js";
import { selectForSlot } from "./selector.js";
import { chooseSplit, TEMPLATES, WEEKDAY_LAYOUT, type TemplateKey } from "./templates.js";
import type { DayTemplate, EngineProfile, ExerciseLibrary, Slot } from "./types.js";

/** Latest working weight per exercise, used to seed suggested loads. */
export type LoadHistory = ReadonlyMap<string, number>;

const MIN_EXERCISES = 3;

function includeConditioning(profile: EngineProfile): boolean {
  return ["weight_loss", "endurance", "general_fitness", "body_recomposition"].includes(profile.goal);
}

interface BuildOptions {
  profile: EngineProfile;
  candidates: readonly Exercise[];
  budgetMinutes: number;
  variant: number;
  history: LoadHistory;
  /** Exercises already used elsewhere in the plan; avoided when alternatives exist. */
  usedInPlan?: Set<string>;
  forceConditioning?: boolean;
}

/**
 * Fills a day template slot-by-slot in priority order, stopping when the
 * next exercise would exceed the time budget.
 */
export function buildDay(template: DayTemplate, opts: BuildOptions): { exercises: PrescribedExercise[]; skippedSlots: Slot[] } {
  const { profile, candidates } = opts;
  const budget = opts.budgetMinutes * 60;
  const used = new Set<string>();
  const exercises: PrescribedExercise[] = [];
  const roles: Slot["role"][] = [];
  const skippedSlots: Slot[] = [];
  let elapsed = WARMUP_SECONDS;
  const wantConditioning = opts.forceConditioning ?? includeConditioning(profile);

  for (const slot of template.slots) {
    if (slot.role === "conditioning" && !wantConditioning) continue;
    // Main lifts may repeat across the week (practice matters); other slots
    // prefer exercises not used elsewhere in the plan, falling back if needed.
    const avoidRepeats = slot.role !== "main" || opts.variant > 0;
    const exclude = new Set([...used, ...(avoidRepeats ? (opts.usedInPlan ?? []) : [])]);
    const ex =
      selectForSlot(candidates, slot, { level: profile.fitnessLevel, location: profile.location, exclude, variant: opts.variant }) ??
      selectForSlot(candidates, slot, { level: profile.fitnessLevel, location: profile.location, exclude: used, variant: opts.variant });
    if (!ex) {
      skippedSlots.push(slot);
      continue;
    }
    const base = prescribe(ex, slot.role, profile.goal, profile.fitnessLevel);
    const lastLoad = ex.loaded ? opts.history.get(ex.id) : undefined;
    const p: PrescribedExercise = {
      exerciseId: ex.id,
      ...base,
      targetWeightKg: lastLoad ?? null,
      note: ex.loaded && lastLoad === undefined ? FIRST_SESSION_NOTE : "",
    };
    let cost = estimateExerciseSeconds(p);
    if (elapsed + cost > budget && exercises.length >= MIN_EXERCISES) {
      // Try a trimmed version (one fewer set) before giving up on this slot.
      if (p.sets > 2) {
        p.sets -= 1;
        cost = estimateExerciseSeconds(p);
      }
      if (elapsed + cost > budget) continue;
    }
    exercises.push(p);
    roles.push(slot.role);
    used.add(ex.id);
    elapsed += cost;
  }

  // Spare time: add sets to the most important lifts first, within caps.
  // Core and conditioning work is never padded.
  const caps: Partial<Record<Slot["role"], number>> =
    profile.fitnessLevel === "beginner" ? { main: 4, secondary: 3, accessory: 3 } : { main: 5, secondary: 4, accessory: 4 };
  for (const role of ["main", "secondary", "accessory"] as const) {
    let added = true;
    while (added) {
      added = false;
      for (const [i, e] of exercises.entries()) {
        if (roles[i] !== role || e.durationSeconds !== null || e.sets >= (caps[role] ?? 0)) continue;
        const extra = estimateExerciseSeconds({ ...e, sets: e.sets + 1 }) - estimateExerciseSeconds(e);
        if (elapsed + extra > budget - 3 * 60) continue; // keep a few minutes of slack
        e.sets += 1;
        elapsed += extra;
        added = true;
      }
    }
  }

  // Very short sessions: trim sets until we fit, keeping at least 2 sets each.
  while (elapsed > budget && exercises.some((e) => e.sets > 2)) {
    const target = [...exercises].reverse().find((e) => e.sets > 2)!;
    elapsed -= estimateExerciseSeconds(target);
    target.sets -= 1;
    elapsed += estimateExerciseSeconds(target);
  }
  return { exercises, skippedSlots };
}

export interface PlanGenerationResult {
  plan: GeneratedPlan;
  warnings: string[];
}

/** Deterministic weekly plan from the profile + exercise library. */
export function generatePlan(library: ExerciseLibrary, profile: EngineProfile, history: LoadHistory = new Map()): PlanGenerationResult {
  const candidates = eligibleExercises(library, profile);
  const split = chooseSplit(profile.daysPerWeek, profile.fitnessLevel, profile.goal);
  const weekdays = WEEKDAY_LAYOUT[profile.daysPerWeek] ?? WEEKDAY_LAYOUT[3]!;
  const warnings: string[] = [];
  const usedInPlan = new Set<string>();
  const seen = new Map<TemplateKey, number>();

  const workouts: PlannedWorkout[] = split.days.map((key, i) => {
    const template = TEMPLATES[key];
    const variant = seen.get(key) ?? 0;
    seen.set(key, variant + 1);
    const { exercises, skippedSlots } = buildDay(template, {
      profile,
      candidates,
      budgetMinutes: profile.sessionMinutes,
      variant,
      history,
      usedInPlan,
    });
    exercises.forEach((e) => usedInPlan.add(e.exerciseId));
    const mainSkipped = skippedSlots.filter((s) => s.role === "main" || s.role === "secondary");
    if (mainSkipped.length) {
      warnings.push(
        `${template.title}: no suitable exercise for ${mainSkipped.map((s) => s.patterns[0]!.replace(/_/g, " ")).join(", ")} with your equipment/limitations.`,
      );
    }
    return {
      dayOfWeek: weekdays[i] ?? i,
      title: variant > 0 ? `${template.title} (B)` : template.title,
      focus: template.focus,
      exercises,
    };
  });

  const rationale = [
    split.rationale,
    `Sets, reps and rest are tuned for ${GOAL_LABELS[profile.goal].toLowerCase()} at ${profile.fitnessLevel} level,`,
    `and each session is sized to fit about ${profile.sessionMinutes} minutes including a 5-minute warm-up.`,
    profile.limitations.length ? "Exercises that conflict with your selected limitations are excluded." : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    plan: {
      name: `${GOAL_LABELS[profile.goal]} · ${split.splitType}`,
      splitType: split.splitType,
      rationale,
      workouts,
    },
    warnings,
  };
}
