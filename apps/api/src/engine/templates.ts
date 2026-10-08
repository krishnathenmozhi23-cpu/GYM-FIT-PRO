import type { FitnessLevel, Goal } from "@gymfit/shared";
import type { DayTemplate, Slot } from "./types.js";

const core = (patterns: Slot["patterns"] = ["core_anti_extension"]): Slot => ({ patterns, role: "core" });
const conditioning: Slot = { patterns: ["conditioning"], role: "conditioning" };

export const TEMPLATES = {
  fullBodyA: {
    key: "full_body_a",
    title: "Full Body A",
    focus: ["Legs", "Chest", "Back"],
    slots: [
      { patterns: ["squat"], role: "main", mechanics: "compound" },
      { patterns: ["horizontal_push"], role: "main", mechanics: "compound" },
      { patterns: ["horizontal_pull"], role: "main", mechanics: "compound" },
      { patterns: ["hinge"], role: "secondary" },
      { patterns: ["vertical_push", "shoulder_isolation"], role: "accessory", muscles: ["shoulders"] },
      core(),
      conditioning,
    ],
  },
  fullBodyB: {
    key: "full_body_b",
    title: "Full Body B",
    focus: ["Hamstrings", "Back", "Shoulders"],
    slots: [
      { patterns: ["hinge"], role: "main", mechanics: "compound" },
      { patterns: ["vertical_pull", "horizontal_pull"], role: "main", mechanics: "compound" },
      { patterns: ["vertical_push", "horizontal_push"], role: "secondary", mechanics: "compound" },
      { patterns: ["lunge", "squat"], role: "secondary" },
      { patterns: ["shoulder_isolation"], role: "accessory", muscles: ["rear_delts"] },
      core(["core_rotation"]),
      conditioning,
    ],
  },
  fullBodyC: {
    key: "full_body_c",
    title: "Full Body C",
    focus: ["Legs", "Upper body", "Arms"],
    slots: [
      { patterns: ["lunge", "squat"], role: "main", mechanics: "compound" },
      { patterns: ["horizontal_push"], role: "main", mechanics: "compound" },
      { patterns: ["horizontal_pull", "vertical_pull"], role: "main", mechanics: "compound" },
      { patterns: ["hinge"], role: "secondary", muscles: ["glutes"] },
      { patterns: ["elbow_flexion"], role: "accessory" },
      { patterns: ["elbow_extension"], role: "accessory" },
      core(["core_flexion", "carry"]),
      conditioning,
    ],
  },
  upperA: {
    key: "upper_a",
    title: "Upper Body A",
    focus: ["Chest", "Back", "Shoulders", "Arms"],
    slots: [
      { patterns: ["horizontal_push"], role: "main", mechanics: "compound" },
      { patterns: ["horizontal_pull"], role: "main", mechanics: "compound" },
      { patterns: ["vertical_push"], role: "secondary", mechanics: "compound" },
      { patterns: ["vertical_pull"], role: "secondary", mechanics: "compound" },
      { patterns: ["elbow_flexion"], role: "accessory" },
      { patterns: ["elbow_extension"], role: "accessory" },
      { patterns: ["shoulder_isolation"], role: "accessory", muscles: ["shoulders"] },
    ],
  },
  lowerA: {
    key: "lower_a",
    title: "Lower Body A",
    focus: ["Quads", "Glutes", "Hamstrings", "Core"],
    slots: [
      { patterns: ["squat"], role: "main", mechanics: "compound" },
      { patterns: ["hinge"], role: "main", mechanics: "compound" },
      { patterns: ["lunge"], role: "secondary" },
      { patterns: ["knee_flexion", "hinge"], role: "accessory", muscles: ["hamstrings"] },
      { patterns: ["calf_raise"], role: "accessory" },
      core(),
      conditioning,
    ],
  },
  upperB: {
    key: "upper_b",
    title: "Upper Body B",
    focus: ["Back", "Chest", "Shoulders", "Arms"],
    slots: [
      { patterns: ["vertical_pull"], role: "main", mechanics: "compound" },
      { patterns: ["horizontal_push"], role: "main", mechanics: "compound" },
      { patterns: ["horizontal_pull"], role: "secondary", mechanics: "compound" },
      { patterns: ["shoulder_isolation"], role: "accessory", muscles: ["shoulders"] },
      { patterns: ["chest_isolation", "horizontal_push"], role: "accessory", muscles: ["chest"] },
      { patterns: ["elbow_extension"], role: "accessory" },
      { patterns: ["elbow_flexion"], role: "accessory" },
    ],
  },
  lowerB: {
    key: "lower_b",
    title: "Lower Body B",
    focus: ["Hamstrings", "Glutes", "Quads", "Core"],
    slots: [
      { patterns: ["hinge"], role: "main", mechanics: "compound" },
      { patterns: ["squat", "lunge"], role: "main", mechanics: "compound" },
      { patterns: ["lunge"], role: "secondary" },
      { patterns: ["knee_extension", "squat"], role: "accessory", muscles: ["quadriceps"] },
      { patterns: ["calf_raise"], role: "accessory" },
      core(["core_rotation"]),
      conditioning,
    ],
  },
  push: {
    key: "push",
    title: "Push",
    focus: ["Chest", "Shoulders", "Triceps"],
    slots: [
      { patterns: ["horizontal_push"], role: "main", mechanics: "compound" },
      { patterns: ["vertical_push"], role: "main", mechanics: "compound" },
      { patterns: ["horizontal_push"], role: "secondary" },
      { patterns: ["shoulder_isolation"], role: "accessory", muscles: ["shoulders"] },
      { patterns: ["elbow_extension"], role: "accessory" },
      { patterns: ["chest_isolation"], role: "accessory" },
    ],
  },
  pull: {
    key: "pull",
    title: "Pull",
    focus: ["Back", "Rear delts", "Biceps"],
    slots: [
      { patterns: ["vertical_pull"], role: "main", mechanics: "compound" },
      { patterns: ["horizontal_pull"], role: "main", mechanics: "compound" },
      { patterns: ["horizontal_pull", "vertical_pull"], role: "secondary" },
      { patterns: ["shoulder_isolation"], role: "accessory", muscles: ["rear_delts"] },
      { patterns: ["elbow_flexion"], role: "accessory" },
      { patterns: ["elbow_flexion"], role: "accessory", muscles: ["forearms"] },
    ],
  },
  legs: {
    key: "legs",
    title: "Legs",
    focus: ["Quads", "Hamstrings", "Glutes", "Calves"],
    slots: [
      { patterns: ["squat"], role: "main", mechanics: "compound" },
      { patterns: ["hinge"], role: "main", mechanics: "compound" },
      { patterns: ["lunge"], role: "secondary" },
      { patterns: ["knee_extension"], role: "accessory" },
      { patterns: ["knee_flexion"], role: "accessory" },
      { patterns: ["calf_raise"], role: "accessory" },
      core(),
    ],
  },
  chestTriceps: {
    key: "chest_triceps",
    title: "Chest + Triceps",
    focus: ["Chest", "Triceps"],
    slots: [
      { patterns: ["horizontal_push"], role: "main", mechanics: "compound" },
      { patterns: ["horizontal_push"], role: "secondary", mechanics: "compound" },
      { patterns: ["chest_isolation", "horizontal_push"], role: "accessory", muscles: ["chest"] },
      { patterns: ["elbow_extension"], role: "accessory" },
      { patterns: ["elbow_extension"], role: "accessory" },
    ],
  },
  backBiceps: {
    key: "back_biceps",
    title: "Back + Biceps",
    focus: ["Back", "Lats", "Biceps"],
    slots: [
      { patterns: ["vertical_pull"], role: "main", mechanics: "compound" },
      { patterns: ["horizontal_pull"], role: "main", mechanics: "compound" },
      { patterns: ["horizontal_pull", "vertical_pull"], role: "secondary" },
      { patterns: ["elbow_flexion"], role: "accessory" },
      { patterns: ["elbow_flexion"], role: "accessory", muscles: ["forearms"] },
    ],
  },
  shouldersCore: {
    key: "shoulders_core",
    title: "Shoulders + Core",
    focus: ["Shoulders", "Rear delts", "Core"],
    slots: [
      { patterns: ["vertical_push"], role: "main", mechanics: "compound" },
      { patterns: ["shoulder_isolation"], role: "accessory", muscles: ["shoulders"] },
      { patterns: ["shoulder_isolation"], role: "accessory", muscles: ["rear_delts"] },
      core(),
      core(["core_rotation"]),
      core(["core_flexion", "carry"]),
    ],
  },
  core: {
    key: "core",
    title: "Core Focus",
    focus: ["Core", "Obliques"],
    slots: [core(), core(["core_rotation"]), core(["core_flexion"]), core(["carry", "core_anti_extension"]), conditioning],
  },
  conditioning: {
    key: "conditioning",
    title: "Conditioning",
    focus: ["Cardio", "Full body"],
    slots: [
      { ...conditioning },
      { patterns: ["squat", "lunge"], role: "secondary" },
      { patterns: ["horizontal_push"], role: "secondary" },
      { ...conditioning },
      { patterns: ["hinge"], role: "secondary" },
      core(),
      { ...conditioning },
    ],
  },
} satisfies Record<string, DayTemplate>;

export type TemplateKey = keyof typeof TEMPLATES;

export interface SplitChoice {
  splitType: string;
  days: TemplateKey[];
  rationale: string;
}

/** Training weekdays (0 = Monday) for each frequency, spaced for recovery. */
export const WEEKDAY_LAYOUT: Record<number, number[]> = {
  1: [0],
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 1, 3, 4],
  5: [0, 1, 2, 4, 5],
  6: [0, 1, 2, 3, 4, 5],
};

/**
 * Chooses a weekly split. Frequency is the main driver; level and goal
 * refine it (beginners get more full-body practice, higher-volume
 * hypertrophy users get body-part days).
 */
export function chooseSplit(daysPerWeek: number, level: FitnessLevel, goal: Goal): SplitChoice {
  const conditioningGoal = goal === "weight_loss" || goal === "endurance" || goal === "general_fitness";
  switch (daysPerWeek) {
    case 1:
      return { splitType: "Full body", days: ["fullBodyA"], rationale: "One session a week works best as a single full-body workout." };
    case 2:
      return {
        splitType: "Full body A/B",
        days: ["fullBodyA", "fullBodyB"],
        rationale: "Two full-body sessions train every major muscle group twice a week.",
      };
    case 3:
      if (level === "beginner" || conditioningGoal) {
        return {
          splitType: "Full body A/B/C",
          days: ["fullBodyA", "fullBodyB", "fullBodyC"],
          rationale: "Three full-body sessions give frequent practice of the key movements with a rest day between each.",
        };
      }
      return {
        splitType: "Push / Pull / Legs",
        days: ["push", "pull", "legs"],
        rationale: "Push/pull/legs lets you train each area hard with plenty of recovery between sessions.",
      };
    case 4:
      if (level !== "beginner" && goal === "muscle_gain") {
        return {
          splitType: "Body-part split",
          days: ["chestTriceps", "backBiceps", "legs", "shouldersCore"],
          rationale: "A body-part split gives each muscle group dedicated volume, suited to experienced lifters chasing muscle gain.",
        };
      }
      return {
        splitType: "Upper / Lower",
        days: ["upperA", "lowerA", "upperB", "lowerB"],
        rationale: "Upper/lower trains each muscle twice a week — an efficient, well-balanced setup for four days.",
      };
    case 5:
      if (level === "beginner") {
        return {
          splitType: "Upper / Lower + Full body",
          days: ["upperA", "lowerA", "fullBodyC", "upperB", "lowerB"],
          rationale: "Upper/lower plus one full-body day spreads volume across five manageable sessions.",
        };
      }
      return {
        splitType: "Upper / Lower + Push / Pull / Legs",
        days: ["upperA", "lowerA", "push", "pull", "legs"],
        rationale: "Combining upper/lower with push/pull/legs hits each muscle about twice a week across five days.",
      };
    default:
      return {
        splitType: "Push / Pull / Legs ×2",
        days: ["push", "pull", "legs", "push", "pull", "legs"],
        rationale: "Push/pull/legs twice a week; each session uses different exercise variations.",
      };
  }
}
