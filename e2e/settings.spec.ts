import { expect, test } from "playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("iris.language", "en"));
});

test("opens shared settings with Mod-comma", async ({ page }) => {
  await page.goto(`/room/e2e-settings-shortcut-${Date.now()}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
  await page.locator(".cm-content").focus();
  await page.keyboard.press("ControlOrMeta+,");
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("keeps workspace settings controls in the Tab order", async ({ page }) => {
  await page.goto(`/room/e2e-settings-tab-order-${Date.now()}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Open settings" }).click();

  const language = page.getByLabel("Language");
  await language.focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Random theme" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(language).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Random theme" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Paper Light" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "GitHub Light" })).toBeFocused();
});

test("searches settings hierarchically and updates the right panel automatically", async ({
  page,
}) => {
  await page.goto(`/room/e2e-settings-search-${Date.now()}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Open settings" }).click();

  const search = page.getByLabel("Search settings");
  await search.fill("relative line");
  await expect(page.getByRole("heading", { name: "Editor" })).toBeVisible();
  await expect(page.locator('[data-setting-id="relativeLineNumbers"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Relative line numbers" })).toBeVisible();
  await expect(page.locator("aside.settings-sidebar-glass button")).toHaveText([
    "Editor",
    "Relative line numbers",
  ]);
  await expect(page.locator("aside.settings-sidebar-glass mark")).toHaveText("Relative line");
});

test("focuses the current settings menu item when opened", async ({ page }) => {
  await page.goto(`/room/e2e-settings-open-focus-${Date.now()}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Open settings" }).click();
  await expect(page.getByRole("button", { name: "Workspace" })).toBeFocused();
});

test("keeps settings navigation focused after changing a font", async ({ page }) => {
  await page.goto(`/room/e2e-settings-font-focus-${Date.now()}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "Editor", exact: true }).click();

  const font = page.locator('[data-slot="select-trigger"]').first();
  await font.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByPlaceholder("Search fonts")).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(font).toBeFocused();
});

test("moves from the editor font to the font size slider on the next Tab", async ({ page }) => {
  await page.goto(`/room/e2e-settings-editor-tab-${Date.now()}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "Editor", exact: true }).click();

  const font = page.getByRole("button", { name: "Font family" });
  const fontSize = page.locator('[role="slider"]');
  await font.focus();
  await page.keyboard.press("Tab");
  await expect(fontSize).toBeFocused();
});

test("exposes WebContainer recovery actions in runtime settings", async ({ page }) => {
  await page.goto(`/room/e2e-runtime-actions-${Date.now()}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "Runtime" }).click();
  await expect(page.getByRole("button", { name: "Restart preview runtime" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reinstall dependencies and restart preview" }),
  ).toBeVisible();
});

test("returns focus to the editor after closing settings", async ({ page }) => {
  await page.goto(`/room/e2e-settings-focus-${Date.now()}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
  await page.locator(".cm-content").focus();
  await page.keyboard.press("ControlOrMeta+,");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close settings" }).click();
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.className))
    .toBe("cm-content");
  await expect(page.locator(".cm-editor")).toHaveClass(/cm-focused/);
});

test("returns focus after settings opened by its button", async ({ page }) => {
  await page.goto(`/room/e2e-settings-button-focus-${Date.now()}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
  await page.locator(".cm-content").focus();
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "Close settings" }).click();
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.className))
    .toBe("cm-content");
});
