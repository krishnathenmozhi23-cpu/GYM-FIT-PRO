import { describe, expect, it } from "vitest";
import type { Exercise } from "@gymfit/shared";
import { EXERCISE_SEED } from "../src/db/seed/exercises.js";
import { availableEquipment, hasEquipment, respectsLimitations, suitableForLevel } from "../src/engine/filters.js";
import { generatePlan } from "../src/engine/planGenerator.js";
import { estimateWorkoutMinutes, prescribe } from "../src/engine/prescription.js";
import { chooseSplit } from "../src/engine/templates.js";
import { findAlternatives } from "../src/engine/alternatives.js";
import { buildWeekSchedule, nextInRotation } from "../src/engine/schedule.js";
import { condenseWorkout, generateQuickWorkout } from "../src/engine/quickWorkout.js";
import type { EngineProfile } from "../src/engine/types.js";

const lib = EXERCISE_SEED;
const byId = new Map(lib.map((e) => [e.id, e]));
const get = (id: string) => byId.get(id) as Exercise;

const base: EngineProfile = {
  fitnessLevel: "beginner",
  goal: "muscle_gain",
  location: "gym",
  equipment: ["full_gym"],
  daysPerWeek: 4,
  sessionMinutes: 60,
  limitations: [],
};

function allExercises(plan: ReturnType<typeof generatePlan>["plan"]) {
  return plan.workouts.flatMap((w) => w.exercises.map((e) => get(e.exerciseId)));
}

describe("split selection", () => {
  it("matches frequency, level and goal", () => {
    expect(chooseSplit(4, "beginner", "muscle_gain").splitType).toBe("Upper / Lower");
    expect(chooseSplit(4, "intermediate", "muscle_gain").days).toEqual(["chestTriceps", "backBiceps", "legs", "shouldersCore"]);
    expect(chooseSplit(3, "beginner", "strength").splitType).toBe("Full body A/B/C");
    expect(chooseSplit(3, "advanced", "strength").splitType).toBe("Push / Pull / Legs");
    expect(chooseSplit(6, "advanced", "muscle_gain").days).toHaveLength(6);
  });
});

describe("plan generation", () => {
  it("creates one workout per training day on spaced weekdays", () => {
    const { plan } = generatePlan(lib, base);
    expect(plan.workouts).toHaveLength(4);
    expect(plan.workouts.map((w) => w.dayOfWeek)).toEqual([0, 1, 3, 4]);
    for (const w of plan.workouts) expect(w.exercises.length).toBeGreaterThanOrEqual(3);
  });

  it("intermediate 4-day muscle gain produces the body-part split", () => {
    const { plan } = generatePlan(lib, { ...base, fitnessLevel: "intermediate" });
    expect(plan.workouts.map((w) => w.title)).toEqual(["Chest + Triceps", "Back + Biceps", "Legs", "Shoulders + Core"]);
  });

  it("only uses exercises the user has equipment for", () => {
    const profile: EngineProfile = { ...base, location: "home", equipment: ["dumbbells"], daysPerWeek: 3 };
    const available = availableEquipment(profile);
    const exercises = allExercises(generatePlan(lib, profile).plan);
    expect(exercises.length).toBeGreaterThan(0);
    for (const ex of exercises) expect(hasEquipment(ex, available)).toBe(true);
  });

  it("bodyweight-only users still get a usable plan", () => {
    const profile: EngineProfile = { ...base, location: "home", equipment: ["none"], daysPerWeek: 3, goal: "general_fitness" };
    const { plan } = generatePlan(lib, profile);
    for (const ex of allExercises(plan)) expect(ex.equipment).toEqual(["bodyweight"]);
    for (const w of plan.workouts) expect(w.exercises.length).toBeGreaterThanOrEqual(3);
  });

  it("never includes exercises that conflict with limitations", () => {
    const limitations: EngineProfile["limitations"] = ["avoid_overhead", "avoid_spinal_loading", "avoid_jumping", "avoid_floor_work"];
    for (const level of ["beginner", "intermediate", "advanced"] as const) {
      const exercises = allExercises(generatePlan(lib, { ...base, fitnessLevel: level, limitations, goal: "weight_loss", daysPerWeek: 5 }).plan);
      for (const ex of exercises) expect(respectsLimitations(ex, limitations)).toBe(true);
    }
  });

  it("never gives beginners advanced exercises", () => {
    for (const days of [1, 2, 3, 4, 5, 6]) {
      const exercises = allExercises(generatePlan(lib, { ...base, daysPerWeek: days }).plan);
      for (const ex of exercises) expect(suitableForLevel(ex, "beginner")).toBe(true);
    }
  });

  it("fits each workout within the session time budget", () => {
    for (const minutes of [20, 30, 45, 60, 90]) {
      for (const goal of ["strength", "muscle_gain", "weight_loss", "endurance"] as const) {
        const { plan } = generatePlan(lib, { ...base, sessionMinutes: minutes, goal, fitnessLevel: "intermediate" });
        for (const w of plan.workouts) {
          // Allow a small overshoot only for the mandatory minimum of exercises in very short sessions.
          expect(estimateWorkoutMinutes(w.exercises)).toBeLessThanOrEqual(Math.max(minutes + 2, 22));
        }
      }
    }
  });

  it("is deterministic and uses varied exercises for repeated templates", () => {
    const p = { ...base, daysPerWeek: 6, fitnessLevel: "advanced" as const };
    expect(generatePlan(lib, p).plan).toEqual(generatePlan(lib, p).plan);
    const [push1, , , push2] = generatePlan(lib, p).plan.workouts;
    expect(push1!.exercises[0]!.exerciseId).not.toBe(push2!.exercises[0]!.exerciseId);
  });

  it("seeds suggested loads from history and adds a calibration note otherwise", () => {
    const first = generatePlan(lib, base).plan.workouts[0]!.exercises.find((e) => get(e.exerciseId).loaded)!;
    expect(first.targetWeightKg).toBeNull();
    expect(first.note).toMatch(/2–3 more reps/);
    const seeded = generatePlan(lib, base, new Map([[first.exerciseId, 42.5]])).plan.workouts[0]!.exercises[0]!;
    expect(seeded.targetWeightKg).toBe(42.5);
  });
});

describe("prescription", () => {
  it("uses low reps / long rest for strength and higher reps for endurance", () => {
    const bench = get("barbell-bench-press");
    const strength = prescribe(bench, "main", "strength", "intermediate");
    const endurance = prescribe(bench, "main", "endurance", "intermediate");
    expect(strength.repsMax).toBeLessThanOrEqual(6);
    expect(strength.restSeconds).toBeGreaterThan(endurance.restSeconds);
    expect(endurance.repsMin).toBeGreaterThanOrEqual(12);
  });
  it("keeps isolation work at 8+ reps and caps beginner volume", () => {
    expect(prescribe(get("dumbbell-lateral-raise"), "accessory", "strength", "advanced").repsMin).toBeGreaterThanOrEqual(8);
    expect(prescribe(get("goblet-squat"), "main", "strength", "beginner").sets).toBeLessThanOrEqual(3);
    expect(prescribe(get("goblet-squat"), "main", "strength", "beginner").repsMin).toBeGreaterThanOrEqual(5);
  });
  it("prescribes time for planks and conditioning", () => {
    expect(prescribe(get("plank"), "core", "general_fitness", "beginner").durationSeconds).toBe(25);
    expect(prescribe(get("stationary-bike"), "conditioning", "endurance", "beginner").durationSeconds).toBe(600);
  });
});

describe("alternatives", () => {
  it("suggests available, same-pattern alternatives first", () => {
    const alts = findAlternatives(get("barbell-bench-press"), lib, { equipment: ["dumbbells"], limitations: [], fitnessLevel: "beginner" });
    expect(alts[0]!.available).toBe(true);
    expect(alts[0]!.exercise.pattern).toBe("horizontal_push");
    const ids = alts.filter((a) => a.available).map((a) => a.exercise.id);
    expect(ids).toEqual(expect.arrayContaining(["dumbbell-bench-press", "push-up"]));
    expect(ids).not.toContain("machine-chest-press");
  });
  it("excludes alternatives that conflict with limitations", () => {
    const alts = findAlternatives(get("seated-dumbbell-shoulder-press"), lib, {
      equipment: ["full_gym"],
      limitations: ["avoid_overhead"],
      fitnessLevel: "advanced",
    });
    for (const a of alts) expect(a.exercise.contraindications).not.toContain("avoid_overhead");
  });
});

describe("weekly schedule", () => {
  const workouts = [
    { id: "w1", position: 0, dayOfWeek: 0, title: "Upper A" },
    { id: "w2", position: 1, dayOfWeek: 1, title: "Lower A" },
    { id: "w3", position: 2, dayOfWeek: 3, title: "Upper B" },
    { id: "w4", position: 3, dayOfWeek: 4, title: "Lower B" },
  ];
  const weekStart = "2026-10-05"; // Monday

  it("keeps planned days when on track", () => {
    const s = buildWeekSchedule(workouts, [{ id: "s1", workoutId: "w1", date: "2026-10-05", title: "Upper A" }], "2026-10-06", weekStart);
    expect(s.days.map((d) => d.status)).toEqual(["completed", "planned", "rest", "planned", "planned", "rest", "rest"]);
    expect(s.notes).toEqual([]);
  });

  it("re-spreads remaining workouts after a missed day", () => {
    // Monday's workout was skipped; it's Tuesday.
    const s = buildWeekSchedule(workouts, [], "2026-10-06", weekStart);
    const planned = s.days.filter((d) => d.workoutId).map((d) => [d.dayOfWeek, d.title]);
    expect(planned).toHaveLength(4);
    expect(planned[0]).toEqual([1, "Upper A"]); // missed workout comes first, today
    expect(s.notes[0]).toMatch(/Upper A was missed on Monday/);
    // no two workouts on the same day
    expect(new Set(planned.map((p) => p[0])).size).toBe(4);
  });

  it("carries over workouts that no longer fit instead of doubling up", () => {
    const s = buildWeekSchedule(workouts, [], "2026-10-10", weekStart); // Saturday, nothing done
    expect(s.days.filter((d) => d.workoutId).length).toBe(2);
    expect(s.carriedOver).toEqual(["Upper B", "Lower B"]);
  });

  it("rotates to the next workout", () => {
    expect(nextInRotation(workouts, "w4")!.id).toBe("w1");
    expect(nextInRotation(workouts, null)!.id).toBe("w1");
  });
});

describe("quick and condensed workouts", () => {
  it("builds a 30-minute workout for a focus", () => {
    const w = generateQuickWorkout(lib, base, { minutes: 30, focus: "upper" });
    expect(w.exercises.length).toBeGreaterThanOrEqual(3);
    expect(estimateWorkoutMinutes(w.exercises)).toBeLessThanOrEqual(32);
  });
  it("condenses an existing workout to fit the time available", () => {
    const { plan } = generatePlan(lib, { ...base, sessionMinutes: 75 });
    const full = plan.workouts[0]!.exercises;
    const short = condenseWorkout(full, 30);
    expect(short.length).toBeLessThanOrEqual(full.length);
    expect(short[0]!.exerciseId).toBe(full[0]!.exerciseId);
    expect(estimateWorkoutMinutes(short)).toBeLessThanOrEqual(33);
  });
});
