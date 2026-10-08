import {
  profileInputSchema,
  type Profile,
  type ProfileInput,
  type ProfileUpdate,
} from "@gymfit/shared";
import { pool, withTransaction, type Queryable } from "../../db/pool.js";
import { notFound } from "../../lib/errors.js";

interface ProfileRow {
  user_id: string;
  email: string | null;
  name: string;
  age: number;
  gender: Profile["gender"];
  height_cm: number;
  fitness_level: Profile["fitnessLevel"];
  location: Profile["location"];
  equipment: Profile["equipment"];
  days_per_week: number;
  session_minutes: number;
  preferred_time: Profile["preferredTime"];
  limitations: Profile["limitations"];
  limitation_notes: string;
  onboarding_completed: boolean;
  updated_at: Date;
  goal_type: Profile["goal"] | null;
  target_weight_kg: number | null;
  weight_kg: number | null;
}

const PROFILE_QUERY = `
  SELECT p.*, u.email, g.goal_type, g.target_weight_kg,
    (SELECT weight_kg FROM progress_records r WHERE r.user_id = p.user_id
      ORDER BY recorded_on DESC LIMIT 1) AS weight_kg
  FROM user_profiles p
  JOIN users u ON u.id = p.user_id
  LEFT JOIN fitness_goals g ON g.user_id = p.user_id AND g.is_active
  WHERE p.user_id = $1`;

function toProfile(r: ProfileRow): Profile {
  return {
    userId: r.user_id,
    email: r.email,
    name: r.name,
    age: r.age,
    gender: r.gender,
    heightCm: r.height_cm,
    weightKg: r.weight_kg ?? 0,
    fitnessLevel: r.fitness_level,
    goal: r.goal_type ?? "general_fitness",
    targetWeightKg: r.target_weight_kg,
    location: r.location,
    equipment: r.equipment,
    daysPerWeek: r.days_per_week,
    sessionMinutes: r.session_minutes,
    preferredTime: r.preferred_time,
    limitations: r.limitations,
    limitationNotes: r.limitation_notes,
    onboardingCompleted: r.onboarding_completed,
    updatedAt: r.updated_at.toISOString(),
  };
}

export async function findProfile(userId: string, db: Queryable = pool): Promise<Profile | null> {
  const { rows } = await db.query<ProfileRow>(PROFILE_QUERY, [userId]);
  return rows[0] ? toProfile(rows[0]) : null;
}

export async function getProfile(userId: string, db: Queryable = pool): Promise<Profile> {
  const profile = await findProfile(userId, db);
  if (!profile) throw notFound("Profile");
  return profile;
}

/** Creates or fully replaces the profile (used by onboarding). */
export async function saveProfile(userId: string, input: ProfileInput, today: string): Promise<Profile> {
  return withTransaction(async (db) => {
    await db.query(
      `INSERT INTO user_profiles (user_id, name, age, gender, height_cm, fitness_level, location, equipment,
         days_per_week, session_minutes, preferred_time, limitations, limitation_notes, onboarding_completed)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true)
       ON CONFLICT (user_id) DO UPDATE SET
         name = EXCLUDED.name, age = EXCLUDED.age, gender = EXCLUDED.gender, height_cm = EXCLUDED.height_cm,
         fitness_level = EXCLUDED.fitness_level, location = EXCLUDED.location, equipment = EXCLUDED.equipment,
         days_per_week = EXCLUDED.days_per_week, session_minutes = EXCLUDED.session_minutes,
         preferred_time = EXCLUDED.preferred_time, limitations = EXCLUDED.limitations,
         limitation_notes = EXCLUDED.limitation_notes, onboarding_completed = true, updated_at = now()`,
      [
        userId, input.name, input.age, input.gender, input.heightCm, input.fitnessLevel, input.location,
        normalizeEquipment(input.equipment), input.daysPerWeek, input.sessionMinutes, input.preferredTime,
        [...new Set(input.limitations)], input.limitationNotes,
      ],
    );
    await setActiveGoal(db, userId, input.goal, input.targetWeightKg ?? null);
    await recordWeightIfChanged(db, userId, input.weightKg, today);
    return getProfile(userId, db);
  });
}

export async function updateProfile(userId: string, patch: ProfileUpdate, today: string): Promise<Profile> {
  const current = await getProfile(userId);
  const merged = profileInputSchema.parse({ ...current, ...patch });
  return saveProfile(userId, merged, today);
}

/** "No equipment" is meaningless alongside real equipment; "full gym" subsumes everything. */
export function normalizeEquipment(items: ProfileInput["equipment"]): ProfileInput["equipment"] {
  const set = new Set(items);
  if (set.has("full_gym")) return ["full_gym"];
  if (set.size > 1) set.delete("none");
  return [...set];
}

async function setActiveGoal(db: Queryable, userId: string, goal: string, target: number | null) {
  const { rows } = await db.query<{ id: string; goal_type: string; target_weight_kg: number | null }>(
    "SELECT id, goal_type, target_weight_kg FROM fitness_goals WHERE user_id = $1 AND is_active",
    [userId],
  );
  const active = rows[0];
  if (active && active.goal_type === goal && active.target_weight_kg === target) return;
  if (active) {
    await db.query("UPDATE fitness_goals SET is_active = false, ended_at = now() WHERE id = $1", [active.id]);
  }
  await db.query("INSERT INTO fitness_goals (user_id, goal_type, target_weight_kg) VALUES ($1, $2, $3)", [
    userId, goal, target,
  ]);
}

async function recordWeightIfChanged(db: Queryable, userId: string, weightKg: number, today: string) {
  const { rows } = await db.query<{ weight_kg: number }>(
    "SELECT weight_kg FROM progress_records WHERE user_id = $1 ORDER BY recorded_on DESC LIMIT 1",
    [userId],
  );
  if (rows[0]?.weight_kg === weightKg) return;
  await db.query(
    `INSERT INTO progress_records (user_id, recorded_on, weight_kg) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, recorded_on) DO UPDATE SET weight_kg = EXCLUDED.weight_kg`,
    [userId, today, weightKg],
  );
}
