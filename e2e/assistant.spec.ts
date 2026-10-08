import { expect, test } from "@playwright/test";
import { registerAndOnboard } from "./helpers";

test("assistant answers from user data and launches a quick workout", async ({ page }) => {
  await registerAndOnboard(page);
  await expect(page.getByRole("heading", { name: "AI Insight" })).toBeVisible();
  await expect(page.getByText(/Based on: No workouts logged yet/)).toBeVisible();

  await page.getByRole("button", { name: "Open AI assistant" }).click();
  const coach = page.getByRole("dialog", { name: "AI Coach" });
  await expect(coach.getByText(/Offline coach/)).toBeVisible();
  await coach.getByRole("button", { name: "What should I train today?" }).click();
  await expect(coach.locator(".bubble-assistant").last()).toContainText(/Upper Body|Lower Body|rest day/);
  await expect(coach.getByText("Built-in engine").first()).toBeVisible();

  await coach.getByLabel("Message").fill("I only have 20 minutes, can I do a quick core session?");
  await coach.getByRole("button", { name: "Send" }).click();
  await coach.getByRole("button", { name: /Build 20-min core workout/ }).click();
  const quick = page.getByRole("dialog", { name: /20-min Core Focus/ });
  await expect(quick).toBeVisible();
  await page.screenshot({ path: "test-results/phase4-quick.png" });
  await quick.getByRole("button", { name: "Start this workout" }).click();
  await expect(page.getByLabel("Workout time")).toBeVisible();
});

test("safety: urgent symptoms get a stop-and-seek-help reply", async ({ page }) => {
  await registerAndOnboard(page);
  await page.getByRole("button", { name: "Open AI assistant" }).click();
  const coach = page.getByRole("dialog", { name: "AI Coach" });
  await coach.getByLabel("Message").fill("I felt chest pain during my last set");
  await coach.getByRole("button", { name: "Send" }).click();
  await expect(coach.locator(".bubble-assistant").last()).toContainText(/emergency services or a doctor/);
  await page.screenshot({ path: "test-results/phase4-safety.png" });
});

test("profile edits regenerate the plan and workouts can be condensed", async ({ page }) => {
  await registerAndOnboard(page);
  await page.getByRole("link", { name: "Profile" }).click();
  await page.getByRole("button", { name: /Schedule/ }).click();
  const sheet = page.getByRole("dialog", { name: "Schedule" });
  await sheet.getByRole("button", { name: "Decrease days per week" }).click();
  await sheet.getByRole("button", { name: /Save & update plan/ }).click();
  await expect(page.getByText(/plan was regenerated/)).toBeVisible();
  await expect(page.getByText(/3 days · 60 min/)).toBeVisible();

  await page.getByRole("link", { name: "Workouts" }).click();
  await page.locator("a.card-link").first().click();
  await page.getByRole("button", { name: "30 min" }).click();
  await expect(page.getByRole("dialog", { name: /30 min/ })).toBeVisible();
  await expect(page.getByText(/~(2\d|3[0-3]) min/)).toBeVisible();
});
