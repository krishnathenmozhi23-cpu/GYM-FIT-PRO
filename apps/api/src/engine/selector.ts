import type { Exercise, ExerciseEquipment, FitnessLevel, WorkoutLocation } from "@gymfit/shared";
import { levelRank } from "./filters.js";
import type { Slot } from "./types.js";

const EQUIPMENT_PREF: Record<WorkoutLocation, Record<"main" | "accessory", Partial<Record<ExerciseEquipment, number>>>> = {
  gym: {
    main: { barbell: 5, dumbbell: 4, pullup_bar: 4, machine: 3, cable: 3, kettlebell: 3, bodyweight: 2, resistance_band: 1 },
    accessory: { cable: 5, dumbbell: 4, machine: 4, barbell: 3, kettlebell: 3, pullup_bar: 3, bodyweight: 2, resistance_band: 1 },
  },
  home: {
    main: { barbell: 5, dumbbell: 5, kettlebell: 4, pullup_bar: 4, resistance_band: 3, bodyweight: 3, machine: 2, cable: 2 },
    accessory: { dumbbell: 5, resistance_band: 4, kettlebell: 3, bodyweight: 3, barbell: 3, pullup_bar: 3, machine: 2, cable: 2 },
  },
};

function equipmentScore(ex: Exercise, location: WorkoutLocation, role: Slot["role"]): number {
  const table = EQUIPMENT_PREF[location][role === "main" || role === "secondary" ? "main" : "accessory"];
  return Math.min(...ex.equipment.map((e) => table[e] ?? 0));
}

/**
 * Scores candidates for a slot. Higher is better. Deterministic so the same
 * profile always produces the same plan (variation comes from `variant`).
 */
export function scoreCandidate(ex: Exercise, slot: Slot, level: FitnessLevel, location: WorkoutLocation): number {
  let score = 0;
  // Earlier pattern in the slot list = preferred pattern.
  const patternIdx = slot.patterns.indexOf(ex.pattern);
  score += (slot.patterns.length - patternIdx) * 4;
  if (slot.mechanics && ex.mechanics === slot.mechanics) score += 3;
  if (slot.muscles?.length) {
    score += ex.primaryMuscles.some((m) => slot.muscles!.includes(m)) ? 4 : 0;
  }
  // Prefer exercises at the user's level, then one below.
  const gap = levelRank(level) - levelRank(ex.difficulty);
  score += gap === 0 ? 2 : gap === 1 ? 1 : 0;
  score += equipmentScore(ex, location, slot.role);
  // Main lifts: prefer loadable movements so progress can be tracked in kg.
  if ((slot.role === "main" || slot.role === "secondary") && ex.loaded) score += 2;
  // Core slots: prefer reps/time core work over carries unless asked.
  if (slot.role === "core" && ex.category === "core") score += 1;
  return score;
}

/**
 * Picks the best exercise for a slot that isn't already used. `variant`
 * rotates among the top candidates so repeated templates (e.g. PPL ×2)
 * get different exercises.
 */
export function selectForSlot(
  candidates: readonly Exercise[],
  slot: Slot,
  opts: { level: FitnessLevel; location: WorkoutLocation; exclude: Set<string>; variant: number },
): Exercise | null {
  const matching = candidates.filter((ex) => slot.patterns.includes(ex.pattern) && !opts.exclude.has(ex.id));
  if (matching.length === 0) return null;
  const ranked = matching
    .map((ex) => ({ ex, score: scoreCandidate(ex, slot, opts.level, opts.location) }))
    .sort((a, b) => b.score - a.score || a.ex.id.localeCompare(b.ex.id));
  const pool = ranked.slice(0, Math.min(ranked.length, 3));
  return pool[opts.variant % pool.length]!.ex;
}
