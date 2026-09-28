import { defineConfig } from "playwright/test";

const isCI = Boolean(process.env.CI);
const e2eServerPort = Number(process.env.E2E_SERVER_PORT ?? 3003);
const e2eWebPort = Number(process.env.E2E_WEB_PORT ?? 5175);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : 2,
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${e2eWebPort}`,
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
      command: `E2E_SERVER_PORT=${e2eServerPort} bun --no-env-file e2e/server.ts`,
      url: `http://127.0.0.1:${e2eServerPort}/health`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `E2E_SERVER_PORT=${e2eServerPort} E2E_WEB_PORT=${e2eWebPort} node node_modules/vite/bin/vite.js --config e2e/vite.config.ts --configLoader bundle`,
      url: `http://127.0.0.1:${e2eWebPort}/room/e2e`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
