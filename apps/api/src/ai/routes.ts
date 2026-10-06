import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import {
  chatRequestSchema,
  dailyWorkoutRequestSchema,
  recommendExerciseRequestSchema,
  workoutPlanRequestSchema,
  type AiStatus,
} from "@gymfit/shared";
import { env } from "../config/env.js";
import { currentUserId } from "../middleware/auth.js";
import { clientToday } from "../lib/http.js";
import { getProvider } from "./providers/index.js";
import * as ai from "./service.js";

export const aiRouter = Router();

// LLM calls cost money and time: limit per user.
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: env.NODE_ENV === "test" ? 1000 : 20,
  keyGenerator: (req) => req.userId ?? "anon",
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: { code: "rate_limited", message: "Too many AI requests — please wait a moment" } },
});
aiRouter.use(aiLimiter);

aiRouter.get("/status", (_req, res) => {
  const p = getProvider();
  const status: AiStatus = { provider: p?.name ?? "none", model: p?.model ?? null, llmEnabled: p?.source === "ai" };
  res.json(status);
});

aiRouter.post("/workout-plan", async (req, res) => {
  const { preference } = workoutPlanRequestSchema.parse(req.body);
  res.status(201).json(await ai.generateWorkoutPlan(currentUserId(req), clientToday(req), preference));
});

aiRouter.post("/daily-workout", async (req, res) => {
  res.json(await ai.generateDailyWorkout(currentUserId(req), clientToday(req), dailyWorkoutRequestSchema.parse(req.body)));
});

aiRouter.post("/recommend-exercise", async (req, res) => {
  const { exerciseId, reason } = recommendExerciseRequestSchema.parse(req.body);
  res.json(await ai.recommendExercise(currentUserId(req), clientToday(req), exerciseId, reason));
});

aiRouter.post("/fitness-insight", async (req, res) => {
  res.json(await ai.generateFitnessInsight(currentUserId(req), clientToday(req)));
});

aiRouter.post("/chat", async (req, res) => {
  res.json(await ai.answerFitnessQuestion(currentUserId(req), clientToday(req), chatRequestSchema.parse(req.body)));
});

aiRouter.get("/conversations/latest", async (req, res) => {
  res.json({ conversation: await ai.getLatestConversation(currentUserId(req)) });
});
