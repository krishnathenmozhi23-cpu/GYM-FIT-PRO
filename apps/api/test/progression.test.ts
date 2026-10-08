import { describe, expect, it } from "vitest";
import { progress, volumeAdjustment, type Performance, type Prescription } from "../src/engine/progression.js";

const barbell = { measure: "reps" as const, loaded: true, equipment: ["barbell" as const] };
const dumbbell = { measure: "reps" as const, loaded: true, equipment: ["dumbbell" as const] };
const bodyweight = { measure: "reps" as const, loaded: false, equipment: ["bodyweight" as const] };
const timed = { measure: "time" as const, loaded: false, equipment: ["bodyweight" as const] };

const rx = (o: Partial<Prescription> = {}): Prescription => ({ sets: 3, repsMin: 8, repsMax: 10, durationSeconds: null, targetWeightKg: 60, ...o });
const perf = (reps: number[], weight: number | null, rating = 3, target = rx()): Performance => ({
  difficultyRating: rating, status: "completed", target,
  sets: reps.map((r) => ({ reps: r, weightKg: weight, durationSeconds: null })),
});

describe("load progression (double progression)", () => {
  it("increases load by one increment when all sets hit the top of the range", () => {
    const r = progress(barbell, rx(), [perf([10, 10, 10], 60)]);
    expect(r.next.targetWeightKg).toBe(62.5);
    expect(r.change?.kind).toBe("increase_load");
  });

  it("does not increase when the session was rated too hard", () => {
    const r = progress(barbell, rx(), [perf([10, 10, 10], 60, 5)]);
    expect(r.next.targetWeightKg).toBe(60);
  });

  it("holds the load inside the rep range", () => {
    expect(progress(barbell, rx(), [perf([10, 9, 8], 60)]).change).toBeNull();
  });

  it("holds after one bad session, reduces ~10% after two", () => {
    const bad = perf([6, 5, 5], 60);
    expect(progress(barbell, rx(), [bad]).change?.kind).toBe("maintain");
    const r = progress(barbell, rx(), [bad, perf([7, 6, 5], 60)]);
    expect(r.change?.kind).toBe("reduce_load");
    expect(r.next.targetWeightKg).toBe(52.5); // 54 rounded down to 2.5 kg plates
  });

  it("never jumps more than ~10%: light dumbbells progress reps first", () => {
    const r = progress(dumbbell, rx({ targetWeightKg: 8 }), [perf([10, 10, 10], 8)]);
    expect(r.change?.kind).toBe("increase_reps");
    expect(r.next.targetWeightKg).toBe(8);
    expect(r.next.repsMax).toBe(12);
    // At a heavier load, the 2 kg step is fine
    expect(progress(dumbbell, rx({ targetWeightKg: 24 }), [perf([10, 10, 10], 24)]).next.targetWeightKg).toBe(26);
  });

  it("calibrates the first target from the weight the user chose", () => {
    const r = progress(barbell, rx({ targetWeightKg: null }), [perf([10, 9, 9], 40, 3, rx({ targetWeightKg: null }))]);
    expect(r.next.targetWeightKg).toBe(40);
  });

  it("adopts a heavier self-selected load that stayed in range (no extra jump)", () => {
    const r = progress(barbell, rx(), [perf([8, 8, 8], 65)]);
    expect(r.next.targetWeightKg).toBe(65);
  });

  it("treats missing sets as struggling and ignores skipped exercises", () => {
    expect(progress(barbell, rx(), [perf([10], 60), perf([9], 60)]).change?.kind).toBe("reduce_load");
    expect(progress(barbell, rx(), [{ ...perf([], 60), status: "skipped" }]).change).toBeNull();
  });
});

describe("bodyweight and timed progression", () => {
  it("adds reps for bodyweight work and suggests a harder variation at the cap", () => {
    const t = rx({ targetWeightKg: null, repsMin: 10, repsMax: 15 });
    expect(progress(bodyweight, t, [perf([15, 15, 15], null, 3, t)]).next).toMatchObject({ repsMin: 12, repsMax: 17 });
    const capped = rx({ targetWeightKg: null, repsMin: 20, repsMax: 25 });
    expect(progress(bodyweight, capped, [perf([25, 25, 25], null, 3, capped)]).change?.reason).toMatch(/harder variation/);
  });

  it("adds 5 seconds to holds when every set was completed", () => {
    const t = rx({ durationSeconds: 30, targetWeightKg: null, repsMin: 1, repsMax: 1 });
    const p: Performance = { difficultyRating: 3, status: "completed", target: t, sets: [30, 32, 30].map((d) => ({ reps: null, weightKg: null, durationSeconds: d })) };
    expect(progress(timed, t, [p]).next.durationSeconds).toBe(35);
  });
});

describe("volume adjustment", () => {
  it("reacts to repeated very hard or very easy sessions only", () => {
    expect(volumeAdjustment([5, 5, 3])).toBe(-1);
    expect(volumeAdjustment([5, 3, 5])).toBe(0);
    expect(volumeAdjustment([2, 1, 2])).toBe(1);
    expect(volumeAdjustment([2, 2])).toBe(0);
    expect(volumeAdjustment([null, 5, 5])).toBe(-1);
  });
});
