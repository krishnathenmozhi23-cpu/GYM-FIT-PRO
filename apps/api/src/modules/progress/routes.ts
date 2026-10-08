import { Router } from "express";
import { progressEntrySchema } from "@gymfit/shared";
import { currentUserId } from "../../middleware/auth.js";
import { clientToday } from "../../lib/http.js";
import { badRequest } from "../../lib/errors.js";
import * as progress from "./service.js";

export const progressRouter = Router();

progressRouter.get("/", async (req, res) => {
  res.json({ progress: await progress.getOverview(currentUserId(req), clientToday(req)) });
});

progressRouter.post("/", async (req, res) => {
  const entry = progressEntrySchema.parse(req.body);
  const today = clientToday(req);
  if (entry.data.recordedOn > today) throw badRequest("Entries can't be in the future");
  const userId = currentUserId(req);
  if (entry.type === "weight") await progress.addWeight(userId, entry.data);
  else await progress.addMeasurement(userId, entry.data);
  res.status(201).json({ progress: await progress.getOverview(userId, today) });
});
