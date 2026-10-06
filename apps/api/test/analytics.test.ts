import { describe, expect, it } from "vitest";
import { bmi, epley1Rm, estimateKcal, goalProgress, strengthSeries, weekStreak, weeklyActivity } from "../src/engine/analytics.js";

describe("analytics", () => {
  it("computes Epley e1RM only for 1–12 reps", () => {
    expect(epley1Rm(100, 1)).toBe(100);
    expect(epley1Rm(100, 10)).toBeCloseTo(133.33, 1);
    expect(epley1Rm(100, 15)).toBeNull();
    expect(epley1Rm(0, 5)).toBeNull();
  });

  it("classifies BMI with WHO cut-offs and skips categories under 18", () => {
    expect(bmi(175, 70, 21)).toEqual({ value: 22.9, category: "healthy" });
    expect(bmi(175, 80, 21).category).toBe("overweight"); // 26.1
    expect(bmi(170, 90, 30).category).toBe("obese"); // 31.1
    expect(bmi(175, 55, 21).category).toBe("underweight"); // 18.0
    expect(bmi(175, 70, 17).category).toBeNull();
  });

  it("estimates calories conservatively and returns null without body weight", () => {
    expect(estimateKcal(3600, 70)).toBe(245);
    expect(estimateKcal(3600, null)).toBeNull();
  });

  it("counts week streaks without penalising an unfinished current week", () => {
    const today = "2026-10-07"; // Wednesday
    const dates = ["2026-09-21", "2026-09-23", "2026-09-28", "2026-09-30", "2026-10-05"];
    expect(weekStreak(dates, 2, today)).toEqual({ current: 2, longest: 2 });
    expect(weekStreak([...dates, "2026-10-06"], 2, today)).toEqual({ current: 3, longest: 3 });
    // A missed past week resets it
    expect(weekStreak(["2026-09-14", "2026-09-15", "2026-09-28", "2026-09-29"], 2, today)).toEqual({ current: 1, longest: 1 });
    expect(weekStreak([], 3, today)).toEqual({ current: 0, longest: 0 });
  });

  it("buckets weekly activity", () => {
    const weeks = weeklyActivity(
      [
        { date: "2026-10-05", durationSeconds: 3000, volumeKg: 1000 },
        { date: "2026-10-06", durationSeconds: 1800, volumeKg: 500 },
        { date: "2026-09-29", durationSeconds: 2400, volumeKg: 800 },
      ],
      70,
      "2026-10-07",
      3,
    );
    expect(weeks.map((w) => w.workouts)).toEqual([0, 1, 2]);
    expect(weeks[2]).toMatchObject({ weekStart: "2026-10-05", minutes: 80, volumeKg: 1500 });
  });

  it("keeps the best e1RM per exercise per day", () => {
    const s = strengthSeries([
      { exerciseId: "bench", date: "2026-10-01", weightKg: 60, reps: 8 },
      { exerciseId: "bench", date: "2026-10-01", weightKg: 65, reps: 5 },
      { exerciseId: "bench", date: "2026-10-04", weightKg: 62.5, reps: 8 },
    ]);
    expect(s.get("bench")).toEqual([
      { date: "2026-10-01", estimated1RmKg: 76, bestWeightKg: 60, bestReps: 8 },
      { date: "2026-10-04", estimated1RmKg: 79.2, bestWeightKg: 62.5, bestReps: 8 },
    ]);
  });

  it("measures goal progress by weight when a target exists, else by consistency", () => {
    expect(goalProgress({ goal: "weight_loss", startWeightKg: 90, currentWeightKg: 85, targetWeightKg: 80, workoutsLast4Weeks: 0, daysPerWeek: 3 }).percent).toBe(50);
    expect(goalProgress({ goal: "weight_loss", startWeightKg: 90, currentWeightKg: 92, targetWeightKg: 80, workoutsLast4Weeks: 0, daysPerWeek: 3 }).percent).toBe(0);
    const c = goalProgress({ goal: "strength", startWeightKg: 70, currentWeightKg: 70, targetWeightKg: null, workoutsLast4Weeks: 6, daysPerWeek: 3 });
    expect(c.percent).toBe(50);
    expect(c.detail).toMatch(/6 of 12/);
  });
});
