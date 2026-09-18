import { defineConfig } from "playwright/test";

const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : 2,
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:5175",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "ui", testIgnore: "**/preview.spec.ts" },
    {
      name: "preview",
      testMatch: "**/preview.spec.ts",
      workers: 1,
      dependencies: ["ui"],
    },
  ],
  webServer: [
    {
      command: "bun --no-env-file e2e/server.ts",
      url: "http://127.0.0.1:3003/health",
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command:
        "node node_modules/vite/bin/vite.js --config e2e/vite.config.ts --configLoader bundle",
      url: "http://127.0.0.1:5175/room/e2e",
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
