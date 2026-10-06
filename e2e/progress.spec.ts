import { expect, test } from "@playwright/test";
import { registerAndOnboard } from "./helpers";

test("progress dashboard logs weight and measurements and renders charts", async ({ page }) => {
  await registerAndOnboard(page);
  await page.getByRole("link", { name: "Progress" }).click();
  await expect(page.getByRole("heading", { name: "Progress", exact: true })).toBeVisible();
  await expect(page.getByText("Total workouts")).toBeVisible();
  await expect(page.getByText("22.9")).toBeVisible(); // BMI for 175 cm / 70 kg

  // Log an earlier weigh-in so the chart has two points
  await page.getByRole("button", { name: "Log", exact: true }).click();
  const d = new Date(Date.now() - 7 * 86400000);
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const sheet = page.getByRole("dialog", { name: "Log progress" });
  await sheet.getByLabel("Date").fill(iso);
  await sheet.getByLabel("Weight", { exact: true }).fill("71.2");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("2 entries")).toBeVisible();

  // Measurements
  await page.getByRole("button", { name: "Log", exact: true }).click();
  await sheet.getByRole("button", { name: "Measurements" }).click();
  await sheet.getByLabel("Waist").fill("82");
  await sheet.getByLabel("Chest").fill("98");
  await sheet.getByRole("button", { name: "Save" }).click();
  const measurements = page.getByRole("region", { name: "Body measurements" });
  await expect(measurements.locator(".recharts-surface").first()).toBeVisible();

  // Table view toggle is the accessible alternative
  const weight = page.getByRole("region", { name: "Weight", exact: true });
  await weight.getByRole("button", { name: "Show table" }).click();
  await expect(weight.getByRole("cell", { name: "71.2" })).toBeVisible();
  await page.screenshot({ path: "test-results/phase3-progress.png", fullPage: true });
});
