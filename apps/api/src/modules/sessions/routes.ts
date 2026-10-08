import { Router } from "express";
import {
  completeSessionSchema,
  formCheckResultSchema,
  logSetSchema,
  pauseSessionSchema,
  startAdHocSessionSchema,
  updateSessionExerciseSchema,
} from "@gymfit/shared";
import { currentUserId } from "../../middleware/auth.js";
import { clientToday, uuidParam } from "../../lib/http.js";
import { completeAndAdapt } from "./completion.js";
import * as sessions from "./service.js";

export const sessionsRouter = Router();

sessionsRouter.get("/", async (req, res) => {
  res.json({ sessions: await sessions.listHistory(currentUserId(req)) });
});

sessionsRouter.post("/", async (req, res) => {
  const input = startAdHocSessionSchema.parse(req.body);
  const session = await sessions.startAdHoc(currentUserId(req), input.title, input.exercises, clientToday(req), input.workoutId ?? null);
  res.status(201).json({ session });
});

sessionsRouter.get("/active", async (req, res) => {
  res.json({ session: await sessions.getActiveSession(currentUserId(req)) });
});

sessionsRouter.get("/:id", async (req, res) => {
  res.json({ session: await sessions.getSession(currentUserId(req), uuidParam(req, "id", "Workout session")) });
});

sessionsRouter.post("/:id/set", async (req, res) => {
  const set = await sessions.logSet(currentUserId(req), uuidParam(req, "id", "Workout session"), logSetSchema.parse(req.body));
  res.status(201).json({ set });
});

sessionsRouter.delete("/:id/set/:setId", async (req, res) => {
  await sessions.deleteSet(currentUserId(req), uuidParam(req, "id", "Workout session"), uuidParam(req, "setId", "Set"));
  res.status(204).end();
});

sessionsRouter.patch("/:id/exercise/:exerciseId", async (req, res) => {
  const session = await sessions.updateSessionExercise(
    currentUserId(req),
    uuidParam(req, "id", "Workout session"),
    uuidParam(req, "exerciseId", "Session exercise"),
    updateSessionExerciseSchema.parse(req.body),
  );
  res.json({ session });
});

/** Metrics from an on-device camera form check. */
sessionsRouter.post("/:id/form-check", async (req, res) => {
  const check = await sessions.saveFormCheck(currentUserId(req), uuidParam(req, "id", "Workout session"), formCheckResultSchema.parse(req.body));
  res.status(201).json({ formCheck: check });
});

sessionsRouter.post("/:id/pause", async (req, res) => {
  const { paused } = pauseSessionSchema.parse(req.body);
  res.json({ session: await sessions.setPaused(currentUserId(req), uuidParam(req, "id", "Workout session"), paused) });
});

sessionsRouter.post("/:id/complete", async (req, res) => {
  const input = completeSessionSchema.parse(req.body);
  res.json(await completeAndAdapt(currentUserId(req), uuidParam(req, "id", "Workout session"), input));
});

sessionsRouter.post("/:id/abandon", async (req, res) => {
  await sessions.abandonSession(currentUserId(req), uuidParam(req, "id", "Workout session"));
  res.status(204).end();
});
