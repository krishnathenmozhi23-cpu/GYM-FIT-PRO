import { expect, type Page } from "@playwright/test";

/** Starts as a guest from the welcome screen (no email/password) and completes onboarding. */
export async function registerAndOnboard(page: Page, opts: { name?: string; level?: string; goal?: string } = {}) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Get started" })).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveCount(0); // no credentials at the start
  await page.getByRole("button", { name: "Get started" }).click();
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
  await expect(page.getByText(/Good (morning|afternoon|evening)/)).toBeVisible();
}

/** From Profile, adds an email + password to the guest account. Returns the email. */
export async function saveAccount(page: Page, password = "e2e-password-123"): Promise<string> {
  const email = `e2e_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.com`;
  await page.getByRole("link", { name: "Profile" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Save my account" }).click();
  await expect(page.getByText("Not verified")).toBeVisible();
  return email;
}
