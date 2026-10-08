import { describe, expect, it } from "vitest";
import request from "supertest";
import { EXERCISE_FORM_PROFILE, FORM_PROFILE_DEFS, type SessionView } from "@gymfit/shared";
import { EXERCISE_SEED } from "../src/db/seed/exercises.js";
import { EXERCISE_VIDEOS } from "../src/db/seed/exerciseVideos.js";
import { computeInsights } from "../src/engine/insights.js";
import { app, auth, onboardedUser } from "./helpers.js";

describe("form-check catalog", () => {
  it("only maps real exercises, and every issue has a cue and reason", () => {
    const ids = new Set(EXERCISE_SEED.map((e) => e.id));
    for (const id of Object.keys(EXERCISE_FORM_PROFILE)) expect(ids.has(id), id).toBe(true);
    for (const p of Object.values(FORM_PROFILE_DEFS)) {
      for (const i of p.issues) {
        expect(i.label && i.cue && i.why, `${p.id}.${i.code}`).toBeTruthy();
      }
    }
    for (const id of Object.keys(EXERCISE_VIDEOS)) expect(ids.has(id), id).toBe(true);
  });
});

async function sessionWith(token: string, exerciseId: string): Promise<SessionView> {
  const res = await request(app).post("/workout-session").set(auth(token)).send({
    title: "Form practice",
    exercises: [{ exerciseId, sets: 3, repsMin: 8, repsMax: 12, durationSeconds: null, restSeconds: 60, targetWeightKg: null }],
  });
  expect(res.status).toBe(201);
  return res.body.session;
}

describe("form-check results API", () => {
  it("stores metrics for a set and returns them with the session", async () => {
    const token = await onboardedUser();
    const s = await sessionWith(token, "push-up");
    const res = await request(app).post(`/workout-session/${s.id}/form-check`).set(auth(token)).send({
      sessionExerciseId: s.exercises[0]!.id,
      profile: "push_up",
      reps: 10,
      cleanReps: 7,
      durationSeconds: 42,
      issues: [{ code: "hips_sagging", severity: "risk", count: 3 }],
    });
    expect(res.status).toBe(201);
    const session = (await request(app).get(`/workout-session/${s.id}`).set(auth(token))).body.session as SessionView;
    expect(session.exercises[0]!.formChecks[0]).toMatchObject({ reps: 10, cleanReps: 7, profile: "push_up" });
    expect(session.exercises[0]!.formChecks[0]!.issues[0]!.code).toBe("hips_sagging");
  });

  it("rejects mismatched profiles, inconsistent numbers and other users' sessions", async () => {
    const token = await onboardedUser();
    const s = await sessionWith(token, "push-up");
    const base = { sessionExerciseId: s.exercises[0]!.id, profile: "push_up", reps: 5, cleanReps: 5, durationSeconds: 20, issues: [] };
    expect((await request(app).post(`/workout-session/${s.id}/form-check`).set(auth(token)).send({ ...base, profile: "squat" })).status).toBe(400);
    expect((await request(app).post(`/workout-session/${s.id}/form-check`).set(auth(token)).send({ ...base, cleanReps: 9 })).status).toBe(400);
    const other = await onboardedUser();
    expect((await request(app).post(`/workout-session/${s.id}/form-check`).set(auth(other)).send(base)).status).toBe(404);
  });

  it("flags repeated injury-risk issues as a safety insight", async () => {
    const token = await onboardedUser();
    for (let i = 0; i < 2; i++) {
      const s = await sessionWith(token, "push-up");
      await request(app).post(`/workout-session/${s.id}/form-check`).set(auth(token)).send({
        sessionExerciseId: s.exercises[0]!.id, profile: "push_up", reps: 8, cleanReps: 5, durationSeconds: 30,
        issues: [{ code: "hips_sagging", severity: "risk", count: 3 }],
      });
      await request(app).post(`/workout-session/${s.id}/abandon`).set(auth(token));
    }
    const insights = (await request(app).post("/ai/fitness-insight").set(auth(token)).send({})).body.insights;
    expect(insights[0]).toMatchObject({ kind: "safety", title: "Push-up: hips sagging keeps coming up", evidence: "Flagged in 2 of your last 2 camera checks" });
  });
});

describe("form-check insights (unit)", () => {
  const base = { today: "2026-10-08", goal: "muscle_gain" as const, daysPerWeek: 3, sessions: [], strength: [], weight: [], streakWeeks: 0 };
  const check = (cleanReps: number, issues: { code: string; severity: "risk" | "form" | "tip"; count: number }[] = []) => ({
    exerciseId: "goblet-squat", exerciseName: "Goblet Squat", profile: "squat" as const, date: "2026-10-07", reps: 10, cleanReps, issues,
  });

  it("praises three clean checks in a row", () => {
    const out = computeInsights({ ...base, formChecks: [check(10), check(10), check(10)] });
    expect(out.find((i) => i.kind === "progress")?.title).toBe("Clean form on Goblet Squat");
  });

  it("ignores a single occurrence and non-risk issues", () => {
    const out = computeInsights({ ...base, formChecks: [check(8, [{ code: "knees_caving", severity: "risk", count: 2 }]), check(9, [{ code: "torso_lean", severity: "form", count: 1 }])] });
    expect(out.some((i) => i.kind === "safety")).toBe(false);
  });
});
