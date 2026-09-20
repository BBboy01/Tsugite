import { expect, test } from "playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("iris.language", "en"));
});

test("opens file search from Vim normal mode", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("tsugite.vim-mode", "true"));
  await page.goto(`/room/e2e-vim-search-${Date.now()}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
  await page.locator(".cm-content").focus();
  await expect(page.locator("[data-vim-mode='normal']")).toBeVisible();
  await page.keyboard.press("ControlOrMeta+P");
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("opens the editor context menu with language actions", async ({ page }) => {
  await page.goto(`/room/e2e-editor-context-menu-${Date.now()}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
  await page.locator(".cm-content").click({ button: "right", position: { x: 80, y: 24 } });
  await expect(page.getByRole("menu")).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Go to definition" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Find references" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Peek definition" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Copy" })).toBeVisible();
});

test("de-emphasizes file search directories and uses text-only matches", async ({ page }) => {
  await page.goto(`/room/e2e-file-search-highlight-${Date.now()}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
  await page.locator(".cm-content").focus();
  await page.keyboard.press("ControlOrMeta+P");
  const search = page.getByPlaceholder("Search files...");
  await search.fill("App");
  const result = page.getByRole("option", { name: /App\.tsx/ }).first();
  await expect(result.locator("[data-file-directory]")).toHaveText("src/");
  await expect(result.locator("[data-file-name]")).toContainText("App.tsx");
  await expect(result.locator("mark")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

  await search.fill("");
  const inactiveResult = page.getByRole("dialog").getByRole("option").nth(1);
  await expect(inactiveResult).toHaveClass(
    /text-\[color-mix\(in_srgb,var\(--muted\)_45%,transparent\)\]/,
  );
  await expect(inactiveResult.locator("[data-file-name]")).toHaveClass(
    /text-\[color-mix\(in_srgb,var\(--muted\)_45%,transparent\)\]/,
  );
});

test("keeps inactive file names muted until they are opened", async ({ page }) => {
  await page.goto(`/room/e2e-file-tree-emphasis-${Date.now()}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });

  const files = page.locator('aside[aria-label="Project files"] [data-context-kind="file"]');
  const folders = page.locator('aside[aria-label="Project files"] [data-context-kind="folder"]');
  const app = files.filter({ hasText: "App.tsx" });
  const index = files.filter({ hasText: "index.css" });
  const src = folders.filter({ hasText: "src" });
  await expect(app).toHaveCSS("color", "rgb(29, 29, 31)");
  await expect(index.locator("span").last()).not.toHaveCSS("color", "rgb(200, 192, 147)");
  await expect(src.locator("span").last()).not.toHaveCSS("color", "rgb(200, 192, 147)");
  await index.getByRole("button").click();
  await expect(app).toHaveCSS("color", "rgb(110, 110, 115)");
  await expect(index).toHaveCSS("color", "rgb(29, 29, 31)");
});

test("toggles the preview console with Mod-J", async ({ page }) => {
  await page.goto(`/room/e2e-preview-console-shortcut-${Date.now()}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
  await page.locator(".cm-content").focus();
  await expect(page.getByRole("button", { name: "Expand output" })).toBeVisible();
  await page.keyboard.press("ControlOrMeta+J");
  await expect(page.getByRole("button", { name: "Collapse output" })).toBeVisible();
  await page.keyboard.press("ControlOrMeta+J");
  await expect(page.getByRole("button", { name: "Expand output" })).toBeVisible();
});

test("exposes the system clipboard setting in Vim keyboard preferences", async ({ page }) => {
  await page.goto(`/room/e2e-system-clipboard-setting-${Date.now()}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "Keyboard" }).click();
  await expect(page.getByRole("switch", { name: "Use system clipboard" })).toBeVisible();
});

test("cycles focus from the current menu through search and right content", async ({ page }) => {
  await page.goto(`/room/e2e-settings-focus-cycle-${Date.now()}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Open settings" }).click();

  const currentMenu = page.getByRole("button", { name: "Workspace" });
  const search = page.getByLabel("Search settings");
  await currentMenu.focus();
  await page.keyboard.press("Tab");
  await expect(search).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Language")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(search).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(currentMenu).toBeFocused();
});

test("highlights the command selected with keyboard navigation", async ({ page }) => {
  await page.goto(`/room/e2e-command-palette-highlight-${Date.now()}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
  await page.locator(".cm-content").focus();
  await page.keyboard.press("ControlOrMeta+K");

  await page.keyboard.press("Control+n");
  const selectedCommand = page.getByRole("button", { name: "Open settings" });
  await expect
    .poll(() => selectedCommand.evaluate((element) => getComputedStyle(element).backgroundColor))
    .not.toBe("rgba(0, 0, 0, 0)");
});

test("scrolls the keyboard-selected command into view", async ({ page }) => {
  await page.goto(`/room/e2e-command-palette-scroll-${Date.now()}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
  await page.locator(".cm-content").focus();
  await page.keyboard.press("ControlOrMeta+K");

  const commandList = page.getByRole("dialog").locator("div.overflow-y-auto");
  const commands = commandList.getByRole("button");
  const count = await commands.count();
  for (let index = 0; index < count - 1; index += 1) {
    await page.keyboard.press("Control+n");
  }

  const selectedCommand = commands.last();
  await expect(selectedCommand).toHaveClass(/text-\[var\(--foreground\)\]/);
  await expect.poll(() => commandList.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(selectedCommand).toBeInViewport();
});

test("uses the active workspace theme", async ({ page }) => {
  await page.goto(`/room/e2e-command-palette-theme-${Date.now()}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "Dracula" }).click();
  await page.getByRole("button", { name: "Close settings" }).click();
  await page.locator(".cm-content").focus();
  await page.keyboard.press("ControlOrMeta+K");

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const colors = await dialog.evaluate((element) => ({
    backgroundColor: getComputedStyle(element).backgroundColor,
    color: getComputedStyle(element).color,
    surface: getComputedStyle(element).getPropertyValue("--glass-popover").trim(),
  }));
  expect(colors).toEqual({
    backgroundColor: "rgba(68, 71, 90, 0.9)",
    color: "rgb(230, 230, 220)",
    surface: "rgba(68, 71, 90, 0.9)",
  });
});

for (const theme of ["Ink Dark", "GitHub Dark", "Solarized Dark", "Tokyo Night"]) {
  test(`${theme} keeps the preview surface aligned with the editor`, async ({ page }) => {
    await page.goto(
      `/room/e2e-preview-theme-${theme.replaceAll(" ", "-").toLowerCase()}-${Date.now()}`,
      {
        waitUntil: "domcontentloaded",
      },
    );
    await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Open settings" }).click();
    await page.getByRole("button", { name: theme }).click();
    await page.getByRole("button", { name: "Close settings" }).click();

    const colors = await page.evaluate(() => {
      const editor = document.querySelector<HTMLElement>('[aria-label^="Editing "]');
      const preview = document.querySelector<HTMLElement>('[aria-label="Live preview"]');
      return {
        editor: editor ? getComputedStyle(editor).backgroundColor : "",
        preview: preview ? getComputedStyle(preview).backgroundColor : "",
      };
    });
    expect(colors.preview).toBe(colors.editor);
  });
}

test("returns focus to the editor after closing file search", async ({ page }) => {
  await page.goto(`/room/e2e-search-focus-${Date.now()}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
  await page.locator(".cm-content").focus();
  await page.keyboard.press("ControlOrMeta+P");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.className))
    .toBe("cm-content");
});

test("focuses the editor after opening a file from file search", async ({ page }) => {
  await page.goto(`/room/e2e-search-select-focus-${Date.now()}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
  await page.locator(".cm-content").focus();
  await page.keyboard.press("ControlOrMeta+P");
  await expect(page.getByPlaceholder("Search files...")).toBeVisible();
  await page.getByPlaceholder("Search files...").fill("App.tsx");
  await page.getByRole("option", { name: "src/App.tsx" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("region", { name: "Editing src/App.tsx" })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.className))
    .toBe("cm-content");
});

test("keeps Vim navigation focused after opening a file from search", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("tsugite.vim-mode", "true"));
  await page.goto(`/room/e2e-search-vim-focus-${Date.now()}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
  await page.locator(".cm-content").focus();
  await expect(page.locator("[data-vim-mode='normal']")).toBeVisible();
  await page.keyboard.press("ControlOrMeta+P");
  await page.getByPlaceholder("Search files...").fill("App.tsx");
  await page.getByRole("option", { name: "src/App.tsx" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.className))
    .toBe("cm-content");
  await expect(page.locator(".cm-editor")).toHaveClass(/cm-focused/);
  await page.keyboard.press("j");
  await expect(page.locator(".cm-editor")).toHaveClass(/cm-focused/);
});

test("loads the editor and supports collapsing the source tree", async ({ page }) => {
  await page.goto("/room/e2e", { waitUntil: "domcontentloaded" });

  await expect(page.locator("header.glass-header")).toBeVisible();
  await expect(page.getByText("Tsugite", { exact: true })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Project files" })).toBeVisible();
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });

  const sourceFolder = page.getByRole("button", { name: "src folder" });
  await expect(sourceFolder).toHaveAttribute("aria-expanded", "true");
  await sourceFolder.click();
  await expect(sourceFolder).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("button", { name: "main.tsx", exact: true })).toBeHidden();
  await sourceFolder.click();
  await expect(page.getByRole("button", { name: "main.tsx", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "main.tsx", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.className))
    .toBe("cm-content");
});

test("opens App.tsx and focuses the editor after a refresh", async ({ page }) => {
  await page.goto(`/room/e2e-default-editor-${Date.now()}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("region", { name: "Editing src/App.tsx" })).toBeVisible({
    timeout: 15_000,
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("region", { name: "Editing src/App.tsx" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator(".cm-content")).toBeFocused();
});
