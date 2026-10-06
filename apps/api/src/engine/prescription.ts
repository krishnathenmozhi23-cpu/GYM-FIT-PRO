import type { Exercise, FitnessLevel, Goal, PrescribedExercise } from "@gymfit/shared";
import type { SlotRole } from "./types.js";

type Scheme = { sets: number; repsMin: number; repsMax: number; rest: number };

/** Evidence-informed defaults: lower reps/longer rest for strength, higher reps/shorter rest for endurance. */
const SCHEMES: Record<Goal, Record<"main" | "secondary" | "accessory", Scheme>> = {
  strength: {
    main: { sets: 4, repsMin: 3, repsMax: 6, rest: 180 },
    secondary: { sets: 3, repsMin: 6, repsMax: 8, rest: 120 },
    accessory: { sets: 3, repsMin: 8, repsMax: 12, rest: 75 },
  },
  muscle_gain: {
    main: { sets: 4, repsMin: 6, repsMax: 10, rest: 120 },
    secondary: { sets: 3, repsMin: 8, repsMax: 12, rest: 90 },
    accessory: { sets: 3, repsMin: 10, repsMax: 15, rest: 60 },
  },
  body_recomposition: {
    main: { sets: 3, repsMin: 6, repsMax: 10, rest: 120 },
    secondary: { sets: 3, repsMin: 8, repsMax: 12, rest: 90 },
    accessory: { sets: 3, repsMin: 10, repsMax: 15, rest: 60 },
  },
  general_fitness: {
    main: { sets: 3, repsMin: 8, repsMax: 12, rest: 90 },
    secondary: { sets: 3, repsMin: 10, repsMax: 12, rest: 75 },
    accessory: { sets: 2, repsMin: 12, repsMax: 15, rest: 60 },
  },
  weight_loss: {
    main: { sets: 3, repsMin: 8, repsMax: 12, rest: 75 },
    secondary: { sets: 3, repsMin: 10, repsMax: 15, rest: 60 },
    accessory: { sets: 2, repsMin: 12, repsMax: 15, rest: 45 },
  },
  endurance: {
    main: { sets: 3, repsMin: 12, repsMax: 15, rest: 60 },
    secondary: { sets: 2, repsMin: 15, repsMax: 20, rest: 45 },
    accessory: { sets: 2, repsMin: 15, repsMax: 20, rest: 45 },
  },
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Base sets/reps/rest for an exercise in a given role, before any history-based adaptation. */
export function prescribe(
  exercise: Exercise,
  role: SlotRole,
  goal: Goal,
  level: FitnessLevel,
): Omit<PrescribedExercise, "exerciseId" | "targetWeightKg" | "note"> {
  if (exercise.pattern === "conditioning") {
    const isMachine = exercise.equipment.includes("machine");
    if (isMachine) {
      const minutes = goal === "endurance" ? 10 : level === "beginner" ? 6 : 8;
      return { sets: 1, repsMin: 1, repsMax: 1, durationSeconds: minutes * 60, restSeconds: 60 };
    }
    return {
      sets: level === "beginner" ? 3 : 4,
      repsMin: 1,
      repsMax: 1,
      durationSeconds: level === "advanced" ? 40 : 30,
      restSeconds: level === "beginner" ? 45 : 30,
    };
  }

  if (exercise.measure === "time") {
    const base = exercise.pattern === "carry" ? 40 : level === "beginner" ? 25 : level === "intermediate" ? 40 : 50;
    return { sets: 3, repsMin: 1, repsMax: 1, durationSeconds: base, restSeconds: 60 };
  }

  if (role === "core") {
    return { sets: level === "beginner" ? 2 : 3, repsMin: 10, repsMax: 15, durationSeconds: null, restSeconds: 45 };
  }

  const key = role === "main" ? "main" : role === "secondary" ? "secondary" : "accessory";
  const s = { ...SCHEMES[goal][key] };

  // Isolation movements are safer and more effective at moderate-to-high reps.
  if (exercise.mechanics === "isolation" && s.repsMin < 8) {
    s.repsMin = 8;
    s.repsMax = Math.max(s.repsMax, 12);
  }
  // Beginners: modest volume and avoid very low rep ranges while learning technique.
  if (level === "beginner") {
    s.sets = Math.min(s.sets, 3);
    if (s.repsMin < 5) {
      s.repsMin = 5;
      s.repsMax = Math.max(s.repsMax, 8);
    }
  }
  if (level === "advanced" && role === "main") s.sets = Math.min(s.sets + 1, 5);
  // Easy bodyweight movements: higher reps compensate for the fixed load.
  // (Not applied to hard bodyweight lifts such as chin-ups.)
  if (!exercise.loaded && exercise.difficulty === "beginner" && exercise.mechanics === "compound" && s.repsMax < 12) {
    s.repsMin = Math.max(s.repsMin, 8);
    s.repsMax = 15;
  }
  return {
    sets: clamp(s.sets, 1, 6),
    repsMin: clamp(s.repsMin, 1, 30),
    repsMax: clamp(Math.max(s.repsMax, s.repsMin), 1, 30),
    durationSeconds: null,
    restSeconds: clamp(s.rest, 15, 300),
  };
}

/** Rough time cost of an exercise in seconds (work + rest between sets + setup). */
export function estimateExerciseSeconds(
  p: Pick<PrescribedExercise, "sets" | "repsMin" | "repsMax" | "durationSeconds" | "restSeconds">,
): number {
  const work = p.durationSeconds ?? ((p.repsMin + p.repsMax) / 2) * 3.5 + 10;
  return Math.round(p.sets * work + Math.max(0, p.sets - 1) * p.restSeconds + 60);
}

export const WARMUP_SECONDS = 5 * 60;

export function estimateWorkoutMinutes(exercises: Parameters<typeof estimateExerciseSeconds>[0][]): number {
  const total = WARMUP_SECONDS + exercises.reduce((sum, e) => sum + estimateExerciseSeconds(e), 0);
  return Math.round(total / 60);
}

export const FIRST_SESSION_NOTE =
  "Choose a weight you could lift for about 2–3 more reps than prescribed. We'll calibrate from your log.";
