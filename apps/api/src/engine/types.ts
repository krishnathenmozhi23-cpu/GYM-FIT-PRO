import type {
  Equipment,
  Exercise,
  FitnessLevel,
  Goal,
  Limitation,
  MovementPattern,
  Muscle,
  WorkoutLocation,
} from "@gymfit/shared";

/** The subset of the user profile the engine needs. */
export interface EngineProfile {
  fitnessLevel: FitnessLevel;
  goal: Goal;
  location: WorkoutLocation;
  equipment: Equipment[];
  daysPerWeek: number;
  sessionMinutes: number;
  limitations: Limitation[];
}

export type SlotRole = "main" | "secondary" | "accessory" | "core" | "conditioning";

export interface Slot {
  patterns: MovementPattern[];
  role: SlotRole;
  /** Prefer exercises whose primary muscles include one of these. */
  muscles?: Muscle[];
  mechanics?: Exercise["mechanics"];
}

export interface DayTemplate {
  key: string;
  title: string;
  focus: string[];
  slots: Slot[];
}

export type ExerciseLibrary = readonly Exercise[];
