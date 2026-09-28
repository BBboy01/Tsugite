import { expect, test, type Page } from "playwright/test";

declare global {
  interface Window {
    releasePackageSync?: () => void;
    restartedSources: string[];
    previewRestartOptions: Array<{ forceStart?: boolean }>;
    finishInitialPreviewStart?: () => void;
    catchupRestartedManifest?: string;
  }
}

async function startControlledPreview(page: Page) {
  await page.clock.install();
  await page.addInitScript(() => {
    localStorage.setItem("iris.language", "en");
    window.restartedSources = [];
    window.previewRestartOptions = [];
  });
  await page.route("**/src/lib/webcontainer-runtime.ts*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `export class WebContainerRuntime {
        async start(files, folders, onEvent) { onEvent({ type: "state", state: "paused" }); }
        async restart(files, folders, onEvent, settings, options) {
          window.restartedSources.push(files.find(file => file.path === "src/App.tsx").text.toString());
          window.previewRestartOptions.push(options ?? {});
          return this.start(files, folders, onEvent);
        }
        async sync() { return { packageChanged: false }; }
        async syncChangedFiles(files) {
          if (files.some(file => file.path === "package.json") && !this.pendingPackage) {
            this.pendingPackage = new Promise(resolve => {
              window.releasePackageSync = () => resolve({ packageChanged: true });
            });
            return this.pendingPackage;
          }
          return { packageChanged: false };
        }
        dispose() {}
      }`,
    }),
  );
  await page.goto(`/room/package-restart-${crypto.randomUUID()}`);
  const preview = page.getByRole("region", { name: "Live preview" });
  await expect(preview.getByText("paused", { exact: true })).toBeVisible();
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1000)));
  await page.getByRole("treeitem", { name: "package.json", exact: true }).click();
  const editor = page.locator(".cm-content");
  await editor.focus();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText(" ");
  await page.clock.runFor(400);
  await expect.poll(() => page.evaluate(() => Boolean(window.releasePackageSync))).toBe(true);
  await page.getByRole("treeitem", { name: "App.tsx", exact: true }).click();
  await editor.focus();
  await page.keyboard.press("ControlOrMeta+A");
  return { editor, preview };
}

test("a delayed package sync preserves newer syntax errors and restarts after correction", async ({
  page,
}, testInfo) => {
  const { editor, preview } = await startControlledPreview(page);
  await page.keyboard.insertText("export const broken = ;");
  await page.clock.runFor(400);
  const error = preview.getByRole("alert");
  await expect(error).toContainText("Unexpected token");
  await page.evaluate(() => window.releasePackageSync!());
  await page.clock.runFor(400);
  await expect(error).toContainText("Unexpected token");
  await expect(error.getByRole("button", { name: "Go to source" })).toBeVisible();
  expect(await page.evaluate(() => window.restartedSources)).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("pending-package-syntax-error.png") });

  await editor.focus();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText("export const repaired = 42;");
  await page.clock.runFor(400);
  await expect
    .poll(() => page.evaluate(() => window.restartedSources))
    .toEqual(["export const repaired = 42;"]);
  await expect(error).toHaveCount(0);
  await expect(preview.getByText("paused", { exact: true })).toBeVisible();
});

test("a delayed package sync still restarts after switching to a valid source", async ({
  page,
}) => {
  const { preview } = await startControlledPreview(page);
  await page.keyboard.insertText("export const current = 42;");
  await page.clock.runFor(400);
  await page.evaluate(() => window.releasePackageSync!());
  await page.clock.runFor(400);
  await expect
    .poll(() => page.evaluate(() => window.restartedSources))
    .toEqual(["export const current = 42;"]);
  await expect(preview.getByRole("alert")).toHaveCount(0);
});

test("package changes detected by startup catch-up request a restart", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("iris.language", "en"));
  await page.route("**/src/lib/webcontainer-runtime.ts*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `export class WebContainerRuntime {
        async start(files, folders, onEvent) {
          onEvent({ type: "state", state: "installing" });
          await new Promise(resolve => { window.finishInitialPreviewStart = resolve; });
          onEvent({ type: "state", state: "paused" });
        }
        async restart(files, folders, onEvent) {
          window.catchupRestartedManifest = files.find(file => file.path === "package.json").text.toString();
          onEvent({ type: "state", state: "paused" });
        }
        async sync() {
          const packageChanged = !this.synced;
          this.synced = true;
          return { packageChanged };
        }
        async syncChangedFiles() { return { packageChanged: false }; }
        dispose() {}
      }`,
    }),
  );
  await page.goto(`/room/package-startup-${crypto.randomUUID()}`);
  await expect
    .poll(() => page.evaluate(() => Boolean(window.finishInitialPreviewStart)))
    .toBe(true);
  await page.getByRole("treeitem", { name: "package.json", exact: true }).click();
  await page.locator(".cm-content").focus();
  await page.keyboard.press("ControlOrMeta+A");
  const manifest = '{"scripts":{"dev":"vite"},"dependencies":{"vite":"8.3.0"}}';
  await page.keyboard.insertText(manifest);
  await page.evaluate(() => window.finishInitialPreviewStart!());
  await expect.poll(() => page.evaluate(() => window.catchupRestartedManifest)).toBe(manifest);
  await expect(page.getByRole("region", { name: "Live preview" }).getByRole("alert")).toHaveCount(
    0,
  );
});

test("an explicit run is not swallowed by a pending package restart", async ({ page }) => {
  const { editor, preview } = await startControlledPreview(page);
  await editor.focus();
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("button", { name: "Start preview automatically", exact: true }).click();
  await page.clock.runFor(400);
  await expect.poll(() => page.evaluate(() => window.previewRestartOptions.length)).toBe(1);
  await page.evaluate(() => {
    window.previewRestartOptions = [];
    window.releasePackageSync!();
  });
  await preview.getByRole("button", { name: "Run preview", exact: true }).click();
  await page.clock.runFor(400);
  await expect
    .poll(() => page.evaluate(() => window.previewRestartOptions))
    .toEqual([{ forceStart: true }]);
  await page.clock.runFor(1000);
  expect(await page.evaluate(() => window.previewRestartOptions)).toEqual([{ forceStart: true }]);
});
