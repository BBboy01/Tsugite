import { defineConfig } from "playwright/test";

const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command: "bun run dev:server",
      url: "http://127.0.0.1:3001/health",
      reuseExistingServer: !isCI,
      timeout: 30_000,
    },
    {
      command: "bun run dev:web -- --host 127.0.0.1",
      url: "http://127.0.0.1:5173/room/e2e",
      reuseExistingServer: !isCI,
      timeout: 30_000,
    },
  ],
});
