import { expect, test } from "@playwright/test";
import { registerAndOnboard } from "./helpers";

// Chromium's fake camera. FORMCHECK_VIDEO may point at a .y4m/.mjpeg of a
// real person; without it Chromium shows a synthetic test pattern (no person).
const video = process.env.FORMCHECK_VIDEO;
test.use({
  permissions: ["camera"],
  launchOptions: {
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {}),
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      ...(video ? [`--use-file-for-fake-video-capture=${video}`] : []),
    ],
  },
});

test("exercise page shows the learning section and runs the on-device camera check", async ({ page }) => {
  test.setTimeout(120_000);
  await registerAndOnboard(page);
  await page.goto("/explore/dumbbell-lateral-raise");
  await expect(page.getByRole("heading", { name: "Learn the movement" })).toBeVisible();
  const photo = page.getByRole("img", { name: /Dumbbell Lateral Raise demonstration/ });
  await expect(photo).toBeVisible();
  expect(await photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(page.getByText(/Free Exercise DB/)).toBeVisible();
  await expect(page.getByRole("img", { name: /Animated form guide/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Find demonstration videos/ })).toHaveAttribute("href", /youtube\.com\/results\?search_query=Dumbbell%20Lateral%20Raise/);

  await page.getByRole("button", { name: /Practice with camera form check/ }).click();
  const dialog = page.getByRole("dialog", { name: /Form check: Dumbbell Lateral Raise/ });
  await expect(dialog.getByText(/never uploaded/)).toBeVisible();
  await dialog.getByRole("button", { name: "Start camera" }).click();

  // Model + camera load, then the live view is running.
  await expect(dialog.getByRole("button", { name: "Finish set" })).toBeEnabled({ timeout: 60_000 });
  await expect(dialog.getByText(/reps · \d+ clean/)).toBeVisible({ timeout: 30_000 });

  if (video) {
    // A real person: the model should find them and draw the skeleton.
    await expect(dialog.getByText(/Looking for you/)).toBeHidden({ timeout: 20_000 });
    await page.waitForTimeout(1500);
    const drawn = await page.locator(".formcheck-stage canvas").evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++;
      return n;
    });
    expect(drawn).toBeGreaterThan(500);
    await page.screenshot({ path: "test-results/formcheck-live.png" });
  } else {
    await expect(dialog.getByText(/Looking for you/)).toBeVisible({ timeout: 20_000 });
  }

  await dialog.getByRole("button", { name: "Finish set" }).click();
  await expect(dialog.getByRole("button", { name: "Done" })).toBeVisible();
  await page.screenshot({ path: "test-results/formcheck-summary.png" });
});

test("form check is available inside a workout and the guide opens from the exercise card", async ({ page }) => {
  test.setTimeout(120_000);
  await registerAndOnboard(page);
  // Start a workout containing push-ups (camera-checkable) using the browser's session.
  const res = await page.request.post("/api/workout-session", {
    data: {
      title: "Push-up practice",
      exercises: [{ exerciseId: "push-up", sets: 2, repsMin: 8, repsMax: 12, durationSeconds: null, restSeconds: 60, targetWeightKg: null }],
    },
  });
  expect(res.status()).toBe(201);
  const { session } = (await res.json()) as { session: { id: string } };
  await page.goto(`/session/${session.id}`);
  await expect(page.getByLabel("Workout time")).toBeVisible();

  // The demonstration plays right on the exercise card.
  const photo = page.getByRole("img", { name: /Push-up demonstration/ });
  await expect(photo).toBeVisible();
  const first = await photo.getAttribute("src");
  await expect(page.getByRole("img", { name: /Push-up demonstration/ })).not.toHaveAttribute("src", first!, { timeout: 5000 });
  await page.getByRole("button", { name: /Pause Push-up demo/ }).click();
  await expect(page.getByRole("button", { name: /Play Push-up demo/ })).toBeVisible();

  await page.getByRole("button", { name: "Watch how" }).click();
  await expect(page.getByRole("img", { name: /Animated form guide/ })).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Check my form" }).click();
  const dialog = page.getByRole("dialog", { name: /Form check:/ });
  await expect(dialog.getByText("Form check", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Start camera" }).click();
  await expect(dialog.getByRole("button", { name: "Finish set" })).toBeEnabled({ timeout: 60_000 });
  await dialog.getByRole("button", { name: "Finish set" }).click();
  await dialog.getByRole("button", { name: "Done" }).click(); // nothing detected → nothing saved
  await expect(dialog).toBeHidden();
});

test("every exercise card has a demonstration; unsupported ones say why there's no camera check", async ({ page }) => {
  await registerAndOnboard(page);
  const res = await page.request.post("/api/workout-session", {
    data: {
      title: "Demo coverage",
      exercises: [
        { exerciseId: "bird-dog", sets: 2, repsMin: 8, repsMax: 10, durationSeconds: null, restSeconds: 45, targetWeightKg: null },
        { exerciseId: "pull-up", sets: 2, repsMin: 5, repsMax: 8, durationSeconds: null, restSeconds: 90, targetWeightKg: null },
      ],
    },
  });
  expect(res.status()).toBe(201);
  const { session } = (await res.json()) as { session: { id: string } };
  await page.goto(`/session/${session.id}`);
  // Bird dog has no photos, so it gets the animated figure — and no camera check, with the reason.
  await expect(page.getByRole("img", { name: /Animated demonstration: On hands and knees/ })).toBeVisible();
  await expect(page.getByText(/No camera form check for this exercise/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Check my form" })).toHaveCount(0);

  await page.getByRole("button", { name: /Next exercise/ }).click();
  await expect(page.getByRole("img", { name: /Pull-up demonstration/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Check my form" })).toBeVisible();
});
