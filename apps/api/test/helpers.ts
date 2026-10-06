import request from "supertest";
import type { ProfileInput } from "@gymfit/shared";
import { createApp } from "../src/app.js";

export const app = createApp();

let counter = 0;
export function uniqueEmail() {
  counter += 1;
  return `user${Date.now()}_${counter}@example.com`;
}

export const sampleProfile: ProfileInput = {
  name: "Krishna",
  age: 21,
  gender: "male",
  heightCm: 175,
  weightKg: 70,
  fitnessLevel: "beginner",
  goal: "muscle_gain",
  targetWeightKg: 75,
  location: "gym",
  equipment: ["full_gym"],
  daysPerWeek: 4,
  sessionMinutes: 60,
  preferredTime: "evening",
  limitations: [],
  limitationNotes: "",
};

/** Registers a user and returns a bearer token. */
export async function registerUser(): Promise<string> {
  const res = await request(app)
    .post("/auth/register")
    .send({ email: uniqueEmail(), password: "correct-horse-battery" });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.token as string;
}

export async function onboardedUser(overrides: Partial<ProfileInput> = {}): Promise<string> {
  const token = await registerUser();
  const res = await request(app)
    .post("/profile")
    .set("Authorization", `Bearer ${token}`)
    .send({ ...sampleProfile, ...overrides });
  if (res.status !== 201) throw new Error(`onboarding failed: ${res.status} ${JSON.stringify(res.body)}`);
  return token;
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
