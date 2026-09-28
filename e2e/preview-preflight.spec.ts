import { expect, test, type Page } from "playwright/test";
import type { RuntimeEvent } from "../apps/web/src/lib/webcontainer-runtime";

declare global {
  interface Window {
    preflightSources: string[];
    emitPreflightRuntimeEvent: (event: RuntimeEvent) => void;
  }
}

async function usePreflightProbe(page: Page, release?: Promise<void>) {
  const requested = Promise.withResolvers<void>();
  await page.addInitScript(() => {
    localStorage.setItem("iris.language", "en");
    window.preflightSources = [];
  });
  await page.route("**/src/lib/webcontainer-runtime.ts*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `export class WebContainerRuntime {
        async start(files, folders, onEvent) {
          window.emitPreflightRuntimeEvent = onEvent;
          onEvent({ type: "state", state: "paused" });
        }
        async restart(...args) { return this.start(...args); }
        async sync() { return { packageChanged: false }; }
        async syncChangedFiles() { return { packageChanged: false }; }
        dispose() {}
      }`,
    }),
  );
  await page.route("**/src/lib/preview-runner.ts*", async (route) => {
    if (new URL(route.request().url()).searchParams.has("preflight-original")) {
      await route.continue();
      return;
    }
    requested.resolve();
    await release;
    await route.fulfill({
      contentType: "application/javascript",
      body: `import * as original from "/src/lib/preview-runner.ts?preflight-original";
      export * from "/src/lib/preview-runner.ts?preflight-original";
      export function validateSourceSyntaxDetails(...args) {
        window.preflightSources.push(args[0]);
        return original.validateSourceSyntaxDetails(...args);
      }`,
    });
  });
  return { requested: requested.promise };
}

async function pauseAfterStartup(page: Page) {
  await page.clock.install();
  await usePreflightProbe(page);
  await page.goto(`/room/preflight-${crypto.randomUUID()}`);
  await expect(
    page.getByRole("region", { name: "Live preview" }).getByText("paused", { exact: true }),
  ).toBeVisible();
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1000)));
  await page.evaluate(() => {
    window.preflightSources = [];
  });
  await page.locator(".cm-content").focus();
  await page.keyboard.press("ControlOrMeta+End");
}

test("coalesces rapid edits before running real syntax validation", async ({ page }) => {
  await pauseAfterStartup(page);
  for (const text of ["\n//", " rapid", " edits"]) {
    await page.keyboard.insertText(text);
    await page.clock.runFor(100);
  }
  expect(await page.evaluate(() => window.preflightSources)).toEqual([]);
  await page.clock.runFor(300);
  await expect.poll(() => page.evaluate(() => window.preflightSources.length)).toBe(1);
  expect(await page.evaluate(() => window.preflightSources[0].endsWith("\n// rapid edits"))).toBe(
    true,
  );
  await expect(page.locator(".cm-content")).toContainText("// rapid edits");
});

test("runtime progress still arrives while preflight waits for typing to stop", async ({
  page,
}) => {
  await pauseAfterStartup(page);
  await page.keyboard.insertText("\n// pending edit");
  await page.clock.runFor(100);
  await page.evaluate(() =>
    window.emitPreflightRuntimeEvent({ type: "state", state: "installing" }),
  );
  await expect(
    page
      .getByRole("region", { name: "Live preview" })
      .locator("header")
      .getByText("installing dependencies", { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.preflightSources)).toEqual([]);
  await page.clock.runFor(300);
  await expect.poll(() => page.evaluate(() => window.preflightSources.length)).toBe(1);
});

test("skips cancelled validation after its module finishes loading", async ({ page }) => {
  const release = Promise.withResolvers<void>();
  const { requested } = await usePreflightProbe(page, release.promise);
  try {
    await page.goto(`/room/preflight-load-${crypto.randomUUID()}`, {
      waitUntil: "domcontentloaded",
    });
    await requested;
    const editor = page.locator(".cm-content");
    await editor.focus();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.insertText("export const latest = 42;");
    release.resolve();
    await expect(
      page.getByRole("region", { name: "Live preview" }).getByText("paused", { exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => window.preflightSources)).toEqual([
      "export const latest = 42;",
    ]);
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.insertText("export const broken = ;");
    const error = page.getByRole("region", { name: "Live preview" }).getByRole("alert");
    await expect(error).toContainText("Unexpected token");
    await expect(error.getByRole("button", { name: "Go to source" })).toBeVisible();
  } finally {
    release.resolve();
    await page.unrouteAll({ behavior: "wait" });
  }
});
