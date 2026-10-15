import { expect, test, type Page } from "playwright/test";
import type { ProjectFile } from "@iris/shared";
import type { WebContainerRuntime, RuntimeEvent } from "../apps/web/src/lib/webcontainer-runtime";
import type { TypeScriptWorkerClient } from "../apps/web/src/lib/typescript-worker-client";

function starterCounter(page: Page, count = 0) {
  return page
    .frameLocator('iframe[title^="Preview of "]')
    .getByRole("button", { name: `Count is ${count}`, exact: true });
}

async function expectPreviewReady(page: Page, timeout = 30_000) {
  await expect(starterCounter(page)).toBeVisible({ timeout });
  await expect(
    page
      .getByRole("region", { name: "Live preview", includeHidden: true })
      .getByRole("status", { includeHidden: true }),
  ).toBeHidden();
}

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) return;
  if (!(await page.getByRole("region", { name: "Live preview" }).isVisible())) return;
  const expand = page.getByRole("button", { name: "Expand output", exact: true });
  if (await expand.isVisible()) await expand.click();
  await testInfo.attach("preview-output", {
    body: await page.getByRole("region", { name: "Live preview" }).innerText(),
    contentType: "text/plain",
  });
});

test("keeps the initial room socket open through development remounts", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const socketWarnings: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning" && message.text().includes("WebSocket connection")) {
      socketWarnings.push(message.text());
    }
  });
  await page.goto("/room/e2e-connection-" + process.pid + "-" + testInfo.repeatEachIndex, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
  const preview = page.locator('iframe[title^="Preview of "]');
  await expect(preview).toHaveAttribute("src", /^https?:\/\//, { timeout: 150_000 });
  await expect(preview).toHaveAttribute("sandbox", "allow-scripts allow-same-origin");
  await expectPreviewReady(page);
  await starterCounter(page).click();
  await expect(starterCounter(page, 1)).toBeVisible();
  expect(socketWarnings).toEqual([]);
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (window.top === window) localStorage.setItem("iris.language", "en");
  });
});

test("real WebContainer scans installed declarations into the real TypeScript Worker", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await page.route("**/declaration-runtime", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<title>Declaration runtime</title>",
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
      },
    }),
  );
  await page.goto("/declaration-runtime");
  const result = await page.evaluate(async () => {
    const runtimePath = "/src/lib/webcontainer-runtime.ts";
    const clientPath = "/src/lib/typescript-worker-client.ts";
    const { WebContainerRuntime: Runtime } = (await import(runtimePath)) as {
      WebContainerRuntime: typeof WebContainerRuntime;
    };
    const { TypeScriptWorkerClient: Client } = (await import(clientPath)) as {
      TypeScriptWorkerClient: typeof TypeScriptWorkerClient;
    };
    const source =
      'import {\n answer\n} from "typed-pkg"; const label = "界\\\\path"; const value = answer;';
    const resources = [
      { path: "package.json", text: '{"dependencies":{"typed-pkg":"1.0.0"}}' },
      { path: "node_modules/typed-pkg/package.json", text: '{"types":"index.d.ts"}' },
      {
        path: "node_modules/typed-pkg/index.d.ts",
        text: 'export declare const answer: "webcontainer-types";',
      },
      { path: "src/app.ts", text: source },
    ];
    const files = resources.map(({ path, text }, id) => ({
      id: String(id),
      path,
      language: "typescript",
      text: { toString: () => text },
    })) as unknown as ProjectFile[];
    const events: RuntimeEvent[] = [];
    const runtime = new Runtime();
    const client = new Client([{ path: "src/app.ts", text: source }]);
    try {
      await runtime.start(files, [], (event) => events.push(event), {
        packageManager: "npm",
        autoInstall: false,
        autoStartPreview: false,
      });
      if (!events.some((event) => event.type === "state" && event.state === "paused"))
        return { events, status: "runtime-unavailable" };
      const scanStart = performance.now();
      const declarations = await runtime.readTypeScriptDeclarations([
        { path: "src/app.ts", text: source },
      ]);
      await client.syncWorkspace([{ path: "src/app.ts", text: source }, ...declarations]);
      const hover = await client.hover({
        path: "src/app.ts",
        position: source.lastIndexOf("answer"),
      });
      return {
        events,
        status: client.status,
        hover,
        paths: declarations.map(({ path }) => path),
        scanMs: performance.now() - scanStart,
      };
    } catch (error) {
      return { events, status: "scan-failed", error: String(error) };
    } finally {
      client.dispose();
      runtime.dispose();
    }
  });
  await testInfo.attach("real-webcontainer-declarations", {
    body: JSON.stringify(result),
    contentType: "application/json",
  });
  expect(result.status, JSON.stringify(result)).toBe("worker");
  expect(result.paths).toContain("node_modules/typed-pkg/index.d.ts");
  expect(result.hover).toMatchObject({
    status: "ok",
    value: { signature: expect.stringContaining('"webcontainer-types"') },
  });
});

test("keeps the runtime action focused while restarting the preview", async ({ page }) => {
  await page.goto(`/room/e2e-settings-runtime-focus-${Date.now()}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "Runtime", exact: true }).click();

  const restart = page.getByRole("button", { name: "Restart preview runtime" });
  await restart.focus();
  await page.keyboard.press("Enter");
  await expect(restart).toBeFocused();
});

test("restores the preview after either runtime recovery action", async ({ page }, testInfo) => {
  test.setTimeout(360_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`/room/e2e-runtime-recovery-${Date.now()}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Waiting for the room snapshot…")).toBeHidden({ timeout: 90_000 });
  await expect(page.getByRole("treeitem", { name: "package.json", exact: true })).toBeVisible({
    timeout: 90_000,
  });
  const preview = page.locator('iframe[title^="Preview of "]');
  await expect(preview).toHaveAttribute("src", /^https?:\/\//, { timeout: 150_000 });
  await expectPreviewReady(page);
  await starterCounter(page).click();
  await expect(starterCounter(page, 1)).toBeVisible();

  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "Runtime", exact: true }).click();

  const restart = page.getByRole("button", { name: "Restart preview runtime" });
  await restart.click();
  await expect(preview).not.toHaveAttribute("src", /^https?:\/\//);
  await expect(page.getByText("Waiting for preview…")).toBeHidden({ timeout: 90_000 });
  await expect(preview).toHaveAttribute("src", /^https?:\/\//, { timeout: 150_000 });
  await expectPreviewReady(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await starterCounter(page).click();
  await expect(starterCounter(page, 1)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("preview-restarted.png") });

  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "Runtime", exact: true }).click();

  const reinstall = page.getByRole("button", {
    name: "Reinstall dependencies and restart preview",
  });
  await reinstall.click();
  await expect(preview).not.toHaveAttribute("src", /^https?:\/\//);
  await expect(page.getByText("Waiting for preview…")).toBeHidden({ timeout: 90_000 });
  await expect(preview).toHaveAttribute("src", /^https?:\/\//, { timeout: 150_000 });
  await expectPreviewReady(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await starterCounter(page).click();
  await expect(starterCounter(page, 1)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("preview-reinstalled.png") });
  expect(pageErrors).toEqual([]);
});

test("keeps the preview running after closing the last file tab", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto(`/room/e2e-preview-after-close-${Date.now()}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Close src/App.tsx" }).click();
  await expect(page.getByText("No open files")).toBeVisible();
  await expect(page.getByText("Waiting for the room snapshot…")).toBeHidden();
  await expect(page.getByText("Waiting for preview…")).toBeHidden();
  await expect(page.getByRole("region", { name: "Live preview" })).toBeVisible();
  await expect(page.locator("iframe").first()).toBeVisible({ timeout: 15_000 });
  await expectPreviewReady(page, 150_000);
});

test("keeps the project preview stable when switching editor files", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto(`/room/e2e-preview-file-switch-${Date.now()}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
  const preview = page.locator('iframe[title^="Preview of "]');
  await expect(preview).toHaveAttribute("src", /^https?:\/\//, { timeout: 150_000 });
  const previewUrl = await preview.getAttribute("src");
  await expectPreviewReady(page);
  await starterCounter(page).click();
  await expect(starterCounter(page, 1)).toBeVisible();

  await page.getByRole("treeitem", { name: "index.html", exact: true }).click();
  await expect(preview).toHaveAttribute("src", previewUrl ?? "");
  await expect(page.getByText("Waiting for preview…")).toBeHidden();
  await expect(starterCounter(page, 1)).toBeVisible();
});

test("shows syntax errors in preview instead of a blank frame", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.goto(
    "/room/e2e-preview-syntax-" + testInfo.workerIndex + "-" + testInfo.repeatEachIndex,
    { waitUntil: "domcontentloaded" },
  );
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('iframe[title^="Preview of "]')).toHaveAttribute(
    "src",
    /^https?:\/\//,
    { timeout: 150_000 },
  );
  const preview = page.locator('iframe[title^="Preview of "]');
  const previewUrl = await preview.getAttribute("src");
  await expectPreviewReady(page);

  const editor = page.locator(".cm-content");
  const originalSource = await editor.locator(".cm-line").allTextContents();
  await editor.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("export const broken = ;");

  await expect(page.getByRole("alert")).toContainText(/Unexpected token|PARSE_ERROR/, {
    timeout: 60_000,
  });
  await page.screenshot({ path: testInfo.outputPath("preview-syntax-error.png") });

  await editor.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText(originalSource.join("\n"));
  await expect(page.getByRole("alert")).toHaveCount(0, { timeout: 60_000 });
  await expect(preview).toHaveAttribute("src", previewUrl ?? "");
  await expectPreviewReady(page);
  await starterCounter(page).click();
  await expect(starterCounter(page, 1)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("preview-syntax-recovered.png") });
});
