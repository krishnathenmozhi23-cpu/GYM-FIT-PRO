import { defineConfig, devices } from "@playwright/test";

// End-to-end tests drive the real web app against the real API + PostgreSQL.
// Requires apps/api/.env (see apps/api/.env.example) with a migrated database.
// Set E2E_BASE_URL to test an already-running (e.g. production) build instead of dev servers.
const external = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: external ?? "http://localhost:5173",
    ...devices["Pixel 7"],
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
    trace: "retain-on-failure",
  },
  webServer: external ? [] : [
    { command: "npm run dev:api", url: "http://localhost:4000/health", reuseExistingServer: true, timeout: 60_000 },
    { command: "npm run dev:web", url: "http://localhost:5173", reuseExistingServer: true, timeout: 60_000 },
  ],
});
