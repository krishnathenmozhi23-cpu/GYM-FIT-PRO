import { expect, test } from "@playwright/test";
import { registerAndOnboard } from "./helpers";

test("new user can register and complete onboarding", async ({ page }) => {
  await registerAndOnboard(page);
  await expect(page.getByRole("heading", { name: /Krishna/ })).toBeVisible();
  await page.screenshot({ path: "test-results/phase1-home.png" });
});
