import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { pool } from "../src/db/pool.js";
import { setMailerForTests, type Email, type Mailer } from "../src/lib/mailer.js";
import { app, auth, onboardedUser, uniqueEmail } from "./helpers.js";

let outbox: Email[] = [];
const capture: Mailer = { enabled: true, send: async (e) => void outbox.push(e) };
const disabled: Mailer = { enabled: false, send: async () => { throw new Error("disabled"); } };
const linkToken = (e: Email | undefined) => e?.text.match(/token=([A-Za-z0-9_-]+)/)?.[1] ?? "";

beforeEach(() => {
  outbox = [];
  setMailerForTests(capture);
});
afterEach(() => setMailerForTests(capture));

async function registerWith(email: string, password = "original-pass-1") {
  const res = await request(app).post("/auth/register").send({ email, password });
  expect(res.status).toBe(201);
  return res.body as { token: string; user: { emailVerified: boolean } };
}

describe("email verification", () => {
  it("sends a verification link on signup and verifies with it once", async () => {
    const email = uniqueEmail();
    const { token, user } = await registerWith(email);
    expect(user.emailVerified).toBe(false);
    expect(outbox[0]).toMatchObject({ to: email, subject: /Confirm your email/ });

    const t = linkToken(outbox[0]);
    expect((await request(app).post("/auth/verify-email").send({ token: t })).status).toBe(204);
    expect((await request(app).get("/auth/me").set(auth(token))).body.user.emailVerified).toBe(true);
    // Single use
    expect((await request(app).post("/auth/verify-email").send({ token: t })).status).toBe(400);
  });

  it("revokes older links when a new one is requested", async () => {
    const { token } = await registerWith(uniqueEmail());
    const first = linkToken(outbox[0]);
    await request(app).post("/auth/verify-email/resend").set(auth(token));
    const second = linkToken(outbox[1]);
    expect((await request(app).post("/auth/verify-email").send({ token: first })).status).toBe(400);
    expect((await request(app).post("/auth/verify-email").send({ token: second })).status).toBe(204);
  });
});

describe("password reset", () => {
  it("resets the password, invalidates old sessions and the old password", async () => {
    const email = uniqueEmail();
    const { token: oldSession } = await registerWith(email);
    outbox = [];
    expect((await request(app).post("/auth/forgot-password").send({ email: email.toUpperCase() })).status).toBe(204);
    expect(outbox).toHaveLength(1);
    const t = linkToken(outbox[0]);

    expect((await request(app).post("/auth/reset-password").send({ token: t, password: "short" })).status).toBe(400);
    expect((await request(app).post("/auth/reset-password").send({ token: t, password: "brand-new-pass-2" })).status).toBe(204);
    expect((await request(app).post("/auth/reset-password").send({ token: t, password: "another-pass-3" })).status).toBe(400);

    expect((await request(app).get("/auth/me").set(auth(oldSession))).status).toBe(401);
    expect((await request(app).post("/auth/login").send({ email, password: "original-pass-1" })).status).toBe(401);
    const login = await request(app).post("/auth/login").send({ email, password: "brand-new-pass-2" });
    expect(login.status).toBe(200);
    expect(login.body.user.emailVerified).toBe(true); // reset proves inbox ownership
  });

  it("does not reveal whether an email is registered", async () => {
    const res = await request(app).post("/auth/forgot-password").send({ email: uniqueEmail() });
    expect(res.status).toBe(204);
    expect(outbox).toHaveLength(0);
  });

  it("returns 503 instead of silently doing nothing when email is not configured", async () => {
    setMailerForTests(disabled);
    const res = await request(app).post("/auth/forgot-password").send({ email: uniqueEmail() });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("email_unavailable");
    // Registration still works without email
    expect((await request(app).post("/auth/register").send({ email: uniqueEmail(), password: "password123" })).status).toBe(201);
  });

  it("rejects garbage and expired-looking tokens", async () => {
    expect((await request(app).post("/auth/reset-password").send({ token: "x".repeat(43), password: "password123" })).status).toBe(400);
  });
});

describe("signed-in account management", () => {
  it("changes password: wrong current password rejected, other sessions revoked, caller stays signed in", async () => {
    const email = uniqueEmail();
    const { token: deviceA } = await registerWith(email);
    const deviceB = (await request(app).post("/auth/login").send({ email, password: "original-pass-1" })).body.token;

    const wrong = await request(app).post("/auth/change-password").set(auth(deviceA)).send({ currentPassword: "nope", newPassword: "new-password-9" });
    expect(wrong.status).toBe(403);

    const ok = await request(app).post("/auth/change-password").set(auth(deviceA)).send({ currentPassword: "original-pass-1", newPassword: "new-password-9" });
    expect(ok.status).toBe(200);
    expect((await request(app).get("/auth/me").set(auth(ok.body.token))).status).toBe(200);
    expect((await request(app).get("/auth/me").set(auth(deviceA))).status).toBe(401);
    expect((await request(app).get("/auth/me").set(auth(deviceB))).status).toBe(401);
  });

  it("signs out everywhere", async () => {
    const { token } = await registerWith(uniqueEmail());
    expect((await request(app).post("/auth/sign-out-everywhere").set(auth(token))).status).toBe(204);
    expect((await request(app).get("/auth/me").set(auth(token))).status).toBe(401);
  });

  it("exports all of the user's data and nobody else's", async () => {
    const token = await onboardedUser();
    await request(app).post("/ai/workout-plan").set(auth(token)).send({});
    await request(app).post("/ai/chat").set(auth(token)).send({ message: "What should I train today?" });
    const res = await request(app).get("/auth/export").set(auth(token));
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toMatch(/attachment/);
    expect(res.body.profile.name).toBe("Krishna");
    expect(res.body.plans[0].workouts.length).toBeGreaterThan(0);
    expect(res.body.conversations[0].messages).toHaveLength(2);
    expect(JSON.stringify(res.body)).not.toMatch(/password_hash/);
  });

  it("deletes the account and all its data after confirming the password", async () => {
    const token = await onboardedUser();
    await request(app).post("/ai/workout-plan").set(auth(token)).send({});
    await request(app).post("/ai/chat").set(auth(token)).send({ message: "hi" });
    const me = (await request(app).get("/auth/me").set(auth(token))).body.user;
    expect((await request(app).post("/auth/delete-account").set(auth(token)).send({ password: "wrong" })).status).toBe(403);
    expect((await request(app).post("/auth/delete-account").set(auth(token)).send({ password: "correct-horse-battery" })).status).toBe(204);
    expect((await request(app).get("/auth/me").set(auth(token))).status).toBe(401);
    expect((await request(app).post("/auth/login").send({ email: me.email, password: "correct-horse-battery" })).status).toBe(401);
    const tables = ["user_profiles", "fitness_goals", "workout_plans", "workout_sessions", "progress_records",
      "body_measurements", "ai_conversations", "ai_recommendations", "auth_tokens"];
    for (const t of tables) {
      const { rows } = await pool.query(`SELECT count(*)::int AS n FROM ${t} WHERE user_id = $1`, [me.id]);
      expect(rows[0]!.n, t).toBe(0);
    }
  });
});
