import { describe, expect, it } from "vitest";
import request from "supertest";
import type { PlanView, SessionView, TodayResponse } from "@gymfit/shared";
import { app, auth, onboardedUser } from "./helpers.js";

const today = () => new Date().toISOString().slice(0, 10);

async function userWithPlan(overrides = {}) {
  const token = await onboardedUser(overrides);
  const res = await request(app).post("/workouts/plan").set(auth(token));
  expect(res.status).toBe(201);
  return { token, plan: res.body.plan as PlanView };
}

async function startSession(token: string): Promise<SessionView> {
  const plan = (await request(app).get("/workouts/plan").set(auth(token))).body.plan as PlanView;
  const res = await request(app).post("/workouts/start").set(auth(token)).send({ workoutId: plan.workouts[0]!.id });
  expect(res.status).toBe(201);
  return res.body.session;
}

describe("exercise library", () => {
  it("lists, filters and returns details with alternatives", async () => {
    const token = await onboardedUser({ location: "home", equipment: ["dumbbells"] });
    const all = await request(app).get("/exercises").set(auth(token));
    expect(all.body.exercises.length).toBeGreaterThan(50);

    const chest = await request(app).get("/exercises?muscle=chest&difficulty=beginner").set(auth(token));
    for (const e of chest.body.exercises) {
      expect([...e.primaryMuscles, ...e.secondaryMuscles]).toContain("chest");
      expect(e.difficulty).toBe("beginner");
    }

    const mine = await request(app).get("/exercises?availableOnly=true").set(auth(token));
    for (const e of mine.body.exercises) {
      expect(e.equipment.every((x: string) => ["bodyweight", "dumbbell"].includes(x))).toBe(true);
    }

    const detail = await request(app).get("/exercises/barbell-bench-press").set(auth(token));
    expect(detail.body.exercise.instructions.length).toBeGreaterThan(0);
    expect(detail.body.exercise.alternatives[0].available).toBe(true);
    expect((await request(app).get("/exercises/nope").set(auth(token))).status).toBe(404);
    expect((await request(app).get("/exercises?difficulty=expert").set(auth(token))).status).toBe(400);
  });
});

describe("plans and today's workout", () => {
  it("generates a plan matching the profile and exposes today's workout", async () => {
    const { token, plan } = await userWithPlan();
    expect(plan.workouts).toHaveLength(4);
    expect(plan.source).toBe("rule_engine");
    expect(plan.workouts[0]!.exercises[0]!.exerciseName).toBeTruthy();

    const res = await request(app).get("/workouts/today").set(auth(token)).set("X-Client-Date", today());
    const body = res.body as TodayResponse;
    expect(body.plan?.id).toBe(plan.id);
    expect(body.workout).not.toBeNull(); // either today's workout or the next in rotation on a rest day
    expect(body.schedule?.days).toHaveLength(7);
  });

  it("archives the previous plan when regenerating", async () => {
    const { token, plan } = await userWithPlan();
    const again = await request(app).post("/workouts/plan").set(auth(token));
    expect(again.body.plan.id).not.toBe(plan.id);
    expect((await request(app).get(`/workouts/${plan.workouts[0]!.id}`).set(auth(token))).status).toBe(200);
  });

  it("requires onboarding before generating a plan", async () => {
    const reg = await request(app).post("/auth/register").send({ email: `np${Date.now()}@example.com`, password: "password123" });
    const res = await request(app).post("/workouts/plan").set(auth(reg.body.token));
    expect(res.status).toBe(404);
  });
});

describe("workout session tracking", () => {
  it("tracks sets, skip, replace, pause and completion", async () => {
    const { token } = await userWithPlan();
    const session = await startSession(token);
    expect(session.status).toBe("in_progress");
    const [first, second, third] = session.exercises;

    // Only one active session at a time
    const dup = await request(app).post("/workouts/start").set(auth(token)).send({});
    expect(dup.status).toBe(409);

    // Log two sets on the first exercise and undo one
    const s1 = await request(app).post(`/workout-session/${session.id}/set`).set(auth(token))
      .send({ sessionExerciseId: first!.id, reps: 10, weightKg: 20, durationSeconds: null });
    expect(s1.status).toBe(201);
    expect(s1.body.set.setNumber).toBe(1);
    const s2 = await request(app).post(`/workout-session/${session.id}/set`).set(auth(token))
      .send({ sessionExerciseId: first!.id, reps: 9, weightKg: 20, durationSeconds: null });
    expect(s2.body.set.setNumber).toBe(2);
    expect((await request(app).delete(`/workout-session/${session.id}/set/${s2.body.set.id}`).set(auth(token))).status).toBe(204);

    // Skip one exercise and replace another
    const skipped = await request(app).patch(`/workout-session/${session.id}/exercise/${second!.id}`).set(auth(token)).send({ action: "skip" });
    expect(skipped.body.session.exercises[1].status).toBe("skipped");
    const replaced = await request(app).patch(`/workout-session/${session.id}/exercise/${third!.id}`).set(auth(token))
      .send({ action: "replace", exerciseId: "push-up" });
    expect(replaced.status).toBe(200);
    expect(replaced.body.session.exercises[2]).toMatchObject({ exerciseId: "push-up", replacedFromName: third!.exerciseName });

    // Pause / resume
    const paused = await request(app).post(`/workout-session/${session.id}/pause`).set(auth(token)).send({ paused: true });
    expect(paused.body.session.pausedAt).not.toBeNull();
    const resumed = await request(app).post(`/workout-session/${session.id}/pause`).set(auth(token)).send({ paused: false });
    expect(resumed.body.session.pausedAt).toBeNull();

    // Complete
    const done = await request(app).post(`/workout-session/${session.id}/complete`).set(auth(token))
      .send({ difficultyRating: 3, feedback: "Felt good" });
    expect(done.status).toBe(200);
    expect(done.body.session.status).toBe("completed");
    expect(done.body.session.durationSeconds).toBeGreaterThanOrEqual(0);
    expect(done.body.session.exercises[0].status).toBe("completed");
    expect(Array.isArray(done.body.adaptations)).toBe(true);

    // No more edits once completed
    const late = await request(app).post(`/workout-session/${session.id}/set`).set(auth(token))
      .send({ sessionExerciseId: first!.id, reps: 5, weightKg: 20, durationSeconds: null });
    expect(late.status).toBe(409);

    const history = await request(app).get("/workout-session").set(auth(token));
    expect(history.body.sessions[0]).toMatchObject({ id: session.id, setsCompleted: 1, volumeKg: 200 });

    const t = await request(app).get("/workouts/today").set(auth(token)).set("X-Client-Date", today());
    expect((t.body as TodayResponse).schedule!.completedCount).toBe(1);
  });

  it("rejects replacements that conflict with limitations", async () => {
    const { token } = await userWithPlan({ limitations: ["avoid_overhead"] });
    const session = await startSession(token);
    const res = await request(app).patch(`/workout-session/${session.id}/exercise/${session.exercises[0]!.id}`).set(auth(token))
      .send({ action: "replace", exerciseId: "overhead-press" });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/limitations/);
  });

  it("refuses to complete a session with no sets and allows abandoning it", async () => {
    const { token } = await userWithPlan();
    const session = await startSession(token);
    const res = await request(app).post(`/workout-session/${session.id}/complete`).set(auth(token)).send({ difficultyRating: 3 });
    expect(res.status).toBe(400);
    expect((await request(app).post(`/workout-session/${session.id}/abandon`).set(auth(token))).status).toBe(204);
    expect((await request(app).get("/workout-session/active").set(auth(token))).body.session).toBeNull();
  });

  it("isolates sessions between users and 404s malformed ids", async () => {
    const a = await userWithPlan();
    const b = await userWithPlan();
    const session = await startSession(a.token);
    expect((await request(app).get(`/workout-session/${session.id}`).set(auth(b.token))).status).toBe(404);
    expect((await request(app).get(`/workout-session/not-a-uuid`).set(auth(a.token))).status).toBe(404);
  });

  it("starts ad-hoc sessions from structured exercise lists", async () => {
    const { token } = await userWithPlan();
    const res = await request(app).post("/workout-session").set(auth(token)).send({
      title: "Quick pump",
      exercises: [{ exerciseId: "push-up", sets: 2, repsMin: 8, repsMax: 12, durationSeconds: null, restSeconds: 60, targetWeightKg: null }],
    });
    expect(res.status).toBe(201);
    expect(res.body.session.exercises[0].exerciseName).toBe("Push-up");
    const bad = await request(app).post("/workout-session").set(auth(token)).send({
      title: "x",
      exercises: [{ exerciseId: "made-up", sets: 2, repsMin: 8, repsMax: 12, durationSeconds: null, restSeconds: 60, targetWeightKg: null }],
    });
    expect(bad.status).toBe(400); // input is validated before the active-session check
    expect(bad.body.error.message).toMatch(/Unknown exercise/);
  });
});
