import { z } from "zod";

export const GENDERS = ["male", "female", "non_binary", "prefer_not_to_say"] as const;
export const FITNESS_LEVELS = ["beginner", "intermediate", "advanced"] as const;
export const GOALS = [
  "weight_loss",
  "muscle_gain",
  "strength",
  "endurance",
  "general_fitness",
  "body_recomposition",
] as const;
export const WORKOUT_LOCATIONS = ["home", "gym"] as const;

/** Equipment the user can select. `full_gym` implies every other item. */
export const EQUIPMENT = [
  "none",
  "dumbbells",
  "barbell",
  "resistance_bands",
  "machines",
  "full_gym",
] as const;

/**
 * Equipment an individual exercise can require. `cable` and `kettlebell`
 * are only available through `full_gym`; `pullup_bar` and `bench` are
 * treated as part of a gym setup.
 */
export const EXERCISE_EQUIPMENT = [
  "bodyweight",
  "dumbbell",
  "barbell",
  "resistance_band",
  "machine",
  "cable",
  "kettlebell",
  "pullup_bar",
] as const;

export const PREFERRED_TIMES = ["morning", "afternoon", "evening", "flexible"] as const;

/**
 * Movement restrictions a user can opt into. These are preferences used to
 * filter exercises — they are not diagnoses.
 */
export const LIMITATIONS = [
  "avoid_overhead",
  "avoid_jumping",
  "avoid_deep_knee_flexion",
  "avoid_spinal_loading",
  "avoid_floor_work",
  "avoid_running",
  "wrist_friendly",
] as const;

export const MUSCLES = [
  "chest",
  "back",
  "lats",
  "traps",
  "shoulders",
  "rear_delts",
  "biceps",
  "triceps",
  "forearms",
  "core",
  "obliques",
  "lower_back",
  "glutes",
  "quadriceps",
  "hamstrings",
  "calves",
  "hip_flexors",
  "adductors",
  "full_body",
] as const;

export const MOVEMENT_PATTERNS = [
  "squat",
  "hinge",
  "lunge",
  "horizontal_push",
  "vertical_push",
  "horizontal_pull",
  "vertical_pull",
  "elbow_flexion",
  "elbow_extension",
  "shoulder_isolation",
  "chest_isolation",
  "knee_extension",
  "knee_flexion",
  "calf_raise",
  "core_anti_extension",
  "core_flexion",
  "core_rotation",
  "carry",
  "conditioning",
] as const;

export const EXERCISE_CATEGORIES = ["strength", "cardio", "core", "mobility"] as const;
export const DIFFICULTIES = FITNESS_LEVELS;

/** Session-level perceived difficulty (1 = very easy, 5 = too hard). */
export const DIFFICULTY_RATING_MIN = 1;
export const DIFFICULTY_RATING_MAX = 5;

export const genderSchema = z.enum(GENDERS);
export const fitnessLevelSchema = z.enum(FITNESS_LEVELS);
export const goalSchema = z.enum(GOALS);
export const workoutLocationSchema = z.enum(WORKOUT_LOCATIONS);
export const equipmentSchema = z.enum(EQUIPMENT);
export const exerciseEquipmentSchema = z.enum(EXERCISE_EQUIPMENT);
export const preferredTimeSchema = z.enum(PREFERRED_TIMES);
export const limitationSchema = z.enum(LIMITATIONS);
export const muscleSchema = z.enum(MUSCLES);
export const movementPatternSchema = z.enum(MOVEMENT_PATTERNS);
export const exerciseCategorySchema = z.enum(EXERCISE_CATEGORIES);

export type Gender = z.infer<typeof genderSchema>;
export type FitnessLevel = z.infer<typeof fitnessLevelSchema>;
export type Goal = z.infer<typeof goalSchema>;
export type WorkoutLocation = z.infer<typeof workoutLocationSchema>;
export type Equipment = z.infer<typeof equipmentSchema>;
export type ExerciseEquipment = z.infer<typeof exerciseEquipmentSchema>;
export type PreferredTime = z.infer<typeof preferredTimeSchema>;
export type Limitation = z.infer<typeof limitationSchema>;
export type Muscle = z.infer<typeof muscleSchema>;
export type MovementPattern = z.infer<typeof movementPatternSchema>;
export type ExerciseCategory = z.infer<typeof exerciseCategorySchema>;
