import { describe, expect, it } from "vitest";
import request from "supertest";
import type { ProgressOverview } from "@gymfit/shared";
import { app, auth, onboardedUser } from "./helpers.js";
import { addDays } from "../src/lib/dates.js";

const today = new Date().toISOString().slice(0, 10);
const get = async (token: string) =>
  (await request(app).get("/progress").set(auth(token)).set("X-Client-Date", today)).body.progress as ProgressOverview;

describe("progress API", () => {
  it("starts from the onboarding weight and tracks weight + goal progress", async () => {
    const token = await onboardedUser({ goal: "weight_loss", weightKg: 90, targetWeightKg: 80 });
    const first = await get(token);
    expect(first.currentWeightKg).toBe(90);
    expect(first.totalWorkouts).toBe(0);
    expect(first.goal.percent).toBe(0);
    expect(first.bmi).toEqual({ value: 29.4, category: "overweight" });

    const res = await request(app).post("/progress").set(auth(token)).set("X-Client-Date", today)
      .send({ type: "weight", data: { recordedOn: today, weightKg: 85 } });
    expect(res.status).toBe(201);
    const p = res.body.progress as ProgressOverview;
    expect(p.currentWeightKg).toBe(85);
    expect(p.weight).toHaveLength(1); // same-day entry overwrites
  });

  it("records weight history across days and measurements", async () => {
    const token = await onboardedUser({ goal: "weight_loss", weightKg: 90, targetWeightKg: 80 });
    const yesterday = addDays(today, -1);
    // Onboarding stored 90 kg today; add an older and a newer-in-time entry
    await request(app).post("/progress").set(auth(token)).set("X-Client-Date", today)
      .send({ type: "weight", data: { recordedOn: yesterday, weightKg: 91 } });
    await request(app).post("/progress").set(auth(token)).set("X-Client-Date", today)
      .send({ type: "measurement", data: { recordedOn: today, waistCm: 92 } });
    const merged = await request(app).post("/progress").set(auth(token)).set("X-Client-Date", today)
      .send({ type: "measurement", data: { recordedOn: today, chestCm: 104 } });
    const p = merged.body.progress as ProgressOverview;
    expect(p.weight.map((w) => w.weightKg)).toEqual([91, 90]);
    expect(p.measurements).toHaveLength(1);
    expect(p.measurements[0]).toMatchObject({ waistCm: 92, chestCm: 104 }); // same-day entries merge
  });

  it("validates entries", async () => {
    const token = await onboardedUser();
    const future = await request(app).post("/progress").set(auth(token)).set("X-Client-Date", today)
      .send({ type: "weight", data: { recordedOn: addDays(today, 5), weightKg: 70 } });
    expect(future.status).toBe(400);
    const empty = await request(app).post("/progress").set(auth(token))
      .send({ type: "measurement", data: { recordedOn: today } });
    expect(empty.status).toBe(400);
    const silly = await request(app).post("/progress").set(auth(token))
      .send({ type: "weight", data: { recordedOn: today, weightKg: 5 } });
    expect(silly.status).toBe(400);
  });

  it("reflects completed workouts in totals, activity and strength", async () => {
    const token = await onboardedUser();
    const plan = (await request(app).post("/workouts/plan").set(auth(token))).body.plan;
    const session = (await request(app).post("/workouts/start").set(auth(token)).set("X-Client-Date", today)
      .send({ workoutId: plan.workouts[0].id })).body.session;
    const loaded = session.exercises.find((e: { loaded: boolean }) => e.loaded);
    await request(app).post(`/workout-session/${session.id}/set`).set(auth(token))
      .send({ sessionExerciseId: loaded.id, reps: 8, weightKg: 30, durationSeconds: null });
    await request(app).post(`/workout-session/${session.id}/complete`).set(auth(token)).send({ difficultyRating: 3 });

    const p = await get(token);
    expect(p.totalWorkouts).toBe(1);
    expect(p.thisWeek.completed).toBe(1);
    expect(p.weeklyActivity.at(-1)!.volumeKg).toBe(240);
    expect(p.strength[0]).toMatchObject({ exerciseId: loaded.exerciseId });
    expect(p.strength[0]!.points[0]!.estimated1RmKg).toBe(38);
  });
});
