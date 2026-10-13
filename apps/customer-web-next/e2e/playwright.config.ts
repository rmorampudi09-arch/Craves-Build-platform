import { defineConfig, devices } from "@playwright/test";

// Mocked suite: a production build of customer-web-next with every /api call served by
// support/backend.ts. Start the app yourself (see README) or let webServer do it.
const baseURL = process.env.CRAVES_E2E_BASE_URL ?? "http://127.0.0.1:3100";
const live = process.env.CRAVES_LIVE === "1";

const phone = { ...devices["Pixel 7"], viewport: { width: 375, height: 812 } };
const desktop = { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } };

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 45_000,
  expect: { timeout: 7_000 },
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }], ["junit", { outputFile: "results/junit.xml" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    locale: "en-IN",
    timezoneId: "Asia/Kolkata",
    reducedMotion: "reduce",
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: live
    ? [{ name: "live", testDir: "./live", use: { ...phone, baseURL: "https://craves.in" } }]
    : [
        // Functional journey: phone first (the chef's real device), desktop for the wide layout.
        { name: "phone-375", use: phone, testIgnore: /responsive/ },
        { name: "desktop-1440", use: desktop, testIgnore: /responsive/ },
        // Layout matrix: every key screen at the four widths we support.
        { name: "small-320", use: { ...phone, viewport: { width: 320, height: 640 } }, testMatch: /responsive/ },
        { name: "layout-375", use: phone, testMatch: /responsive/ },
        { name: "tablet-768", use: { ...desktop, viewport: { width: 768, height: 1024 }, hasTouch: true }, testMatch: /responsive/ },
        { name: "layout-1440", use: desktop, testMatch: /responsive/ },
      ],
  webServer:
    process.env.CRAVES_E2E_BASE_URL || live
      ? undefined
      : {
          // Needs a production build of apps/customer-web-next first (see README).
          // prepare-standalone.mjs resolves .next from the working directory, so run from the app root.
          command: "node scripts/prepare-standalone.mjs && node .next/standalone/server.js",
          cwd: "..",
          url: `${baseURL}/chef/sign-in`,
          reuseExistingServer: true,
          timeout: 60_000,
          env: {
            PORT: "3100",
            HOSTNAME: "127.0.0.1",
            CRAVES_CHEF_ONBOARDING_V2_ENABLED: "true",
            CRAVES_CENTRAL_OTP_ENABLED: "true",
            CRAVES_API_BASE_URL: "https://api.invalid",
          },
        },
});
