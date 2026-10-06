import type { PlanView, Profile, TodayResponse } from "@gymfit/shared";
import { pool, withTransaction } from "../../db/pool.js";
import { badRequest } from "../../lib/errors.js";
import { dayOfWeek, startOfWeek } from "../../lib/dates.js";
import { generatePlan } from "../../engine/planGenerator.js";
import { buildWeekSchedule, nextInRotation } from "../../engine/schedule.js";
import type { EngineProfile } from "../../engine/types.js";
import { getLibrary } from "../exercises/repository.js";
import { getProfile } from "../profile/service.js";
import * as repo from "./repository.js";

export function toEngineProfile(p: Profile): EngineProfile {
  return {
    fitnessLevel: p.fitnessLevel,
    goal: p.goal,
    location: p.location,
    equipment: p.equipment,
    daysPerWeek: p.daysPerWeek,
    sessionMinutes: p.sessionMinutes,
    limitations: p.limitations,
  };
}

/** Regenerates the active plan with the deterministic engine (no LLM). */
export async function generateEnginePlan(userId: string): Promise<{ plan: PlanView; warnings: string[] }> {
  const profile = await getProfile(userId);
  if (!profile.onboardingCompleted) throw badRequest("Complete onboarding first");
  const { list, byId } = await getLibrary();
  const history = await repo.getLoadHistory(userId);
  const { plan, warnings } = generatePlan(list, toEngineProfile(profile), history);
  await withTransaction((db) => repo.savePlan(db, userId, plan, "rule_engine", null));
  return { plan: (await repo.getActivePlan(userId, byId))!, warnings };
}

export async function getActivePlan(userId: string): Promise<PlanView | null> {
  const { byId } = await getLibrary();
  return repo.getActivePlan(userId, byId);
}

export async function getToday(userId: string, today: string): Promise<TodayResponse> {
  const { byId } = await getLibrary();
  const plan = await repo.getActivePlan(userId, byId);
  const { rows: active } = await pool.query<{ id: string }>(
    "SELECT id FROM workout_sessions WHERE user_id = $1 AND status = 'in_progress'",
    [userId],
  );
  const activeSessionId = active[0]?.id ?? null;
  if (!plan) {
    return { plan: null, workout: null, isRestDay: false, activeSessionId, completedToday: false, schedule: null };
  }
  const weekStart = startOfWeek(today);
  const sessions = await repo.getCompletedSessionsSince(userId, weekStart);
  const schedule = buildWeekSchedule(plan.workouts, sessions, today, weekStart);
  const todayEntry = schedule.days[dayOfWeek(today)]!;
  const completedToday = todayEntry.status === "completed";

  let workout = todayEntry.status === "planned" || todayEntry.status === "missed_rescheduled"
    ? plan.workouts.find((w) => w.id === todayEntry.workoutId) ?? null
    : null;
  const isRestDay = !workout;
  if (!workout) {
    // Offer the next workout in rotation so users can train on a rest day if they choose.
    const { rows } = await pool.query<{ workout_id: string | null }>(
      `SELECT workout_id FROM workout_sessions WHERE user_id = $1 AND status = 'completed' AND workout_id IS NOT NULL
       ORDER BY completed_at DESC LIMIT 1`,
      [userId],
    );
    const next = nextInRotation(plan.workouts, rows[0]?.workout_id ?? null);
    workout = next ? plan.workouts.find((w) => w.id === next.id) ?? null : null;
  }
  return { plan: { id: plan.id, name: plan.name }, workout, isRestDay, activeSessionId, completedToday, schedule };
}
