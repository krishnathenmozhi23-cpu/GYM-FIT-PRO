import { describe, expect, it } from "vitest";
import request from "supertest";
import { pool } from "../src/db/pool.js";
import { deleteAbandonedGuests } from "../src/modules/auth/service.js";
import { app, auth, sampleProfile, uniqueEmail } from "./helpers.js";

async function guest() {
  const res = await request(app).post("/auth/guest");
  expect(res.status).toBe(201);
  return res.body as { token: string; user: { id: string; isGuest: boolean; email: string | null } };
}

describe("guest accounts (start without email/password)", () => {
  it("can onboard, get a plan and train without any credentials", async () => {
    const { token, user } = await guest();
    expect(user).toMatchObject({ isGuest: true, email: null });
    expect((await request(app).post("/profile").set(auth(token)).send(sampleProfile)).status).toBe(201);
    const plan = await request(app).post("/ai/workout-plan").set(auth(token)).send({});
    expect(plan.status).toBe(201);
    expect((await request(app).post("/workouts/start").set(auth(token)).send({})).status).toBe(201);
  });

  it("uses a long-lived cookie and refreshes it on every app load", async () => {
    const res = await request(app).post("/auth/guest");
    const cookie = res.headers["set-cookie"]![0]!;
    const maxAge = Number(cookie.match(/Max-Age=(\d+)/)![1]);
    expect(maxAge).toBeGreaterThan(300 * 24 * 3600);
    const agent = request.agent(app);
    await agent.post("/auth/guest");
    const me = await agent.get("/auth/me");
    expect(me.body.user.isGuest).toBe(true);
    expect(me.headers["set-cookie"]?.[0]).toMatch(/gymfit_session=/);
  });

  it("claims the account with email + password and keeps all data", async () => {
    const { token } = await guest();
    await request(app).post("/profile").set(auth(token)).send(sampleProfile);
    const email = uniqueEmail();
    const claim = await request(app).post("/auth/claim").set(auth(token)).send({ email, password: "password123" });
    expect(claim.status).toBe(200);
    expect(claim.body.user).toMatchObject({ isGuest: false, email });

    const login = await request(app).post("/auth/login").send({ email, password: "password123" });
    const profile = await request(app).get("/profile").set(auth(login.body.token));
    expect(profile.body.profile).toMatchObject({ name: "Krishna", email });

    // Can't claim twice, and an email already in use is rejected
    expect((await request(app).post("/auth/claim").set(auth(login.body.token)).send({ email: uniqueEmail(), password: "password123" })).status).toBe(409);
    const other = await guest();
    expect((await request(app).post("/auth/claim").set(auth(other.token)).send({ email, password: "password123" })).status).toBe(409);
  });

  it("guests can delete without a password but can't change one they don't have", async () => {
    const { token } = await guest();
    const change = await request(app).post("/auth/change-password").set(auth(token)).send({ currentPassword: "x", newPassword: "password123" });
    expect(change.status).toBe(400);
    expect((await request(app).post("/auth/delete-account").set(auth(token)).send({})).status).toBe(204);
    expect((await request(app).get("/auth/me").set(auth(token))).status).toBe(401);
  });

  it("registered accounts still need their password to delete", async () => {
    const reg = await request(app).post("/auth/register").send({ email: uniqueEmail(), password: "password123" });
    expect((await request(app).post("/auth/delete-account").set(auth(reg.body.token)).send({})).status).toBe(403);
  });

  it("cleans up only abandoned guests that never finished onboarding", async () => {
    const abandoned = await guest();
    const active = await guest();
    const onboarded = await guest();
    await request(app).post("/profile").set(auth(onboarded.token)).send(sampleProfile);
    await pool.query("UPDATE users SET last_seen_at = now() - interval '30 days' WHERE id = ANY($1)", [[abandoned.user.id, onboarded.user.id]]);
    await deleteAbandonedGuests(7);
    const { rows } = await pool.query<{ id: string }>("SELECT id FROM users WHERE id = ANY($1)", [[abandoned.user.id, active.user.id, onboarded.user.id]]);
    const left = rows.map((r) => r.id);
    expect(left).not.toContain(abandoned.user.id);
    expect(left).toContain(active.user.id);
    expect(left).toContain(onboarded.user.id);
  });
});
