import { Router } from "express";
import { profileInputSchema, profileUpdateSchema } from "@gymfit/shared";
import { currentUserId } from "../../middleware/auth.js";
import { clientToday } from "../../lib/http.js";
import * as profiles from "./service.js";

export const profileRouter = Router();

profileRouter.get("/", async (req, res) => {
  res.json({ profile: await profiles.findProfile(currentUserId(req)) });
});

/** Onboarding: create or fully replace the profile. */
profileRouter.post("/", async (req, res) => {
  const input = profileInputSchema.parse(req.body);
  res.status(201).json({ profile: await profiles.saveProfile(currentUserId(req), input, clientToday(req)) });
});

profileRouter.put("/", async (req, res) => {
  const patch = profileUpdateSchema.parse(req.body);
  res.json({ profile: await profiles.updateProfile(currentUserId(req), patch, clientToday(req)) });
});
