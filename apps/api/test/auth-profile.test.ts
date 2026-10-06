import { describe, expect, it } from "vitest";
import request from "supertest";
import { app, auth, registerUser, sampleProfile, uniqueEmail } from "./helpers.js";

describe("auth", () => {
  it("registers, logs in and returns the current user", async () => {
    const email = uniqueEmail();
    const reg = await request(app).post("/auth/register").send({ email, password: "password123" });
    expect(reg.status).toBe(201);
    expect(reg.body.user).toMatchObject({ email, onboardingCompleted: false });
    expect(reg.headers["set-cookie"]?.[0]).toMatch(/HttpOnly/);

    const login = await request(app).post("/auth/login").send({ email: email.toUpperCase(), password: "password123" });
    expect(login.status).toBe(200);

    const me = await request(app).get("/auth/me").set(auth(login.body.token));
    expect(me.body.user.email).toBe(email);
  });

  it("rejects duplicate emails, bad passwords and short passwords", async () => {
    const email = uniqueEmail();
    await request(app).post("/auth/register").send({ email, password: "password123" });
    expect((await request(app).post("/auth/register").send({ email, password: "password123" })).status).toBe(409);
    const bad = await request(app).post("/auth/login").send({ email, password: "wrong-password" });
    expect(bad.status).toBe(401);
    expect(bad.body.error.message).toBe("Invalid email or password");
    const short = await request(app).post("/auth/register").send({ email: uniqueEmail(), password: "short" });
    expect(short.status).toBe(400);
    expect(short.body.error.code).toBe("validation_error");
  });

  it("protects routes and accepts the session cookie", async () => {
    expect((await request(app).get("/profile")).status).toBe(401);
    expect((await request(app).get("/profile").set(auth("not-a-jwt"))).status).toBe(401);
    const agent = request.agent(app);
    await agent.post("/auth/register").send({ email: uniqueEmail(), password: "password123" });
    expect((await agent.get("/profile")).status).toBe(200);
  });
});

describe("profile / onboarding", () => {
  it("returns null before onboarding and a full profile after", async () => {
    const token = await registerUser();
    expect((await request(app).get("/profile").set(auth(token))).body.profile).toBeNull();

    const created = await request(app).post("/profile").set(auth(token)).send(sampleProfile);
    expect(created.status).toBe(201);
    expect(created.body.profile).toMatchObject({
      name: "Krishna",
      goal: "muscle_gain",
      weightKg: 70,
      onboardingCompleted: true,
      equipment: ["full_gym"],
    });
    const me = await request(app).get("/auth/me").set(auth(token));
    expect(me.body.user.onboardingCompleted).toBe(true);
  });

  it("normalises equipment and validates ranges", async () => {
    const token = await registerUser();
    const res = await request(app)
      .post("/profile")
      .set(auth(token))
      .send({ ...sampleProfile, equipment: ["none", "dumbbells"] });
    expect(res.body.profile.equipment).toEqual(["dumbbells"]);

    const tooYoung = await request(app).post("/profile").set(auth(token)).send({ ...sampleProfile, age: 12 });
    expect(tooYoung.status).toBe(400);
  });

  it("updates partially and keeps weight history in progress records", async () => {
    const token = await registerUser();
    await request(app).post("/profile").set(auth(token)).send(sampleProfile);
    const upd = await request(app)
      .put("/profile")
      .set(auth(token))
      .set("X-Client-Date", new Date().toISOString().slice(0, 10))
      .send({ weightKg: 71.5, goal: "strength" });
    expect(upd.status).toBe(200);
    expect(upd.body.profile).toMatchObject({ weightKg: 71.5, goal: "strength", name: "Krishna" });
  });
});
