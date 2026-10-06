import {
  aiAlternativesOutputSchema,
  aiChatOutputSchema,
  aiInsightOutputSchema,
  aiPlanOutputSchema,
  plannedWorkoutSchema,
  type AiChatOutput,
  type AiMeta,
  type AiSource,
  type ChatMessageView,
  type ChatResponse,
  type ConversationView,
  type DailyWorkoutRequest,
  type DailyWorkoutResponse,
  type Exercise,
  type InsightsResponse,
  type PlanView,
  type PlannedWorkout,
  type RecommendExerciseResponse,
} from "@gymfit/shared";
import { pool, withTransaction, type Queryable } from "../db/pool.js";
import { badRequest, notFound } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { findAlternatives } from "../engine/alternatives.js";
import { eligibleExercises } from "../engine/filters.js";
import { generatePlan } from "../engine/planGenerator.js";
import { estimateWorkoutMinutes } from "../engine/prescription.js";
import { condenseWorkout, generateQuickWorkout } from "../engine/quickWorkout.js";
import { savePlan, getActivePlan } from "../modules/workouts/repository.js";
import { buildUserContext, promptContext, type UserContext } from "./context.js";
import { offlineAnswer } from "./offlineAssistant.js";
import { ALTERNATIVES_SYSTEM, CHAT_SYSTEM, DAILY_SYSTEM, INSIGHT_SYSTEM, PLAN_SYSTEM } from "./prompts.js";
import { getProvider } from "./providers/index.js";
import { AiProviderError, type LlmProvider } from "./providers/types.js";
import { checkModelOutput, checkUserMessage } from "./safety.js";
import { validatePlan, validateWorkout } from "./validation.js";

type RecKind = "workout_plan" | "daily_workout" | "exercise_alternatives" | "insight" | "chat";

async function record(
  db: Queryable,
  userId: string,
  kind: RecKind,
  source: AiSource,
  model: string | null,
  input: unknown,
  output: unknown,
  status: "valid" | "rejected" | "not_applicable",
  errors: string[] | null = null,
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO ai_recommendations (user_id, kind, source, model, input_context, output, validation_status, validation_errors)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [userId, kind, source, model, JSON.stringify(input), JSON.stringify(output ?? null), status, errors ? JSON.stringify(errors) : null],
  );
  return rows[0]!.id;
}

function allowedList(exercises: readonly Exercise[]) {
  return exercises.map((e) => ({
    id: e.id, name: e.name, pattern: e.pattern, mechanics: e.mechanics, primaryMuscles: e.primaryMuscles,
    equipment: e.equipment, difficulty: e.difficulty, measure: e.measure, loaded: e.loaded,
  }));
}

/**
 * Runs an LLM task and validates the result. Returns null (with a reason)
 * when the provider is absent, errors, or produces output that fails
 * domain validation — callers then use the deterministic engine result.
 */
async function tryLlm<T>(
  provider: LlmProvider | null,
  run: (p: LlmProvider) => Promise<{ data: T; model: string }>,
  validate: (data: T) => string[],
): Promise<{ ok: true; data: T; model: string } | { ok: false; reason: string | null; errors: string[]; output: unknown }> {
  if (!provider) return { ok: false, reason: null, errors: [], output: null };
  try {
    const { data, model } = await run(provider);
    const errors = validate(data);
    if (errors.length) {
      logger.warn({ errors: errors.slice(0, 5) }, "AI output rejected by validation");
      return { ok: false, reason: "The AI suggestion didn't pass safety/feasibility checks, so the built-in engine was used.", errors, output: data };
    }
    return { ok: true, data, model };
  } catch (err) {
    if (err instanceof AiProviderError) {
      return { ok: false, reason: `AI unavailable (${err.kind.replace("_", " ")}); used the built-in engine.`, errors: [err.message], output: null };
    }
    throw err;
  }
}

const meta = (source: AiSource, model: string | null, fallbackReason: string | null, recommendationId: string | null): AiMeta => ({
  source, model, fallbackReason, recommendationId,
});

/* ------------------------------------------------------------------ */
/* generateWorkoutPlan                                                 */
/* ------------------------------------------------------------------ */

export async function generateWorkoutPlan(userId: string, today: string, preference?: string): Promise<{ plan: PlanView; warnings: string[]; meta: AiMeta }> {
  const ctx = await buildUserContext(userId, today);
  if (!ctx.profile.onboardingCompleted) throw badRequest("Complete onboarding first");
  const baseline = generatePlan(ctx.library, ctx.engineProfile, ctx.loadHistory);
  const provider = getProvider();
  const allowed = eligibleExercises(ctx.library, ctx.engineProfile);
  const input = { context: promptContext(ctx), preference: preference ?? null };

  const result = await tryLlm(
    provider,
    (p) =>
      p.generate({
        task: "workout_plan",
        system: PLAN_SYSTEM,
        prompt: JSON.stringify({ ...input, allowedExercises: allowedList(allowed), baselinePlan: baseline.plan }),
        schema: aiPlanOutputSchema,
        effort: "medium",
        devMockOutput: () => baseline.plan,
      }),
    (plan) => validatePlan(plan, { profile: ctx.engineProfile, library: ctx.library, loadHistory: ctx.loadHistory }).errors,
  );

  const { recId, source, model } = await withTransaction(async (db) => {
    if (result.ok) {
      const recId = await record(db, userId, "workout_plan", provider!.source, result.model, input, result.data, "valid");
      await savePlan(db, userId, result.data, provider!.source, recId);
      return { recId, source: provider!.source, model: result.model };
    }
    if (provider) await record(db, userId, "workout_plan", provider.source, provider.model, input, result.output, "rejected", result.errors);
    const recId = await record(db, userId, "workout_plan", "rule_engine", null, input, baseline.plan, "not_applicable");
    await savePlan(db, userId, baseline.plan, "rule_engine", recId);
    return { recId, source: "rule_engine" as const, model: null };
  });
  const plan = (await getActivePlan(userId, ctx.byId))!;
  return { plan, warnings: result.ok ? [] : baseline.warnings, meta: meta(source, model, result.ok ? null : result.reason, recId) };
}

/* ------------------------------------------------------------------ */
/* generateDailyWorkout                                                */
/* ------------------------------------------------------------------ */

function baselineDaily(ctx: UserContext, req: DailyWorkoutRequest): { workout: PlannedWorkout; basedOn: string | null } {
  const minutes = req.minutes ?? ctx.profile.sessionMinutes;
  const today = req.workoutId
    ? ctx.plan?.workouts.find((w) => w.id === req.workoutId) ?? null
    : ctx.todayInfo.workout;
  if (req.workoutId && !today) throw notFound("Workout");
  if (!req.focus && today) {
    const exercises = condenseWorkout(today.exercises, minutes);
    const title = minutes < today.estimatedMinutes ? `${today.title} · ${minutes} min` : today.title;
    return { workout: { dayOfWeek: today.dayOfWeek, title, focus: today.focus, exercises }, basedOn: today.id };
  }
  return { workout: generateQuickWorkout(ctx.library, ctx.engineProfile, { minutes, focus: req.focus ?? "full_body" }, ctx.loadHistory), basedOn: null };
}

export async function generateDailyWorkout(userId: string, today: string, req: DailyWorkoutRequest): Promise<DailyWorkoutResponse> {
  const ctx = await buildUserContext(userId, today);
  const minutes = req.minutes ?? ctx.profile.sessionMinutes;
  const baseline = baselineDaily(ctx, req);
  const provider = getProvider();
  const allowed = eligibleExercises(ctx.library, ctx.engineProfile);
  const input = { context: promptContext(ctx), request: { minutes, focus: req.focus ?? null } };

  const result = await tryLlm(
    provider,
    (p) =>
      p.generate({
        task: "daily_workout",
        system: DAILY_SYSTEM,
        prompt: JSON.stringify({ ...input, allowedExercises: allowedList(allowed), baselineWorkout: baseline.workout }),
        schema: plannedWorkoutSchema,
        effort: "low",
        devMockOutput: () => baseline.workout,
      }),
    (w) => validateWorkout(w, { profile: ctx.engineProfile, library: ctx.library, budgetMinutes: minutes, loadHistory: ctx.loadHistory }),
  );
  const workout = result.ok ? result.data : baseline.workout;
  const source: AiSource = result.ok ? provider!.source : "rule_engine";
  if (!result.ok && provider) {
    await record(pool, userId, "daily_workout", provider.source, provider.model, input, result.output, "rejected", result.errors);
  }
  const recId = await record(pool, userId, "daily_workout", source, result.ok ? result.model : null, input, workout, result.ok ? "valid" : "not_applicable");
  return {
    workout: {
      title: workout.title,
      focus: workout.focus,
      estimatedMinutes: estimateWorkoutMinutes(workout.exercises),
      exercises: workout.exercises.map((e) => ({ ...e, exerciseName: ctx.byId.get(e.exerciseId)?.name ?? e.exerciseId })),
    },
    basedOnWorkoutId: baseline.basedOn,
    meta: meta(source, result.ok ? result.model : null, result.ok ? null : result.reason, recId),
  };
}

/* ------------------------------------------------------------------ */
/* recommendExercise                                                   */
/* ------------------------------------------------------------------ */

export async function recommendExercise(userId: string, today: string, exerciseId: string, reason?: string): Promise<RecommendExerciseResponse> {
  const ctx = await buildUserContext(userId, today);
  const target = ctx.byId.get(exerciseId);
  if (!target) throw notFound("Exercise");
  const candidates = findAlternatives(target, ctx.library, ctx.profile, 8);
  const baseline = candidates.slice(0, 5);
  const provider = getProvider();
  const input = {
    exercise: { id: target.id, name: target.name, pattern: target.pattern },
    reason_userProvided: reason ?? null,
    user: promptContext(ctx).user,
  };
  const candidateIds = new Set(candidates.map((c) => c.exercise.id));

  const result = await tryLlm(
    candidates.length ? provider : null,
    (p) =>
      p.generate({
        task: "exercise_alternatives",
        system: ALTERNATIVES_SYSTEM,
        prompt: JSON.stringify({
          ...input,
          candidates: candidates.map((c) => ({ id: c.exercise.id, name: c.exercise.name, available: c.available, equipment: c.exercise.equipment, difficulty: c.exercise.difficulty })),
        }),
        schema: aiAlternativesOutputSchema,
        effort: "low",
        devMockOutput: () => ({ alternatives: baseline.map((b) => ({ exerciseId: b.exercise.id, reason: b.reason })) }),
      }),
    (out) => {
      const bad = out.alternatives.filter((a) => !candidateIds.has(a.exerciseId)).map((a) => `"${a.exerciseId}" is not an allowed candidate`);
      const ids = out.alternatives.map((a) => a.exerciseId);
      if (new Set(ids).size !== ids.length) bad.push("duplicate alternatives");
      return bad;
    },
  );

  const alternatives = result.ok
    ? result.data.alternatives.map((a) => {
        const c = candidates.find((x) => x.exercise.id === a.exerciseId)!;
        return { exercise: c.exercise, available: c.available, reason: a.reason };
      })
    : baseline;
  const source: AiSource = result.ok ? provider!.source : "rule_engine";
  const recId = await record(pool, userId, "exercise_alternatives", source, result.ok ? result.model : null, input,
    alternatives.map((a) => ({ id: a.exercise.id, reason: a.reason })), result.ok ? "valid" : result.errors.length ? "rejected" : "not_applicable",
    result.ok ? null : result.errors.length ? result.errors : null);
  return { exercise: target, alternatives, meta: meta(source, result.ok ? result.model : null, result.ok ? null : result.reason, recId) };
}

/* ------------------------------------------------------------------ */
/* generateFitnessInsight                                              */
/* ------------------------------------------------------------------ */

export async function generateFitnessInsight(userId: string, today: string): Promise<InsightsResponse> {
  const ctx = await buildUserContext(userId, today);
  const computed = ctx.insights;
  const provider = getProvider();
  if (computed.length === 0) return { insights: [], meta: meta("rule_engine", null, null, null) };

  const result = await tryLlm(
    provider,
    (p) =>
      p.generate({
        task: "insight",
        system: INSIGHT_SYSTEM,
        prompt: JSON.stringify({ user: promptContext(ctx).user, computedInsights: computed }),
        schema: aiInsightOutputSchema,
        effort: "low",
        devMockOutput: () => ({ insights: computed }),
      }),
    // The model may reword, but every insight must map to a computed one (same kind + evidence).
    (out) =>
      out.insights
        .filter((i) => !computed.some((c) => c.kind === i.kind && c.evidence === i.evidence))
        .map((i) => `Insight "${i.title}" is not backed by computed evidence`),
  );
  const insights = result.ok ? result.data.insights : computed;
  const source: AiSource = result.ok ? provider!.source : "rule_engine";
  const recId = await record(pool, userId, "insight", source, result.ok ? result.model : null, { computed }, insights,
    result.ok ? "valid" : result.errors.length ? "rejected" : "not_applicable", result.ok || !result.errors.length ? null : result.errors);
  return { insights, meta: meta(source, result.ok ? result.model : null, result.ok ? null : result.reason, recId) };
}

/* ------------------------------------------------------------------ */
/* answerFitnessQuestion (chat)                                        */
/* ------------------------------------------------------------------ */

async function ensureConversation(userId: string, conversationId: string | undefined, firstMessage: string): Promise<string> {
  if (conversationId) {
    const { rows } = await pool.query("SELECT id FROM ai_conversations WHERE id = $1 AND user_id = $2", [conversationId, userId]);
    if (!rows[0]) throw notFound("Conversation");
    return conversationId;
  }
  const { rows } = await pool.query<{ id: string }>(
    "INSERT INTO ai_conversations (user_id, title) VALUES ($1, $2) RETURNING id",
    [userId, firstMessage.slice(0, 60)],
  );
  return rows[0]!.id;
}

interface MessageRow {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions: ChatMessageView["actions"];
  safety_note: string | null;
  source: AiSource | null;
  created_at: Date;
}

const toMessage = (r: MessageRow): ChatMessageView => ({
  id: r.id, role: r.role, content: r.content, actions: r.actions, safetyNote: r.safety_note, source: r.source, createdAt: r.created_at.toISOString(),
});

async function insertMessage(conversationId: string, role: "user" | "assistant", content: string, actions: unknown[] = [], safetyNote: string | null = null, source: AiSource | null = null) {
  const { rows } = await pool.query<MessageRow>(
    `INSERT INTO ai_messages (conversation_id, role, content, actions, safety_note, source) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [conversationId, role, content, JSON.stringify(actions), safetyNote, source],
  );
  await pool.query("UPDATE ai_conversations SET updated_at = now() WHERE id = $1", [conversationId]);
  return toMessage(rows[0]!);
}

/** Drops actions that reference unknown exercises. */
function sanitizeActions(out: AiChatOutput, ctx: UserContext): AiChatOutput["actions"] {
  return out.actions.filter((a) => a.type !== "view_exercise" || ctx.byId.has(a.exerciseId));
}

export async function answerFitnessQuestion(userId: string, today: string, input: { conversationId?: string; message: string }): Promise<ChatResponse> {
  const conversationId = await ensureConversation(userId, input.conversationId, input.message);
  const { rows: historyRows } = await pool.query<MessageRow>(
    "SELECT * FROM (SELECT * FROM ai_messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 10) t ORDER BY created_at",
    [conversationId],
  );
  await insertMessage(conversationId, "user", input.message);
  const ctx = await buildUserContext(userId, today);
  const safety = checkUserMessage(input.message);
  const provider = getProvider();

  let answer: AiChatOutput;
  let source: AiSource = "rule_engine";
  let model: string | null = null;
  let fallbackReason: string | null = null;

  if (safety?.category === "urgent") {
    // Never route potential emergencies through a model.
    answer = { reply: safety.note, actions: [], safetyNote: safety.note };
  } else {
    const allowed = eligibleExercises(ctx.library, ctx.engineProfile).map((e) => ({ id: e.id, name: e.name }));
    const result = await tryLlm(
      provider,
      (p) =>
        p.generate({
          task: "chat",
          system: CHAT_SYSTEM,
          history: historyRows.map((m) => ({ role: m.role, content: m.content })),
          prompt: JSON.stringify({ context: promptContext(ctx), allowedExercises: allowed, safetyFlag: safety?.category ?? null, message_userProvided: input.message }),
          schema: aiChatOutputSchema,
          effort: "low",
          devMockOutput: () => {
            const offline = offlineAnswer(input.message, ctx);
            return { ...offline, reply: `[Dev mock — not a real AI response]\n${offline.reply}` };
          },
        }),
      (out) => {
        const blocked = checkModelOutput(out.reply);
        return blocked ? [`Reply blocked: ${blocked}`] : [];
      },
    );
    if (result.ok) {
      answer = { ...result.data, actions: sanitizeActions(result.data, ctx) };
      source = provider!.source;
      model = result.model;
    } else {
      answer = offlineAnswer(input.message, ctx);
      fallbackReason = result.reason;
      if (provider && result.errors.length) {
        await record(pool, userId, "chat", provider.source, provider.model, { message: input.message }, result.output, "rejected", result.errors);
      }
    }
  }
  if (safety && !answer.safetyNote) answer = { ...answer, safetyNote: safety.note };

  const message = await insertMessage(conversationId, "assistant", answer.reply, answer.actions, answer.safetyNote, source);
  return { conversationId, message, meta: meta(source, model, fallbackReason, null) };
}

export async function getLatestConversation(userId: string): Promise<ConversationView | null> {
  const { rows } = await pool.query<{ id: string }>(
    "SELECT id FROM ai_conversations WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1",
    [userId],
  );
  if (!rows[0]) return null;
  const { rows: msgs } = await pool.query<MessageRow>(
    "SELECT * FROM (SELECT * FROM ai_messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 50) t ORDER BY created_at",
    [rows[0].id],
  );
  return { id: rows[0].id, messages: msgs.map(toMessage) };
}
