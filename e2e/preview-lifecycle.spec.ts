import { expect, test, type Page } from "playwright/test";

async function useControlledRuntime(page: Page) {
  await page.route("**/src/lib/webcontainer-runtime.ts*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `export class WebContainerRuntime {
        constructor() { window.previewSyncCalls = []; }
        async start(files, folders, onEvent) { onEvent({ type: "state", state: "paused" }); }
        async restart(...args) { return this.start(...args); }
        async sync() {
          window.previewSyncCalls.push("full");
          if (document.documentElement.dataset.failPreviewSync === "true") {
            throw new Error("Preview file write failed");
          }
          return { packageChanged: false };
        }
        async syncChangedFiles(files) {
          window.previewSyncCalls.push("incremental:" + files.map(file => file.path).join(","));
          return this.sync();
        }
        dispose() {}
      }`,
    }),
  );
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (window === window.top) localStorage.setItem("iris.language", "en");
  });
});

test("reports a failed file sync and recovers through the preview action", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await useControlledRuntime(page);
  await page.goto(`/room/preview-sync-failure-${crypto.randomUUID()}`);
  const preview = page.getByRole("region", { name: "Live preview" });
  await expect(preview.getByText("paused", { exact: true })).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.dataset.failPreviewSync = "true";
  });
  const editor = page.locator(".cm-content");
  await editor.focus();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText("\n// sync retry remains editable\n");
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as typeof window & { previewSyncCalls: string[] }).previewSyncCalls,
      ),
    )
    .toContain("incremental:src/App.tsx");
  await expect(preview.getByRole("alert")).toContainText("Preview file write failed");
  await expect(editor).toContainText("sync retry remains editable");

  await page.evaluate(() => {
    delete document.documentElement.dataset.failPreviewSync;
  });
  await preview.getByRole("button", { name: "Run preview", exact: true }).click();
  await expect(preview.getByRole("alert")).toHaveCount(0);
  await expect(preview.getByText("paused", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("ignores malformed iframe output while preserving valid messages and the editor", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await useControlledRuntime(page);
  await page.goto(`/room/preview-message-validation-${crypto.randomUUID()}`);
  const preview = page.getByRole("region", { name: "Live preview" });
  await expect(preview.getByText("paused", { exact: true })).toBeVisible();
  await page
    .frameLocator('iframe[title^="Preview of "]')
    .locator("body")
    .evaluate(() => {
      parent.postMessage(null, "*");
      parent.postMessage(
        { source: "iris-preview", level: "warn", message: { invalid: true } },
        "*",
      );
      parent.postMessage({ source: "iris-preview", level: "invalid", message: "ignore me" }, "*");
      parent.postMessage(
        { source: "iris-preview", level: "log", message: "valid preview output" },
        "*",
      );
    });
  await preview.getByRole("button", { name: "Expand output", exact: true }).click();
  await expect(preview).toContainText("valid preview output");
  await expect(preview).not.toContainText("ignore me");
  await expect(page.locator(".cm-content")).toBeVisible();
  expect(errors).toEqual([]);
});

test("a failed runtime module load does not prevent editing or silently leave a spinner", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/src/lib/webcontainer-runtime.ts*", (route) => route.abort("failed"));
  await page.goto(`/room/preview-module-failure-${crypto.randomUUID()}`);
  const editor = page.locator(".cm-content");
  await expect(editor).toBeVisible();
  const preview = page.getByRole("region", { name: "Live preview" });
  await expect(preview.getByRole("alert")).toContainText(
    "Failed to fetch dynamically imported module",
  );
  await expect(preview.getByRole("status")).toHaveCount(0);
  await editor.focus();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText("\n// runtime failure does not block editing\n");
  await expect(editor).toContainText("runtime failure does not block editing");
  expect(errors).toEqual([]);
});

test("switching between project and single-file previews disposes and restores the runtime", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("iris.language", "en");
    (window as typeof window & { previewRuntimeCalls: string[] }).previewRuntimeCalls = [];
  });
  await page.route("**/src/lib/webcontainer-runtime.ts*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `export class WebContainerRuntime {
        async start(files, folders, onEvent) {
          window.previewRuntimeCalls.push("start");
          onEvent({ type: "state", state: "paused" });
        }
        async restart(...args) { return this.start(...args); }
        async sync() { return { packageChanged: false }; }
        async syncChangedFiles() { return { packageChanged: false }; }
        dispose() { window.previewRuntimeCalls.push("dispose"); }
      }`,
    }),
  );
  await page.goto(`/room/preview-mode-switch-${crypto.randomUUID()}`);
  const preview = page.getByRole("region", { name: "Live preview" });
  const iframe = page.frameLocator('iframe[title^="Preview of "]');
  await expect(page.locator(".cm-content")).toBeVisible();
  await expect(preview.getByText("paused", { exact: true })).toBeVisible();
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText(
    'document.getElementById("app").textContent = "Single file preview";',
  );

  await page
    .getByRole("treeitem", { name: "package.json", exact: true })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(iframe.locator("#app")).toHaveText("Single file preview");
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as typeof window & { previewRuntimeCalls: string[] }).previewRuntimeCalls,
      ),
    )
    .toEqual(["start", "dispose"]);
  await expect(page.locator(".cm-content")).toBeVisible();

  await page.getByRole("button", { name: "Undo deletion", exact: true }).click();
  await expect(page.locator('iframe[title^="Preview of "]')).toHaveAttribute("srcdoc", "");
  await expect(preview.getByText("paused", { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as typeof window & { previewRuntimeCalls: string[] }).previewRuntimeCalls,
      ),
    )
    .toEqual(["start", "dispose", "start"]);
  await expect(page.locator(".cm-content")).toBeVisible();
});

test("a standalone iframe runtime error changes status without replacing the preview", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("iris.language", "en"));
  await page.goto(`/room/standalone-runtime-error-${crypto.randomUUID()}`);
  await expect(page.locator(".cm-content")).toBeVisible();
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText('throw new Error("standalone failure");');

  await page
    .getByRole("treeitem", { name: "package.json", exact: true })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete", exact: true }).click();

  const preview = page.getByRole("region", { name: "Live preview" });
  await expect(page.frameLocator('iframe[title^="Preview of "]').locator("body")).toBeVisible();
  await expect(preview).toContainText("error");
  await expect(preview).not.toContainText("standalone failure");
  await preview.getByRole("button", { name: "Expand output", exact: true }).click();
  await expect(preview).toContainText("standalone failure");
});
