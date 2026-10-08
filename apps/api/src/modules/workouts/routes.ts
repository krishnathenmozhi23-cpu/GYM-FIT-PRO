import { Router } from "express";
import { startSessionSchema } from "@gymfit/shared";
import { currentUserId } from "../../middleware/auth.js";
import { notFound } from "../../lib/errors.js";
import { clientToday, uuidParam } from "../../lib/http.js";
import { getLibrary } from "../exercises/repository.js";
import * as sessions from "../sessions/service.js";
import * as repo from "./repository.js";
import * as workouts from "./service.js";

export const workoutsRouter = Router();

workoutsRouter.get("/plan", async (req, res) => {
  res.json({ plan: await workouts.getActivePlan(currentUserId(req)) });
});

/** Regenerate the plan with the deterministic engine. See /ai/workout-plan for the AI path. */
workoutsRouter.post("/plan", async (req, res) => {
  const result = await workouts.generateEnginePlan(currentUserId(req));
  res.status(201).json({ ...result, meta: { source: "rule_engine", model: null, fallbackReason: null, recommendationId: null } });
});

workoutsRouter.get("/today", async (req, res) => {
  res.json(await workouts.getToday(currentUserId(req), clientToday(req)));
});

workoutsRouter.post("/start", async (req, res) => {
  const { workoutId } = startSessionSchema.parse(req.body);
  const userId = currentUserId(req);
  const today = clientToday(req);
  const id = workoutId ?? (await workouts.getToday(userId, today)).workout?.id;
  if (!id) throw notFound("Workout");
  res.status(201).json({ session: await sessions.startFromWorkout(userId, id, today) });
});

workoutsRouter.get("/:id", async (req, res) => {
  const { byId } = await getLibrary();
  const workout = await repo.getWorkoutForUser(currentUserId(req), uuidParam(req, "id", "Workout"), byId);
  if (!workout) throw notFound("Workout");
  res.json({ workout });
});
