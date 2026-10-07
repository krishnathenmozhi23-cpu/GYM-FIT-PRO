import { z } from "zod";
import {
  equipmentSchema,
  fitnessLevelSchema,
  genderSchema,
  goalSchema,
  limitationSchema,
  preferredTimeSchema,
  workoutLocationSchema,
} from "./enums.js";

const newPassword = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters");

export const registerSchema = z.object({
  email: z.email().max(254).transform((v) => v.trim().toLowerCase()),
  password: newPassword,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.email().transform((v) => v.trim().toLowerCase()),
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: z.email().transform((v) => v.trim().toLowerCase()) });
export const resetPasswordSchema = z.object({ token: z.string().min(20).max(200), password: newPassword });
export const verifyEmailSchema = z.object({ token: z.string().min(20).max(200) });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword });
/** Guests (no password) may omit the password. */
export const deleteAccountSchema = z.object({ password: z.string().max(128).optional() });
/** Add an email + password to a guest account. */
export const claimAccountSchema = registerSchema;

export const profileInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  age: z.number().int().min(16, "GymFit Pro is designed for users aged 16+").max(100),
  gender: genderSchema,
  heightCm: z.number().min(120).max(230),
  weightKg: z.number().min(30).max(300),
  fitnessLevel: fitnessLevelSchema,
  goal: goalSchema,
  targetWeightKg: z.number().min(30).max(300).nullable().optional(),
  location: workoutLocationSchema,
  equipment: z.array(equipmentSchema).min(1).max(6),
  daysPerWeek: z.number().int().min(1).max(6),
  sessionMinutes: z.number().int().min(15).max(120),
  preferredTime: preferredTimeSchema,
  limitations: z.array(limitationSchema).max(10).default([]),
  limitationNotes: z.string().trim().max(500).default(""),
});
export type ProfileInput = z.infer<typeof profileInputSchema>;

export const profileUpdateSchema = profileInputSchema.partial();
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

export interface Profile extends ProfileInput {
  userId: string;
  /** Null for guest accounts. */
  email: string | null;
  onboardingCompleted: boolean;
  updatedAt: string;
}

export interface AuthUser {
  id: string;
  /** Null for guest accounts (started without email/password). */
  email: string | null;
  isGuest: boolean;
  emailVerified: boolean;
  onboardingCompleted: boolean;
}
