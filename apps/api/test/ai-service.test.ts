import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { ChatResponse, DailyWorkoutResponse, InsightsResponse, PlanView, RecommendExerciseResponse } from "@gymfit/shared";
import { pool } from "../src/db/pool.js";
import { setProviderForTests } from "../src/ai/providers/index.js";
import { DevMockProvider } from "../src/ai/providers/devMock.js";
import { AiProviderError, type LlmProvider, type StructuredRequest } from "../src/ai/providers/types.js";
import { app, auth, onboardedUser } from "./helpers.js";

/** A scriptable fake LLM: `respond` decides what the "model" returns per task. */
function fakeProvider(respond: (req: StructuredRequest<unknown>) => unknown): LlmProvider & { calls: StructuredRequest<unknown>[] } {
  const calls: StructuredRequest<unknown>[] = [];
  return {
    name: "anthropic",
    model: "fake-model",
    source: "ai",
    calls,
    async generate<T>(req: StructuredRequest<T>) {
      calls.push(req as StructuredRequest<unknown>);
      const out = respond(req as StructuredRequest<unknown>);
      const parsed = req.schema.safeParse(out);
      if (!parsed.success) throw new AiProviderError("invalid", "invalid_output");
      return { data: parsed.data, model: "fake-model" };
    },
  };
}

afterEach(() => setProviderForTests(null));

describe("AI workout plan", () => {
  it("uses the rule engine when no provider is configured", async () => {
    const token = await onboardedUser();
    const res = await request(app).post("/ai/workout-plan").set(auth(token)).send({});
    expect(res.status).toBe(201);
    expect(res.body.meta).toMatchObject({ source: "rule_engine", fallbackReason: null });
    expect((res.body.plan as PlanView).source).toBe("rule_engine");
  });

  it("saves a valid AI plan and labels it as AI", async () => {
    const fake = fakeProvider((req) => req.devMockOutput());
    setProviderForTests(fake);
    const token = await onboardedUser();
    const res = await request(app).post("/ai/workout-plan").set(auth(token)).send({ preference: "more legs" });
    expect(res.body.meta).toMatchObject({ source: "ai", model: "fake-model" });
    expect((res.body.plan as PlanView).source).toBe("ai");
    // The model received real user context and only allowed exercises
    const prompt = JSON.parse(fake.calls[0]!.prompt);
    expect(prompt.context.user.goal).toBe("muscle_gain");
    expect(prompt.preference).toBe("more legs");
    expect(prompt.allowedExercises.length).toBeGreaterThan(10);
  });

  it("rejects an unsafe AI plan, falls back, and records why", async () => {
    setProviderForTests(fakeProvider((req) => {
      const plan = structuredClone(req.devMockOutput()) as { workouts: { exercises: { exerciseId: string }[] }[] };
      plan.workouts[0]!.exercises[0]!.exerciseId = "overhead-press"; // contraindicated below
      return plan;
    }));
    const token = await onboardedUser({ limitations: ["avoid_overhead"] });
    const res = await request(app).post("/ai/workout-plan").set(auth(token)).send({});
    expect(res.body.meta.source).toBe("rule_engine");
    expect(res.body.meta.fallbackReason).toMatch(/didn't pass/);
    const ids = (res.body.plan as PlanView).workouts.flatMap((w) => w.exercises.map((e) => e.exerciseId));
    expect(ids).not.toContain("overhead-press");
    const { rows } = await pool.query(
      "SELECT validation_errors FROM ai_recommendations WHERE validation_status = 'rejected' ORDER BY created_at DESC LIMIT 1",
    );
    expect(JSON.stringify(rows[0]!.validation_errors)).toMatch(/Barbell Overhead Press is not allowed/);
  });

  it("falls back when the provider refuses or errors", async () => {
    setProviderForTests({ name: "anthropic", model: "x", source: "ai", generate: async () => { throw new AiProviderError("declined", "refusal"); } });
    const token = await onboardedUser();
    const res = await request(app).post("/ai/workout-plan").set(auth(token)).send({});
    expect(res.status).toBe(201);
    expect(res.body.meta).toMatchObject({ source: "rule_engine" });
    expect(res.body.meta.fallbackReason).toMatch(/refusal/);
  });

  it("labels dev-mock output as dev_mock, never as AI", async () => {
    setProviderForTests(new DevMockProvider());
    const token = await onboardedUser();
    const res = await request(app).post("/ai/workout-plan").set(auth(token)).send({});
    expect(res.body.meta.source).toBe("dev_mock");
    expect((await request(app).get("/ai/status").set(auth(token))).body).toEqual({ provider: "mock", model: "dev-mock", llmEnabled: false });
  });
});

describe("AI daily workout, alternatives and insights", () => {
  it("condenses today's workout to the time available", async () => {
    const token = await onboardedUser({ sessionMinutes: 75 });
    await request(app).post("/ai/workout-plan").set(auth(token)).send({});
    const res = await request(app).post("/ai/daily-workout").set(auth(token)).send({ minutes: 30 });
    const body = res.body as DailyWorkoutResponse;
    expect(body.workout.estimatedMinutes).toBeLessThanOrEqual(33);
    expect(body.basedOnWorkoutId).toBeTruthy();
    expect(body.workout.exercises[0]!.exerciseName).toBeTruthy();

    const plan = (await request(app).get("/workouts/plan").set(auth(token))).body.plan as PlanView;
    const other = plan.workouts[2]!;
    const specific = (await request(app).post("/ai/daily-workout").set(auth(token)).send({ minutes: 30, workoutId: other.id })).body as DailyWorkoutResponse;
    expect(specific.basedOnWorkoutId).toBe(other.id);
    expect(specific.workout.exercises[0]!.exerciseId).toBe(other.exercises[0]!.exerciseId);
  });

  it("builds a focus workout and rejects AI workouts that blow the time budget", async () => {
    setProviderForTests(fakeProvider((req) => {
      const w = structuredClone(req.devMockOutput()) as { exercises: { sets: number }[] };
      w.exercises.forEach((e) => (e.sets = 6));
      return w;
    }));
    const token = await onboardedUser();
    const res = await request(app).post("/ai/daily-workout").set(auth(token)).send({ minutes: 20, focus: "core" });
    expect(res.body.meta.source).toBe("rule_engine");
    expect(res.body.workout.estimatedMinutes).toBeLessThanOrEqual(22);
  });

  it("recommends equipment-aware alternatives and rejects ids outside the candidate set", async () => {
    setProviderForTests(fakeProvider(() => ({ alternatives: [{ exerciseId: "barbell-back-squat", reason: "x" }] })));
    const token = await onboardedUser({ location: "home", equipment: ["dumbbells"] });
    const res = await request(app).post("/ai/recommend-exercise").set(auth(token)).send({ exerciseId: "barbell-bench-press", reason: "I don't have a barbell" });
    const body = res.body as RecommendExerciseResponse;
    expect(body.meta.source).toBe("rule_engine");
    expect(body.alternatives[0]!.available).toBe(true);
    expect(body.alternatives.map((a) => a.exercise.id)).toContain("dumbbell-bench-press");
  });

  it("only accepts AI insights that are backed by computed evidence", async () => {
    setProviderForTests(fakeProvider(() => ({ insights: [{ kind: "progress", title: "Huge gains", message: "You added 40 kg!", evidence: "made up" }] })));
    const token = await onboardedUser();
    const res = await request(app).post("/ai/fitness-insight").set(auth(token)).send({});
    const body = res.body as InsightsResponse;
    expect(body.meta.source).toBe("rule_engine");
    expect(body.insights[0]!.evidence).toBe("No workouts logged yet");
  });
});

describe("AI chat assistant", () => {
  async function ask(token: string, message: string, conversationId?: string) {
    const res = await request(app).post("/ai/chat").set(auth(token)).send({ message, conversationId });
    expect(res.status).toBe(200);
    return res.body as ChatResponse;
  }

  it("answers from the user's real data in offline mode", async () => {
    const token = await onboardedUser();
    await request(app).post("/ai/workout-plan").set(auth(token)).send({});
    const today = await ask(token, "What should I train today?");
    expect(today.meta.source).toBe("rule_engine");
    expect(today.message.content).toMatch(/Upper Body|Lower Body|Full Body/);
    expect(today.message.actions[0]?.type).toBe("start_today");

    const short = await ask(token, "I only have 30 minutes today", today.conversationId);
    expect(short.conversationId).toBe(today.conversationId);
    expect(short.message.actions[0]).toMatchObject({ type: "quick_workout", minutes: 30 });

    const alt = await ask(token, "Give me an alternative for squats", today.conversationId);
    expect(alt.message.content).toMatch(/Alternatives to/);
    expect(alt.message.actions.every((a) => a.type === "view_exercise")).toBe(true);

    expect((await ask(token, "I missed yesterday's workout. What should I do?")).message.content).toMatch(/missed session/);
    expect((await ask(token, "Why am I not progressing?")).message.content).toMatch(/what your data shows/i);
    expect((await ask(token, "Create a beginner workout for me")).message.actions[0]).toMatchObject({ type: "quick_workout" });

    const latest = await request(app).get("/ai/conversations/latest").set(auth(token));
    expect(latest.body.conversation.messages.length).toBeGreaterThanOrEqual(2);
  });

  it("never sends emergencies to the model", async () => {
    const fake = fakeProvider(() => ({ reply: "keep going!", actions: [], safetyNote: null }));
    setProviderForTests(fake);
    const token = await onboardedUser();
    const res = await ask(token, "I have chest pain after my sets, should I keep going?");
    expect(fake.calls).toHaveLength(0);
    expect(res.message.content).toMatch(/emergency services or a doctor/);
  });

  it("blocks unsafe model replies and adds safety notes", async () => {
    setProviderForTests(fakeProvider(() => ({ reply: "Eat 800 calories a day to lean out fast.", actions: [], safetyNote: null })));
    const token = await onboardedUser();
    const blocked = await ask(token, "How should I diet?");
    expect(blocked.message.content).not.toMatch(/800/);
    expect(blocked.meta.source).toBe("rule_engine");

    setProviderForTests(fakeProvider(() => ({ reply: "Swap to goblet squats for now.", actions: [{ type: "view_exercise", exerciseId: "not-real" }], safetyNote: null })));
    const pain = await ask(token, "my knee hurts on squats");
    expect(pain.meta.source).toBe("ai");
    expect(pain.message.safetyNote).toMatch(/physiotherapist/);
    expect(pain.message.actions).toEqual([]); // invalid exercise id dropped
  });

  it("isolates conversations between users", async () => {
    const a = await onboardedUser();
    const b = await onboardedUser();
    const conv = await ask(a, "hello");
    const res = await request(app).post("/ai/chat").set(auth(b)).send({ message: "hi", conversationId: conv.conversationId });
    expect(res.status).toBe(404);
  });
});
