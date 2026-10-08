import type { Exercise, ExerciseEquipment, FitnessLevel, Limitation } from "@gymfit/shared";
import type { EngineProfile } from "./types.js";

const EQUIPMENT_MAP: Record<EngineProfile["equipment"][number], ExerciseEquipment[]> = {
  none: [],
  dumbbells: ["dumbbell"],
  barbell: ["barbell"],
  resistance_bands: ["resistance_band"],
  machines: ["machine", "cable"],
  full_gym: ["dumbbell", "barbell", "resistance_band", "machine", "cable", "kettlebell", "pullup_bar"],
};

/** Exercise-level equipment the user can use. Bodyweight is always available. */
export function availableEquipment(profile: Pick<EngineProfile, "equipment">): Set<ExerciseEquipment> {
  const set = new Set<ExerciseEquipment>(["bodyweight"]);
  for (const item of profile.equipment) for (const e of EQUIPMENT_MAP[item]) set.add(e);
  return set;
}

export function hasEquipment(ex: Exercise, available: Set<ExerciseEquipment>): boolean {
  return ex.equipment.every((e) => available.has(e));
}

export function respectsLimitations(ex: Exercise, limitations: readonly Limitation[]): boolean {
  return !ex.contraindications.some((c) => limitations.includes(c));
}

const LEVEL_RANK: Record<FitnessLevel, number> = { beginner: 0, intermediate: 1, advanced: 2 };

export function levelRank(level: FitnessLevel): number {
  return LEVEL_RANK[level];
}

export function suitableForLevel(ex: Exercise, level: FitnessLevel): boolean {
  return LEVEL_RANK[ex.difficulty] <= LEVEL_RANK[level];
}

/** Everything the user can safely and practically perform. */
export function eligibleExercises(library: readonly Exercise[], profile: EngineProfile): Exercise[] {
  const available = availableEquipment(profile);
  return library.filter(
    (ex) => hasEquipment(ex, available) && respectsLimitations(ex, profile.limitations) && suitableForLevel(ex, profile.fitnessLevel),
  );
}
