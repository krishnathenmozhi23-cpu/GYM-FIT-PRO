import { expect, type Page } from "@playwright/test";

export async function registerAndOnboard(page: Page, opts: { name?: string; level?: string; goal?: string } = {}) {
  const email = `e2e_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.com`;
  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("e2e-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "About you" })).toBeVisible();

  await page.getByLabel("Name").fill(opts.name ?? "Krishna");
  await page.getByRole("button", { name: "Male", exact: true }).click();
  await page.getByLabel("Height").fill("175");
  await page.getByLabel("Weight").fill("70");
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("button", { name: new RegExp(opts.level ?? "Beginner") }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("button", { name: new RegExp(opts.goal ?? "Muscle gain") }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("button", { name: /^Gym/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("button", { name: "Increase days per week" }).click();
  await page.getByRole("button", { name: "60 min" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("button", { name: "Build my plan" }).click();
  return email;
}
