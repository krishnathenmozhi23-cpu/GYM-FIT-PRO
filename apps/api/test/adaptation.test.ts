import { describe, expect, it } from "vitest";
import request from "supertest";
import type { CompleteSessionResponse, PlanView, SessionView } from "@gymfit/shared";
import { app, auth, onboardedUser } from "./helpers.js";

async function runSession(token: string, workoutId: string, reps: number | "top", weight: number, rating: number) {
  const session = (await request(app).post("/workouts/start").set(auth(token)).send({ workoutId })).body.session as SessionView;
  const first = session.exercises[0]!;
  for (let i = 0; i < first.prescription.sets; i++) {
    await request(app).post(`/workout-session/${session.id}/set`).set(auth(token))
      .send({ sessionExerciseId: first.id, reps: reps === "top" ? first.prescription.repsMax : reps, weightKg: weight, durationSeconds: null });
  }
  const res = await request(app).post(`/workout-session/${session.id}/complete`).set(auth(token)).send({ difficultyRating: rating });
  expect(res.status).toBe(200);
  return res.body as CompleteSessionResponse;
}

describe("adaptive plan after workouts", () => {
  it("calibrates, increases load on success and backs off after repeated struggles", async () => {
    const token = await onboardedUser({ fitnessLevel: "intermediate", goal: "strength", daysPerWeek: 3 });
    const plan = (await request(app).post("/ai/workout-plan").set(auth(token)).send({})).body.plan as PlanView;
    const workout = plan.workouts[0]!;
    const main = workout.exercises[0]!;
    expect(main.targetWeightKg).toBeNull();

    // 1) First session calibrates the target from the logged weight.
    const s1 = await runSession(token, workout.id, "top", 60, 3);
    expect(s1.adaptations.find((a) => a.exerciseId === main.exerciseId)).toMatchObject({ kind: "maintain", to: "60 kg" });

    // 2) Top of the range at the target → load goes up by one increment.
    const s2 = await runSession(token, workout.id, "top", 60, 3);
    const inc = s2.adaptations.find((a) => a.exerciseId === main.exerciseId)!;
    expect(inc.kind).toBe("increase_load");
    const afterInc = (await request(app).get(`/workouts/${workout.id}`).set(auth(token))).body.workout.exercises[0].targetWeightKg as number;
    expect(afterInc).toBeGreaterThan(60);
    expect(afterInc).toBeLessThanOrEqual(66); // never more than 10%

    // 3) Two struggling sessions → hold, then reduce.
    const s3 = await runSession(token, workout.id, 1, afterInc, 4);
    expect(s3.adaptations.find((a) => a.exerciseId === main.exerciseId)?.kind).toBe("maintain");
    const s4 = await runSession(token, workout.id, 1, afterInc, 5);
    expect(s4.adaptations.find((a) => a.exerciseId === main.exerciseId)?.kind).toBe("reduce_load");
    const after = (await request(app).get(`/workouts/${workout.id}`).set(auth(token))).body.workout.exercises[0].targetWeightKg as number;
    expect(after).toBeLessThan(afterInc);

    // Regenerating the plan keeps the adapted (reduced) load, not the last heavier attempt.
    const regen = (await request(app).post("/ai/workout-plan").set(auth(token)).send({})).body.plan as PlanView;
    const same = regen.workouts.flatMap((w) => w.exercises).find((e) => e.exerciseId === main.exerciseId);
    expect(same?.targetWeightKg).toBe(after);
  });

  it("reduces accessory volume after two very hard sessions", async () => {
    const token = await onboardedUser({ fitnessLevel: "intermediate", daysPerWeek: 3 });
    const plan = (await request(app).post("/ai/workout-plan").set(auth(token)).send({})).body.plan as PlanView;
    const w = plan.workouts[0]!;
    await runSession(token, w.id, "top", 40, 5);
    const res = await runSession(token, w.id, "top", 40, 5);
    expect(res.adaptations.some((a) => a.kind === "reduce_volume")).toBe(true);
    const updated = (await request(app).get(`/workouts/${w.id}`).set(auth(token))).body.workout;
    const before = w.exercises.filter((e) => e.position >= 2 && e.sets > 2 && !e.durationSeconds);
    for (const e of before) {
      expect(updated.exercises.find((x: { id: string }) => x.id === e.id).sets).toBe(e.sets - 1);
    }
  });

  it("does not adapt the plan from ad-hoc sessions", async () => {
    const token = await onboardedUser();
    await request(app).post("/ai/workout-plan").set(auth(token)).send({});
    const s = (await request(app).post("/workout-session").set(auth(token)).send({
      title: "Quick", exercises: [{ exerciseId: "push-up", sets: 1, repsMin: 8, repsMax: 12, durationSeconds: null, restSeconds: 60, targetWeightKg: null }],
    })).body.session as SessionView;
    await request(app).post(`/workout-session/${s.id}/set`).set(auth(token)).send({ sessionExerciseId: s.exercises[0]!.id, reps: 12, weightKg: null, durationSeconds: null });
    const res = await request(app).post(`/workout-session/${s.id}/complete`).set(auth(token)).send({ difficultyRating: 3 });
    expect(res.body.adaptations).toEqual([]);
  });
});
