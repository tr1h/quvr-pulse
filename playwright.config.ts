import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests run against a live stack (`npm run dev` or `npm start`) and real public
 * data sources — they verify behaviour, not specific market values.
 * If nothing listens on BASE_URL, Playwright starts `npm run dev` itself.
 */
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "e2e",
  timeout: 180_000,
  expect: { timeout: 120_000 },
  retries: 1,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: BASE_URL, trace: "retain-on-failure", locale: "ru-RU" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: true,
    timeout: 240_000,
  },
});
