import { Router } from "express";
import { exerciseFilterSchema, type ExerciseDetail } from "@gymfit/shared";
import { currentUserId } from "../../middleware/auth.js";
import { notFound } from "../../lib/errors.js";
import { availableEquipment, hasEquipment } from "../../engine/filters.js";
import { findAlternatives } from "../../engine/alternatives.js";
import { findProfile } from "../profile/service.js";
import { getLibrary } from "./repository.js";

export const exercisesRouter = Router();

exercisesRouter.get("/", async (req, res) => {
  const f = exerciseFilterSchema.parse(req.query);
  const { list } = await getLibrary();
  const profile = f.availableOnly ? await findProfile(currentUserId(req)) : null;
  const available = profile ? availableEquipment(profile) : null;
  const q = f.q?.toLowerCase();
  const exercises = list.filter(
    (e) =>
      (!q || e.name.toLowerCase().includes(q)) &&
      (!f.muscle || e.primaryMuscles.includes(f.muscle) || e.secondaryMuscles.includes(f.muscle)) &&
      (!f.equipment || e.equipment.includes(f.equipment)) &&
      (!f.difficulty || e.difficulty === f.difficulty) &&
      (!f.category || e.category === f.category) &&
      (!available || hasEquipment(e, available)),
  );
  res.json({ exercises });
});

exercisesRouter.get("/:id", async (req, res) => {
  const { list, byId } = await getLibrary();
  const exercise = byId.get(req.params.id);
  if (!exercise) throw notFound("Exercise");
  const profile = await findProfile(currentUserId(req));
  const detail: ExerciseDetail = { ...exercise, alternatives: findAlternatives(exercise, list, profile) };
  res.json({ exercise: detail });
});
