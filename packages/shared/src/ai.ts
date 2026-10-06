import { z } from "zod";
import { generatedPlanSchema } from "./workout.js";

/**
 * Every AI-facing response carries its provenance so the UI can be honest
 * about where a recommendation came from.
 *  - `ai`          : produced by the configured LLM and validated.
 *  - `rule_engine` : produced by the deterministic engine (no LLM involved).
 *  - `dev_mock`    : development mock provider — never shown as real AI.
 */
export const aiSourceSchema = z.enum(["ai", "rule_engine", "dev_mock"]);
export type AiSource = z.infer<typeof aiSourceSchema>;

export interface AiMeta {
  source: AiSource;
  model: string | null;
  /** Present when an LLM response was rejected and the engine was used instead. */
  fallbackReason: string | null;
  recommendationId: string | null;
}

/* ---------- Requests ---------- */

export const workoutPlanRequestSchema = z.object({
  /** Optional free-text preference, e.g. "more leg focus". */
  preference: z.string().trim().max(300).optional(),
});

export const dailyWorkoutRequestSchema = z.object({
  minutes: z.number().int().min(10).max(120).optional(),
  focus: z.enum(["upper", "lower", "full_body", "push", "pull", "legs", "core", "conditioning"]).optional(),
});
export type DailyWorkoutRequest = z.infer<typeof dailyWorkoutRequestSchema>;

export const recommendExerciseRequestSchema = z.object({
  exerciseId: z.string().min(1),
  reason: z.string().trim().max(200).optional(),
});

export const chatRequestSchema = z.object({
  conversationId: z.uuid().optional(),
  message: z.string().trim().min(1).max(2000),
});

/* ---------- Structured LLM outputs ---------- */

/** What the LLM must return when asked for a weekly plan. */
export const aiPlanOutputSchema = generatedPlanSchema;
export type AiPlanOutput = z.infer<typeof aiPlanOutputSchema>;

export const aiAlternativesOutputSchema = z.object({
  alternatives: z
    .array(
      z.object({
        exerciseId: z.string(),
        reason: z.string().max(240),
      }),
    )
    .min(1)
    .max(5),
});
export type AiAlternativesOutput = z.infer<typeof aiAlternativesOutputSchema>;

export const insightSchema = z.object({
  kind: z.enum(["progress", "consistency", "recovery", "goal", "tip", "safety"]),
  title: z.string().max(80),
  message: z.string().max(400),
  /** Evidence the insight is based on (computed by the app, not invented). */
  evidence: z.string().max(240),
});
export type Insight = z.infer<typeof insightSchema>;

export const aiInsightOutputSchema = z.object({
  insights: z.array(insightSchema).min(1).max(4),
});

export const chatActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start_today") }),
  z.object({
    type: z.literal("quick_workout"),
    minutes: z.number().int().min(10).max(120),
    focus: dailyWorkoutRequestSchema.shape.focus,
  }),
  z.object({ type: z.literal("view_exercise"), exerciseId: z.string() }),
  z.object({ type: z.literal("regenerate_plan") }),
  z.object({ type: z.literal("log_weight") }),
]);
export type ChatAction = z.infer<typeof chatActionSchema>;

export const aiChatOutputSchema = z.object({
  reply: z.string().min(1).max(4000),
  actions: z.array(chatActionSchema).max(3),
  /** True when the message touches on pain, injury or medical topics. */
  safetyNote: z.string().max(400).nullable(),
});
export type AiChatOutput = z.infer<typeof aiChatOutputSchema>;

/* ---------- Responses ---------- */

export interface ChatMessageView {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions: ChatAction[];
  safetyNote: string | null;
  source: AiSource | null;
  createdAt: string;
}

export interface ChatResponse {
  conversationId: string;
  message: ChatMessageView;
  meta: AiMeta;
}

export interface InsightsResponse {
  insights: Insight[];
  meta: AiMeta;
}

export interface AiStatus {
  provider: "anthropic" | "mock" | "none";
  model: string | null;
  llmEnabled: boolean;
}
