import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end journeys: a real browser clicking through the running app.
 *
 *   npm run db:seed:demo     # the demo businesses the journeys use
 *   npm run test:e2e         # every journey, phone and desktop
 *
 * Runs against the dev server on :3000 and reuses it when it is already up (a
 * second `next dev` in the same folder is refused by Next). Uses the Chrome
 * already installed on the machine, so no browser download is needed; on a
 * machine without Chrome run `npx playwright install chromium` and drop
 * `channel`.
 *
 * One worker: the journeys share one database and one set of rate limits, and
 * a sign-in in one test must not race another test's.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    locale: "fa-IR",
    timezoneId: "Asia/Tehran",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "mobile",
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 375, height: 812 },
        channel: "chrome",
      },
    },
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1366, height: 800 },
        channel: "chrome",
      },
    },
  ],
  webServer: {
    command: "npm run dev",
    // Not /api/health: it answers 503 while degraded (no recent backup), which
    // Playwright would read as "not up yet".
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
