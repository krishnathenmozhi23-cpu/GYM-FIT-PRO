import { expect, test } from "@playwright/test";
import { registerAndOnboard } from "./helpers";

test("user can follow, track and finish a workout", async ({ page }) => {
  await registerAndOnboard(page);
  // Today card offers either today's workout or "train anyway" on a rest day.
  const startBtn = page.getByRole("button", { name: /Start workout|Train anyway/ });
  await expect(startBtn).toBeVisible();
  await page.screenshot({ path: "test-results/phase2-home.png" });
  await startBtn.click();

  await expect(page.getByLabel("Workout time")).toBeVisible();
  // Log a set on the first exercise
  const weight = page.getByLabel("Weight in kg");
  if (await weight.isVisible()) await weight.fill("20");
  await page.getByRole("button", { name: "Log set" }).click();
  await expect(page.getByRole("dialog", { name: "Rest timer" })).toBeVisible();
  await page.getByRole("button", { name: "Skip rest" }).click();
  await expect(page.getByRole("button", { name: "Undo set 1" })).toBeVisible();
  await page.screenshot({ path: "test-results/phase2-player.png" });

  // Pause and resume
  await page.getByRole("button", { name: "Pause workout" }).click();
  await expect(page.getByText("Workout paused")).toBeVisible();
  await page.getByRole("button", { name: "Resume workout" }).click();

  // Replace the second exercise
  await page.getByRole("button", { name: "Next exercise" }).click();
  await page.getByRole("button", { name: "Replace" }).click();
  await expect(page.getByRole("dialog", { name: "Replace exercise" })).toBeVisible();
  await page.getByRole("dialog", { name: "Replace exercise" }).locator(".list-item").first().click();
  await expect(page.getByText(/replaces/)).toBeVisible();

  // Skip it, then finish
  await page.getByRole("button", { name: "Skip" }).click();
  await page.getByRole("button", { name: "Finish workout" }).click();
  await page.getByRole("radio", { name: /Just right/ }).click();
  await page.getByRole("button", { name: "Save workout" }).click();
  await expect(page.getByRole("heading", { name: "Workout complete" })).toBeVisible();
  await page.screenshot({ path: "test-results/phase2-summary.png" });
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText(/1\/4 workouts/)).toBeVisible();
});

test("exercise library filters and shows alternatives", async ({ page }) => {
  await registerAndOnboard(page);
  await page.getByRole("link", { name: "Explore" }).click();
  await page.getByRole("button", { name: "Chest", exact: true }).click();
  await page.getByLabel("Search exercises").fill("bench");
  await page.getByRole("link", { name: /Barbell Bench Press/ }).first().click();
  await expect(page.getByRole("heading", { name: "Barbell Bench Press" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Alternatives" })).toBeVisible();
  await expect(page.getByText("Dumbbell Bench Press")).toBeVisible();
  await page.screenshot({ path: "test-results/phase2-exercise.png", fullPage: true });
});
