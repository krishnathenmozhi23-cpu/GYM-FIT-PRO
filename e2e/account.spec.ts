import { expect, test, type APIRequestContext } from "@playwright/test";
import { registerAndOnboard } from "./helpers";

async function latestLink(request: APIRequestContext, email: string, path: string): Promise<string> {
  const res = await request.get(`/api/dev/mail?to=${encodeURIComponent(email)}`);
  const { emails } = (await res.json()) as { emails: { text: string }[] };
  const match = [...emails].reverse().map((e) => e.text.match(new RegExp(`(/${path}\\?token=[A-Za-z0-9_-]+)`))?.[1]).find(Boolean);
  expect(match, `no ${path} link emailed`).toBeTruthy();
  return match!;
}

test("verify email, reset a forgotten password, and log in with it", async ({ page, request }) => {
  const email = await registerAndOnboard(page);
  await page.getByRole("link", { name: "Profile" }).click();
  await expect(page.getByText("Not verified")).toBeVisible();

  await page.goto(await latestLink(request, email, "verify-email"));
  await expect(page.getByText("Your email is confirmed.")).toBeVisible();
  await page.getByRole("link", { name: "Back to profile" }).click();
  await expect(page.getByText("Verified", { exact: true })).toBeVisible();

  // Log out, then use "Forgot password?"
  await page.getByRole("button", { name: "Log out" }).click();
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(/reset link is on its way/)).toBeVisible();

  await page.goto(await latestLink(request, email, "reset-password"));
  await page.getByLabel("New password").fill("a-brand-new-password");
  await page.getByLabel("Confirm password").fill("a-brand-new-password");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByText(/Password updated/)).toBeVisible();
  await page.getByRole("button", { name: "Log in" }).click();

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("a-brand-new-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText(/Good (morning|afternoon|evening)/)).toBeVisible();
});

test("delete account removes access", async ({ page }) => {
  const email = await registerAndOnboard(page);
  await page.getByRole("link", { name: "Profile" }).click();
  await page.getByRole("button", { name: "Delete account" }).click();
  const sheet = page.getByRole("dialog", { name: "Delete your account?" });
  await sheet.getByLabel("Password").fill("e2e-password-123");
  const submit = sheet.getByRole("button", { name: "Permanently delete account" });
  await expect(submit).toBeDisabled();
  await sheet.getByLabel(/Type "DELETE"/).fill("DELETE");
  await page.screenshot({ path: "test-results/account-delete.png" });
  await submit.click();
  await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("e2e-password-123");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText("Invalid email or password")).toBeVisible();
});
