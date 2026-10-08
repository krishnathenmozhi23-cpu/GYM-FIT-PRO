import { EXERCISE_EQUIPMENT_LABELS, MUSCLE_LABELS, PATTERN_LABELS, type Exercise, type ExerciseAlternative } from "@gymfit/shared";
import { availableEquipment, hasEquipment, levelRank, respectsLimitations } from "./filters.js";
import type { EngineProfile } from "./types.js";

/**
 * Ranks substitutes for an exercise. Same movement pattern matters most,
 * then shared primary muscles. Exercises that conflict with the user's
 * limitations are never suggested; unavailable equipment is ranked last
 * and flagged so the UI can show it as "needs X".
 */
export function findAlternatives(
  target: Exercise,
  library: readonly Exercise[],
  profile: Pick<EngineProfile, "equipment" | "limitations" | "fitnessLevel"> | null,
  limit = 5,
): ExerciseAlternative[] {
  const available = profile ? availableEquipment(profile) : null;
  const scored = library
    .filter((ex) => ex.id !== target.id)
    .filter((ex) => !profile || respectsLimitations(ex, profile.limitations))
    .map((ex) => {
      const samePattern = ex.pattern === target.pattern;
      const shared = ex.primaryMuscles.filter((m) => target.primaryMuscles.includes(m));
      if (!samePattern && shared.length === 0) return null;
      let score = (samePattern ? 10 : 0) + shared.length * 3;
      if (ex.mechanics === target.mechanics) score += 1;
      const isAvailable = available ? hasEquipment(ex, available) : true;
      if (isAvailable) score += 20;
      if (profile && levelRank(ex.difficulty) > levelRank(profile.fitnessLevel)) score -= 6;
      const reasonParts = [
        samePattern ? `Same movement (${PATTERN_LABELS[ex.pattern].toLowerCase()})` : `Also works ${shared.map((m) => MUSCLE_LABELS[m].toLowerCase()).join(", ")}`,
        `uses ${ex.equipment.map((e) => EXERCISE_EQUIPMENT_LABELS[e].toLowerCase()).join(" + ")}`,
      ];
      if (!isAvailable) reasonParts.push("needs equipment you haven't selected");
      return { ex, score, isAvailable, reason: reasonParts.join(" · ") };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.score - a.score || a.ex.name.localeCompare(b.ex.name));

  return scored.slice(0, limit).map((s) => ({ exercise: s.ex, available: s.isAvailable, reason: s.reason }));
}
