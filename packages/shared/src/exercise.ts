import { z } from "zod";
import {
  exerciseCategorySchema,
  exerciseEquipmentSchema,
  fitnessLevelSchema,
  limitationSchema,
  movementPatternSchema,
  muscleSchema,
} from "./enums.js";

export const exerciseSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: exerciseCategorySchema,
  pattern: movementPatternSchema,
  mechanics: z.enum(["compound", "isolation"]),
  primaryMuscles: z.array(muscleSchema).min(1),
  secondaryMuscles: z.array(muscleSchema),
  equipment: z.array(exerciseEquipmentSchema).min(1),
  difficulty: fitnessLevelSchema,
  /** How the exercise is measured. */
  measure: z.enum(["reps", "time"]),
  /** Whether external load is tracked in kg. */
  loaded: z.boolean(),
  /** Limitations that rule this exercise out. */
  contraindications: z.array(limitationSchema),
  instructions: z.array(z.string()).min(1),
  commonMistakes: z.array(z.string()).min(1),
});
export type Exercise = z.infer<typeof exerciseSchema>;

export interface ExerciseAlternative {
  exercise: Exercise;
  /** True when the user has the equipment needed for this alternative. */
  available: boolean;
  reason: string;
}

export interface ExerciseDetail extends Exercise {
  alternatives: ExerciseAlternative[];
}

export const exerciseFilterSchema = z.object({
  q: z.string().trim().max(60).optional(),
  muscle: muscleSchema.optional(),
  equipment: exerciseEquipmentSchema.optional(),
  difficulty: fitnessLevelSchema.optional(),
  category: exerciseCategorySchema.optional(),
  availableOnly: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});
export type ExerciseFilter = z.infer<typeof exerciseFilterSchema>;
