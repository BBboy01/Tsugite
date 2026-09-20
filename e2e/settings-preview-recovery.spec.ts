import { expect, test } from "playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("iris.language", "en"));
});

test("identifies device and room preferences beside their controls", async ({ page }) => {
  await page.goto(`/room/e2e-settings-sharing-${Date.now()}`);
  await expect(page.locator(".cm-editor")).toBeVisible();
  await page.locator(".cm-content").focus();
  await page.keyboard.press("ControlOrMeta+,");
  await expect(page.locator('[data-setting-id="language"]')).toContainText("This device");
  await expect(page.locator('[data-setting-id="theme"]')).toContainText("This room");
  await page.getByRole("button", { name: "Editor", exact: true }).click();
  await expect(page.locator('[data-setting-id="fontSize"]')).toContainText("This room");
  await page.getByRole("button", { name: "Keyboard", exact: true }).click();
  await expect(page.locator('[data-setting-id="vimMode"]')).toContainText("This device");
  await expect(page.locator('[data-setting-id="systemClipboard"]')).toContainText("This device");
  await expect(page.locator('[data-setting-id="fileSearchKeymap"]')).toContainText("This device");
});

test("jumps from a syntax error to its source and clears the stale location after editing", async ({
  page,
}) => {
  await page.goto(`/room/e2e-preview-location-${Date.now()}`);
  const editor = page.locator(".cm-content");
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText("const ready = true;\nconst broken = ;");
  const error = page.getByRole("region", { name: "Live preview" }).getByRole("alert");
  await expect(error).toContainText("Unexpected token", { timeout: 20_000 });
  await expect(
    error.getByRole("button", { name: "Reinstall dependencies and restart preview" }),
  ).toHaveCount(0);
  await error.getByRole("button", { name: "Go to source" }).click();
  await expect(editor).toBeFocused();
  await expect
    .poll(() =>
      page.evaluate(
        () => window.getSelection()?.anchorNode?.parentElement?.closest(".cm-line")?.textContent,
      ),
    )
    .toBe("const broken = ;");
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText("export const App = () => <main>Fixed</main>;");
  await expect(error.getByRole("button", { name: "Go to source" })).toHaveCount(0);
});

test("locates saved syntax errors when the preview runtime first starts", async ({ page }) => {
  await page.goto(`/room/e2e-preview-early-error-${crypto.randomUUID()}`, {
    waitUntil: "domcontentloaded",
  });
  const editor = page.locator(".cm-content");
  await expect(editor).toBeVisible();
  await editor.click();
  await editor.press("ControlOrMeta+A");
  await page.keyboard.insertText("export const broken = ;");
  await expect(page.locator('[data-sync-pending="true"]')).toHaveCount(0);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(editor).toContainText("export const broken = ;");
  const error = page.getByRole("region", { name: "Live preview" }).getByRole("alert");
  await error.getByRole("button", { name: "Go to source" }).click({ timeout: 10_000 });
  await expect(editor).toBeFocused();
  await expect(error.getByRole("button", { name: "Restart preview runtime" })).toHaveCount(0);
});

test("starts the project runtime with a non-script resource selected", async ({ page }) => {
  await page.route("**/src/lib/webcontainer-runtime.ts*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `export const isStoragePartitioningErrorUrl = () => false;
      export class WebContainerRuntime {
        async start() { document.documentElement.dataset.testRuntimeStarted = "true"; }
        async sync() { return { packageChanged: false }; }
        dispose() {}
      }`,
    }),
  );
  await page.goto(`/room/e2e-preview-resource-${crypto.randomUUID()}`);
  await expect(page.locator(".cm-content")).toBeVisible();
  for (const name of ["App.tsx", "main.tsx"]) {
    await page.getByRole("button", { name, exact: true }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Delete", exact: true })
      .click();
  }
  await expect(page.locator('[data-sync-pending="true"]')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('iframe[title="Preview of index.html"]')).toBeAttached();
  await expect(page.locator("html")).toHaveAttribute("data-test-runtime-started", "true");
  await expect(page.getByRole("button", { name: "Go to source" })).toHaveCount(0);
});
