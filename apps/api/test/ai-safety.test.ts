import { describe, expect, it } from "vitest";
import { aiChatOutputSchema, aiPlanOutputSchema } from "@gymfit/shared";
import { checkModelOutput, checkUserMessage } from "../src/ai/safety.js";
import { validatePlan } from "../src/ai/validation.js";
import { toOutputJsonSchema } from "../src/ai/providers/jsonSchema.js";
import { computeInsights } from "../src/engine/insights.js";
import { generatePlan } from "../src/engine/planGenerator.js";
import { EXERCISE_SEED } from "../src/db/seed/exercises.js";
import type { EngineProfile } from "../src/engine/types.js";

const profile: EngineProfile = {
  fitnessLevel: "beginner", goal: "muscle_gain", location: "home", equipment: ["dumbbells"],
  daysPerWeek: 3, sessionMinutes: 45, limitations: ["avoid_overhead"],
};

describe("user message safety screening", () => {
  it("flags emergencies, pain, medical topics and extreme dieting", () => {
    expect(checkUserMessage("I got chest pain during my last set")?.category).toBe("urgent");
    expect(checkUserMessage("I almost fainted yesterday")?.category).toBe("urgent");
    expect(checkUserMessage("my knee hurts when I squat")?.category).toBe("pain_or_injury");
    expect(checkUserMessage("I'm pregnant, can I still lift?")?.category).toBe("medical");
    expect(checkUserMessage("how do I lose 10 kg in 2 weeks")?.category).toBe("extreme_diet");
    expect(checkUserMessage("should I eat 800 calories a day")?.category).toBe("extreme_diet");
    expect(checkUserMessage("what should I train today?")).toBeNull();
    expect(checkUserMessage("give me an alternative for squats")).toBeNull();
  });
});

describe("model output safety filter", () => {
  it("blocks unsafe calorie advice, diagnoses and professional claims", () => {
    expect(checkModelOutput("Aim for about 900 calories per day.")).toMatch(/calorie/);
    expect(checkModelOutput("Try 1000 kcal daily for fast results")).toMatch(/calorie/);
    expect(checkModelOutput("You likely have a torn rotator cuff.")).toMatch(/diagnosis/);
    expect(checkModelOutput("As a certified personal trainer, I recommend...")).toMatch(/professional/);
    expect(checkModelOutput("A moderate deficit (e.g. 2000 calories per day) can work — a dietitian can confirm.")).toBeNull();
    expect(checkModelOutput("Do 3 sets of 10 goblet squats.")).toBeNull();
  });
});

describe("plan validation layer", () => {
  const ctx = { profile, library: EXERCISE_SEED, loadHistory: new Map<string, number>([["goblet-squat", 20]]) };

  it("accepts the engine's own plan", () => {
    expect(validatePlan(generatePlan(EXERCISE_SEED, profile).plan, ctx)).toEqual({ ok: true, errors: [] });
  });

  it("rejects unknown, unavailable or contraindicated exercises", () => {
    const plan = structuredClone(generatePlan(EXERCISE_SEED, profile).plan);
    plan.workouts[0]!.exercises[0]!.exerciseId = "imaginary-press";
    plan.workouts[1]!.exercises[0]!.exerciseId = "barbell-back-squat"; // no barbell
    plan.workouts[2]!.exercises[0]!.exerciseId = "seated-dumbbell-shoulder-press"; // avoid_overhead
    const r = validatePlan(plan, ctx);
    expect(r.ok).toBe(false);
    expect(r.errors.join("\n")).toMatch(/unknown exercise "imaginary-press"/);
    expect(r.errors.join("\n")).toMatch(/Barbell Back Squat is not allowed/);
    expect(r.errors.join("\n")).toMatch(/Seated Dumbbell Shoulder Press is not allowed/);
  });

  it("rejects wrong day counts, clashing days, unsafe load jumps and overlong sessions", () => {
    const plan = structuredClone(generatePlan(EXERCISE_SEED, profile).plan);
    plan.workouts[1]!.dayOfWeek = plan.workouts[0]!.dayOfWeek;
    const squat = plan.workouts.flatMap((w) => w.exercises).find((e) => e.exerciseId === "goblet-squat")!;
    squat.targetWeightKg = 30; // last working weight 20 kg → +50%
    plan.workouts[2]!.exercises.forEach((e) => (e.sets = 6));
    const r = validatePlan({ ...plan, workouts: [...plan.workouts, plan.workouts[0]!] }, ctx);
    expect(r.errors.join("\n")).toMatch(/4 workouts but the user trains 3/);
    expect(r.errors.join("\n")).toMatch(/same day/);
    expect(r.errors.join("\n")).toMatch(/jumps more than 10%/);
    expect(r.errors.join("\n")).toMatch(/exceeds the 45-min budget/);
  });
});

describe("structured output JSON schema", () => {
  it("closes every object and strips unsupported range keywords", () => {
    const s = JSON.stringify(toOutputJsonSchema(aiPlanOutputSchema));
    expect(s).not.toMatch(/"minimum"|"maxItems"|"maxLength"|"oneOf"/);
    const chat = toOutputJsonSchema(aiChatOutputSchema) as { additionalProperties: boolean; required: string[] };
    expect(chat.additionalProperties).toBe(false);
    expect(chat.required).toEqual(["reply", "actions", "safetyNote"]);
  });
});

describe("insight engine", () => {
  const base = { today: "2026-10-07", goal: "muscle_gain" as const, daysPerWeek: 3, sessions: [], strength: [], weight: [], streakWeeks: 0 };

  it("prompts a first workout when there is no data", () => {
    expect(computeInsights(base)[0]).toMatchObject({ kind: "tip", evidence: "No workouts logged yet" });
  });

  it("detects consecutive weekly strength improvements with evidence", () => {
    const insights = computeInsights({
      ...base,
      sessions: [{ date: "2026-10-05", difficultyRating: 3 }],
      strength: [{
        exerciseId: "bench", exerciseName: "Bench Press",
        points: [
          { date: "2026-09-14", estimated1RmKg: 60, bestWeightKg: 50, bestReps: 6 },
          { date: "2026-09-21", estimated1RmKg: 62, bestWeightKg: 52, bestReps: 6 },
          { date: "2026-09-28", estimated1RmKg: 64, bestWeightKg: 54, bestReps: 6 },
          { date: "2026-10-05", estimated1RmKg: 66, bestWeightKg: 55, bestReps: 6 },
        ],
      }],
    });
    expect(insights[0]).toMatchObject({ kind: "progress", evidence: "Estimated 1RM 60 → 66 kg" });
    expect(insights[0]!.message).toMatch(/3 consecutive weeks/);
  });

  it("flags rapid weight loss as a safety insight ahead of everything else", () => {
    const insights = computeInsights({
      ...base,
      goal: "weight_loss",
      sessions: [{ date: "2026-10-05", difficultyRating: 5 }, { date: "2026-10-06", difficultyRating: 5 }],
      weight: [
        { date: "2026-09-09", weightKg: 90, bodyFatPct: null },
        { date: "2026-10-07", weightKg: 84, bodyFatPct: null },
      ],
    });
    expect(insights[0]!.kind).toBe("safety");
    expect(insights[0]!.evidence).toMatch(/90 → 84 kg/);
    expect(insights.some((i) => i.kind === "recovery")).toBe(true);
  });
});
