import { expect, test, type Page } from "playwright/test";

function readEditorText(page: Page) {
  return page.locator(".cm-content").evaluate((element) => {
    const clone = element.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(".cm-remote-cursor-label").forEach((label) => label.remove());
    return Array.from(clone.querySelectorAll(".cm-line"))
      .map((line) => line.textContent ?? "")
      .join("\n");
  });
}

test.describe("room shell", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("iris.language", "en");
    });
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

  test("dismisses file search and command palette by clicking the backdrop", async ({ page }) => {
    await page.goto(`/room/e2e-dialog-backdrop-${Date.now()}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
    await page.locator(".cm-content").focus();

    await page.keyboard.press("ControlOrMeta+P");
    await expect(page.getByPlaceholder("Search files...")).toBeVisible();
    await page
      .locator(".glass-overlay")
      .last()
      .click({ position: { x: 4, y: 4 } });
    await expect(page.getByRole("dialog")).toBeHidden();

    await page.keyboard.press("ControlOrMeta+K");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page
      .locator(".glass-overlay")
      .last()
      .click({ position: { x: 4, y: 4 } });
    await expect(page.getByRole("dialog")).toBeHidden();
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
    await page.getByRole("button", { name: "Open shared settings" }).click();

    const language = page.getByLabel("Language");
    await language.focus();
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
    await page.getByRole("button", { name: "Open shared settings" }).click();

    const search = page.getByLabel("Search settings");
    await search.fill("relative line");
    await expect(page.getByRole("heading", { name: "Editor" })).toBeVisible();
    await expect(page.locator('[data-setting-id="relativeLineNumbers"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Relative line numbers" })).toBeVisible();
  });

  test("cycles focus from the current menu through search and right content", async ({ page }) => {
    await page.goto(`/room/e2e-settings-focus-cycle-${Date.now()}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Open shared settings" }).click();

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

  test("keeps settings navigation focused after changing a font", async ({ page }) => {
    await page.goto(`/room/e2e-settings-font-focus-${Date.now()}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Open shared settings" }).click();
    await page.getByRole("button", { name: "Editor", exact: true }).click();

    const font = page.locator('[data-slot="select-trigger"]').first();
    await font.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByPlaceholder("Search fonts")).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(font).toBeFocused();
  });

  test("keeps the runtime action focused while restarting the preview", async ({ page }) => {
    await page.goto(`/room/e2e-settings-runtime-focus-${Date.now()}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Open shared settings" }).click();
    await page.getByRole("button", { name: "Runtime" }).click();

    const restart = page.getByRole("button", { name: "Restart preview runtime" });
    await restart.focus();
    await page.keyboard.press("Enter");
    await expect(restart).toBeFocused();
  });

  test("changes the workspace language from the command palette", async ({ page }) => {
    await page.goto(`/room/e2e-command-palette-language-${Date.now()}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
    await page.locator(".cm-content").focus();
    await page.keyboard.press("ControlOrMeta+K");
    await page.getByRole("button", { name: "Language" }).click();
    await page.getByRole("button", { name: "简体中文" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("iris.language")))
      .toBe("zh-CN");
  });

  test("exposes WebContainer recovery actions in runtime settings", async ({ page }) => {
    await page.goto(`/room/e2e-runtime-actions-${Date.now()}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Open shared settings" }).click();
    await page.getByRole("button", { name: "Runtime" }).click();
    await expect(page.getByRole("button", { name: "Restart preview runtime" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Reinstall dependencies and restart preview" }),
    ).toBeVisible();
  });

  test("restores the preview after either runtime recovery action", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto(`/room/e2e-runtime-recovery-${Date.now()}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Waiting for the room snapshot…")).toBeHidden({ timeout: 90_000 });
    await expect(page.getByRole("button", { name: "package.json", exact: true })).toBeVisible({
      timeout: 90_000,
    });
    const preview = page.locator('iframe[title^="Preview of "]');
    await expect(preview).toHaveAttribute("src", /^https?:\/\//, { timeout: 90_000 });

    await page.getByRole("button", { name: "Open shared settings" }).click();
    await page.getByRole("button", { name: "Runtime" }).click();

    const restart = page.getByRole("button", { name: "Restart preview runtime" });
    await restart.click();
    await expect(page.getByText("Waiting for preview…")).toBeHidden({ timeout: 90_000 });
    await expect(preview).toHaveAttribute("src", /^https?:\/\//, { timeout: 90_000 });

    const reinstall = page.getByRole("button", {
      name: "Reinstall dependencies and restart preview",
    });
    await reinstall.click();
    await expect(page.getByText("Waiting for preview…")).toBeHidden({ timeout: 90_000 });
    await expect(preview).toHaveAttribute("src", /^https?:\/\//, { timeout: 90_000 });
  });

  test("opens the command palette and exposes extensible keymap actions", async ({ page }) => {
    await page.goto(`/room/e2e-command-palette-${Date.now()}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
    await page.locator(".cm-content").focus();
    await page.keyboard.press("ControlOrMeta+K");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("button", { name: "Open file" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open settings" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open file" })).toContainText("Mod-P");
    await expect(page.getByRole("button", { name: "Open settings" })).toContainText("Mod-,");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Open shared settings" }).click();
    await page.getByRole("button", { name: "Keyboard" }).click();
    await expect(page.getByLabel("File search shortcut")).toHaveValue("Mod-P");
    await expect(page.getByLabel("Open settings shortcut")).toHaveValue("Mod-,");
    await expect(page.getByLabel("Command palette shortcut")).toHaveValue("Mod-K");
  });

  test("exposes and executes runtime actions from the command palette", async ({ page }) => {
    await page.goto(`/room/e2e-command-palette-runtime-${Date.now()}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
    await page.locator(".cm-content").focus();
    await page.keyboard.press("ControlOrMeta+K");
    await expect(page.getByRole("button", { name: "Restart preview runtime" })).toBeVisible();
    await page.getByRole("button", { name: "Restart preview runtime" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("navigates command palette actions with Ctrl+N and Ctrl+P", async ({ page }) => {
    await page.goto(`/room/e2e-command-palette-navigation-${Date.now()}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
    await page.locator(".cm-content").focus();
    await page.keyboard.press("ControlOrMeta+K");
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.keyboard.press("Control+n");
    await page.keyboard.press("Control+p");
    await page.keyboard.press("Enter");

    await expect(page.getByPlaceholder("Search files...")).toBeVisible();
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

    for (let index = 0; index < 11; index += 1) {
      await page.keyboard.press("Control+n");
    }

    const commandList = page.getByRole("dialog").locator("div.overflow-y-auto");
    const selectedCommand = page.getByRole("button", {
      name: "Start preview automatically",
    });
    await expect
      .poll(() => commandList.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    await expect(selectedCommand).toBeInViewport();
  });

  test("updates workspace settings from command palette actions", async ({ page }) => {
    await page.goto(`/room/e2e-command-palette-settings-${Date.now()}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
    await page.locator(".cm-content").focus();
    await page.keyboard.press("ControlOrMeta+K");

    await expect(page.getByRole("button", { name: "Random theme" })).toBeVisible();
    await page.getByRole("button", { name: "Language" }).click();
    await expect(page.getByRole("button", { name: "English" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Language" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await page.locator(".cm-content").focus();
    await page.keyboard.press("ControlOrMeta+K");
    const commandSearch = page.getByPlaceholder("Search commands...");
    await commandSearch.fill("Toggle");
    await expect(page.getByText("No matching commands")).toBeVisible();
    await commandSearch.fill("word wrap");
    await expect(page.getByRole("button", { name: "Word wrap" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Word wrap" }).locator("mark")).toHaveText(
      "Word wrap",
    );
    await commandSearch.fill("");
    await page.getByRole("button", { name: "Random theme" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect
      .poll(() =>
        page.locator(".cm-content").evaluate((element) => document.activeElement === element),
      )
      .toBe(true);
    await expect(page.locator("main")).not.toHaveClass(/theme-paper/);

    await page.locator(".cm-content").focus();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("/* cursor anchor */");
    await page.keyboard.press("ArrowLeft");
    const textBeforeWordWrapChange = await readEditorText(page);
    await page.keyboard.press("ControlOrMeta+K");
    await expect(page.getByRole("button", { name: "Word wrap" })).toBeVisible();
    await page.getByRole("button", { name: "Word wrap" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect
      .poll(() =>
        page.locator(".cm-content").evaluate((element) => document.activeElement === element),
      )
      .toBe(true);
    const cursorMarker = "x";
    await page.keyboard.type(cursorMarker);
    await expect
      .poll(() => readEditorText(page))
      .toBe(
        `${textBeforeWordWrapChange.slice(0, -1)}${cursorMarker}${textBeforeWordWrapChange.slice(-1)}`,
      );

    await page.locator(".cm-content").focus();
    await page.keyboard.press("ControlOrMeta+K");
    await page.getByRole("button", { name: "Choose theme" }).click();
    await expect(page.getByRole("button", { name: "Back" })).toBeVisible();
    await page.getByRole("button", { name: "Dracula" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect
      .poll(() =>
        page.locator(".cm-content").evaluate((element) => document.activeElement === element),
      )
      .toBe(true);
    await expect(page.locator("main")).toHaveClass(/theme-dracula/);
  });

  test("returns focus to the editor when the command palette is dismissed", async ({ page }) => {
    await page.goto(`/room/e2e-command-palette-focus-${Date.now()}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
    await page.locator(".cm-content").focus();
    await page.keyboard.press("ControlOrMeta+K");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.locator(".glass-overlay").click({ position: { x: 12, y: 12 } });
    await expect(dialog).toBeHidden();
    await expect
      .poll(() =>
        page.locator(".cm-content").evaluate((element) => document.activeElement === element),
      )
      .toBe(true);
    await expect
      .poll(() =>
        page.locator(".cm-editor").evaluate((element) => element.classList.contains("cm-focused")),
      )
      .toBe(true);
  });

  test("uses the active workspace theme", async ({ page }) => {
    await page.goto(`/room/e2e-command-palette-theme-${Date.now()}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Open shared settings" }).click();
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
    await page.getByRole("button", { name: "Open shared settings" }).click();
    await page.getByRole("button", { name: "Close settings" }).click();
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.className))
      .toBe("cm-content");
  });

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
    await page.getByRole("button", { name: "src/App.tsx" }).click();
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
    await page.getByRole("button", { name: "src/App.tsx" }).click();
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

  test("keeps the preview running after closing the last file tab", async ({ page }) => {
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
  });

  test("keeps the project preview stable when switching editor files", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`/room/e2e-preview-file-switch-${Date.now()}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
    const preview = page.locator('iframe[title^="Preview of "]');
    await expect(preview).toHaveAttribute("src", /^https?:\/\//, { timeout: 90_000 });
    const previewUrl = await preview.getAttribute("src");

    await page.getByRole("button", { name: "index.html", exact: true }).click();
    await expect(preview).toHaveAttribute("src", previewUrl ?? "");
    await expect(page.getByText("Waiting for preview…")).toBeHidden();
  });

  test("keeps the CodeMirror search panel aligned with the editor theme", async ({ page }) => {
    await page.goto("/room/e2e-search-theme", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });

    await page.locator(".cm-content").press("ControlOrMeta+f");
    const searchPanel = page.locator(".cm-panel.cm-search");
    await expect(searchPanel).toBeVisible();

    const styles = await searchPanel.evaluate((panel) => {
      const editor = panel.closest(".cm-editor");
      const input = panel.querySelector<HTMLInputElement>(".cm-textfield");
      const button = panel.querySelector<HTMLButtonElement>('button[name="next"]');
      const label = panel.querySelector<HTMLLabelElement>("label");
      const checkbox = label?.querySelector<HTMLInputElement>('input[type="checkbox"]');
      if (!editor || !input || !button || !label || !checkbox) {
        throw new Error("Search panel did not mount its editor controls");
      }
      const accentProbe = document.createElement("span");
      accentProbe.style.color = "var(--accent-deep)";
      panel.append(accentProbe);
      const accentDeepColor = getComputedStyle(accentProbe).color;
      accentProbe.remove();
      const labelRect = label.getBoundingClientRect();
      const checkboxRect = checkbox.getBoundingClientRect();
      return {
        panelColor: getComputedStyle(panel).color,
        editorColor: getComputedStyle(editor).color,
        inputColor: getComputedStyle(input).color,
        inputBackground: getComputedStyle(input).backgroundColor,
        buttonColor: getComputedStyle(button).color,
        accentDeepColor,
        labelCenter: labelRect.top + labelRect.height / 2,
        checkboxCenter: checkboxRect.top + checkboxRect.height / 2,
      };
    });

    expect(styles.panelColor).toBe(styles.editorColor);
    expect(styles.inputColor).toBe(styles.editorColor);
    expect(styles.inputBackground).not.toBe("rgb(255, 255, 255)");
    expect(styles.buttonColor).toBe(styles.accentDeepColor);
    expect(Math.abs(styles.labelCenter - styles.checkboxCenter)).toBeLessThan(1);
  });

  test("keeps long editor content inside the editor scroller", async ({ page }) => {
    await page.goto(`/room/e2e-editor-scroll-${Date.now()}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });

    await page.locator(".cm-content").click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.insertText(
      Array.from({ length: 500 }, (_, index) => `const line${index} = ${index};`).join("\n"),
    );

    const dimensions = await page.evaluate(() => {
      const editor = document.querySelector<HTMLElement>(".cm-editor");
      const scroller = document.querySelector<HTMLElement>(".cm-scroller");
      if (!editor || !scroller) throw new Error("CodeMirror scrolling elements did not mount");
      return {
        documentScrollHeight: document.documentElement.scrollHeight,
        viewportHeight: window.innerHeight,
        editorHeight: editor.clientHeight,
        scrollerHeight: scroller.clientHeight,
        scrollerScrollHeight: scroller.scrollHeight,
      };
    });

    expect(dimensions.documentScrollHeight).toBe(dimensions.viewportHeight);
    expect(dimensions.scrollerScrollHeight).toBeGreaterThan(dimensions.scrollerHeight);
    expect(dimensions.editorHeight).toBeLessThan(dimensions.scrollerScrollHeight);
  });

  test("shows relative line numbers when enabled in editor settings", async ({ page }) => {
    await page.goto(`/room/e2e-relative-line-numbers-${Date.now()}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });

    const editor = page.locator(".cm-content");
    await editor.click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");

    await page.getByRole("button", { name: "Open shared settings" }).click();
    await page.getByRole("button", { name: "Editor", exact: true }).click();
    const relativeLineNumbers = page.getByRole("switch", { name: "Relative line numbers" });
    await expect(relativeLineNumbers).toBeVisible();
    if ((await relativeLineNumbers.getAttribute("aria-checked")) !== "true") {
      await relativeLineNumbers.click();
    }
    await page.getByRole("button", { name: "Close settings" }).click();

    const lineNumbers = page.locator(".cm-lineNumbers .cm-gutterElement");
    const readVisibleLineNumbers = () =>
      lineNumbers.evaluateAll((elements) =>
        elements
          .filter((element) => (element as HTMLElement).style.height !== "0px")
          .map((element) => element.textContent ?? "")
          .slice(0, 8),
      );

    await expect.poll(readVisibleLineNumbers).toEqual(["2", "1", "3", "1", "2", "3", "4", "5"]);

    await page.getByRole("button", { name: "Open shared settings" }).click();
    await page.getByRole("button", { name: "Editor", exact: true }).click();
    const relativeLineNumbersAfterEnable = page.getByRole("switch", {
      name: "Relative line numbers",
    });
    await expect(relativeLineNumbersAfterEnable).toHaveAttribute("aria-checked", "true");
    await relativeLineNumbersAfterEnable.click();
    await page.getByRole("button", { name: "Close settings" }).click();
    await expect.poll(readVisibleLineNumbers).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);
  });

  test("applies the configured Vim normal cursor style", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("tsugite.vim-mode", "true"));
    await page.goto(`/room/e2e-cursor-style-${Date.now()}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Open shared settings" }).click();
    await page.getByRole("button", { name: "Editor", exact: true }).click();
    await page.getByLabel("Normal mode cursor").selectOption("block");
    await page.getByRole("button", { name: "Close settings" }).click();
    await expect(page.locator(".cm-editor")).toHaveAttribute("data-normal-cursor-style", "block");
    await expect(page.locator("[data-vim-mode='normal']")).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator(".cm-vimCursorLayer .cm-fat-cursor")
          .evaluate((e) => getComputedStyle(e).backgroundColor),
      )
      .toBe("rgb(0, 122, 255)");
  });

  test("uses the workspace accent for the insert cursor", async ({ page }) => {
    await page.goto(`/room/e2e-insert-cursor-${Date.now()}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
    await page.locator(".cm-content").focus();
    await page.keyboard.press("i");
    await expect
      .poll(() => page.locator(".cm-cursor").evaluate((e) => getComputedStyle(e).borderLeftColor))
      .toBe("rgb(0, 122, 255)");
  });

  test("keeps the line-number gutter opaque while scrolling long lines", async ({ page }) => {
    await page.goto("/room/e2e-gutter-background", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });

    const content = page.locator(".cm-content");
    await content.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.insertText(`const longLine = "${"x".repeat(420)}";`);

    const styles = await page.locator(".cm-editor").evaluate((editor) => {
      const scroller = editor.querySelector<HTMLElement>(".cm-scroller");
      const gutters = editor.querySelector<HTMLElement>(".cm-gutters");
      if (!scroller || !gutters) {
        throw new Error("CodeMirror scrolling elements did not mount");
      }

      scroller.scrollLeft = Math.min(300, scroller.scrollWidth - scroller.clientWidth);
      scroller.dispatchEvent(new Event("scroll", { bubbles: true }));

      const scrollerRect = scroller.getBoundingClientRect();
      const gutterRect = gutters.getBoundingClientRect();
      return {
        scrollWidth: scroller.scrollWidth,
        clientWidth: scroller.clientWidth,
        gutterBackground: getComputedStyle(gutters).backgroundColor,
        scrollerLeft: scrollerRect.left,
        gutterLeft: gutterRect.left,
      };
    });

    expect(styles.scrollWidth).toBeGreaterThan(styles.clientWidth);
    expect(styles.gutterBackground).not.toMatch(/transparent|rgba\(0, 0, 0, 0\)/);
    expect(Math.abs(styles.gutterLeft - styles.scrollerLeft)).toBeLessThan(1);
  });

  test("renders a collaborator cursor, name, and selection", async ({ browser }) => {
    const firstContext = await browser.newContext();
    const secondContext = await browser.newContext();
    await firstContext.addInitScript(
      (identity) => {
        window.localStorage.setItem("iris.identity.v1", JSON.stringify(identity));
      },
      { userId: "e2e-first", displayName: "Maya", color: "#d88961" },
    );
    await secondContext.addInitScript(
      (identity) => {
        window.localStorage.setItem("iris.identity.v1", JSON.stringify(identity));
      },
      { userId: "e2e-second", displayName: "Jun", color: "#7389b7" },
    );

    const firstPage = await firstContext.newPage();
    const secondPage = await secondContext.newPage();
    await Promise.all([
      firstPage.goto("/room/e2e-presence", { waitUntil: "domcontentloaded" }),
      secondPage.goto("/room/e2e-presence", { waitUntil: "domcontentloaded" }),
    ]);
    await expect(firstPage.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
    await expect(secondPage.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });

    await secondPage.locator(".cm-content").click();
    await secondPage.keyboard.press("ControlOrMeta+A");

    await expect(firstPage.locator(".cm-remote-cursor-label")).toHaveText("Jun", {
      timeout: 15_000,
    });
    await expect(
      firstPage.locator(".cm-remote-selection[data-user-id='e2e-second']").first(),
    ).toBeVisible();

    await firstContext.close();
    await secondContext.close();
  });

  test("does not publish a cursor when selecting a file before focusing its editor", async ({
    browser,
  }) => {
    const firstContext = await browser.newContext();
    const secondContext = await browser.newContext();
    await firstContext.addInitScript(
      (identity) => {
        window.localStorage.setItem("iris.identity.v1", JSON.stringify(identity));
      },
      { userId: "e2e-file-switch-first", displayName: "Maya", color: "#d88961" },
    );
    await secondContext.addInitScript(
      (identity) => {
        window.localStorage.setItem("iris.identity.v1", JSON.stringify(identity));
      },
      { userId: "e2e-file-switch-second", displayName: "Jun", color: "#7389b7" },
    );

    const firstPage = await firstContext.newPage();
    const secondPage = await secondContext.newPage();
    await Promise.all([
      firstPage.goto("/room/e2e-presence-file-switch", { waitUntil: "domcontentloaded" }),
      secondPage.goto("/room/e2e-presence-file-switch", { waitUntil: "domcontentloaded" }),
    ]);
    await expect(firstPage.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
    await expect(secondPage.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });

    await firstPage.getByRole("button", { name: "index.html", exact: true }).click();
    await secondPage.getByRole("button", { name: "index.html", exact: true }).click();

    await expect(firstPage.locator("[data-collaborator-badge='index.html']")).toHaveText("+1", {
      timeout: 15_000,
    });
    await expect(
      firstPage.getByRole("tab", { name: "index.html, 1 collaborators in this file" }),
    ).toBeVisible();
    await expect(secondPage.locator("[data-collaborator-badge='index.html']")).toHaveText("+1", {
      timeout: 15_000,
    });

    await secondPage.getByRole("button", { name: "main.tsx", exact: true }).click();
    await expect(firstPage.locator("[data-collaborator-badge='index.html']")).toHaveCount(0, {
      timeout: 15_000,
    });
    await expect(secondPage.locator("[data-collaborator-badge='index.html']")).toHaveText("+1", {
      timeout: 15_000,
    });

    await expect(secondPage.locator(".cm-remote-cursor-label")).toHaveCount(0, {
      timeout: 2_000,
    });

    await firstContext.close();
    await secondContext.close();
  });

  test("undoes repeated local edits without corrupting the file", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/room/e2e-undo", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });

    const editor = page.locator(".cm-content");
    const readText = () =>
      editor.evaluate((element) =>
        Array.from(element.querySelectorAll(".cm-line"))
          .map((line) => line.textContent ?? "")
          .join("\n"),
      );
    const initial = await readText();

    await editor.click();
    await expect(page.locator(".cm-editor")).toHaveClass(/cm-focused/, { timeout: 15_000 });
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("\n// undo-first");
    await page.keyboard.press("ControlOrMeta+z");
    await page.waitForTimeout(250);
    await expect.poll(readText, { timeout: 15_000 }).toBe(initial);

    await page.keyboard.type("\n// undo-second");
    await page.keyboard.press("ControlOrMeta+z");
    await page.waitForTimeout(250);
    await expect.poll(readText, { timeout: 15_000 }).toBe(initial);
  });

  test("undoes only the local edit after concurrent changes", async ({ browser }, testInfo) => {
    test.setTimeout(90_000);
    const firstContext = await browser.newContext();
    const secondContext = await browser.newContext();
    await firstContext.addInitScript(
      (identity) => {
        window.localStorage.setItem("iris.identity.v1", JSON.stringify(identity));
      },
      { userId: "e2e-undo-first", displayName: "Maya", color: "#d88961" },
    );
    await secondContext.addInitScript(
      (identity) => {
        window.localStorage.setItem("iris.identity.v1", JSON.stringify(identity));
      },
      { userId: "e2e-undo-second", displayName: "Jun", color: "#7389b7" },
    );

    const firstPage = await firstContext.newPage();
    const secondPage = await secondContext.newPage();
    const roomPath =
      "/room/e2e-undo-concurrent-" + testInfo.workerIndex + "-" + testInfo.repeatEachIndex;
    await Promise.all([
      firstPage.goto(roomPath, { waitUntil: "domcontentloaded" }),
      secondPage.goto(roomPath, { waitUntil: "domcontentloaded" }),
    ]);
    await expect(firstPage.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
    await expect(secondPage.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });

    const initial = await readEditorText(firstPage);

    await firstPage.locator(".cm-content").click();
    await firstPage.keyboard.press("ControlOrMeta+End");
    await firstPage.keyboard.type("\n// undo-maya");
    await expect
      .poll(() => readEditorText(secondPage), { timeout: 45_000 })
      .toContain("// undo-maya");

    await secondPage.locator(".cm-content").click();
    await secondPage.keyboard.press("ControlOrMeta+Home");
    await secondPage.keyboard.type("// undo-jun\n");
    await expect
      .poll(() => readEditorText(firstPage), { timeout: 45_000 })
      .toContain("// undo-jun");

    await firstPage.locator(".cm-content").click();
    await expect(firstPage.locator(".cm-editor")).toHaveClass(/cm-focused/, {
      timeout: 15_000,
    });
    await firstPage.keyboard.press("ControlOrMeta+z");
    const expected = "// undo-jun\n" + initial;
    await expect.poll(() => readEditorText(firstPage), { timeout: 45_000 }).toBe(expected);
    await expect.poll(() => readEditorText(secondPage), { timeout: 45_000 }).toBe(expected);

    await firstContext.close();
    await secondContext.close();
  });

  test("shows syntax errors in preview instead of a blank frame", async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.goto(
      "/room/e2e-preview-syntax-" + testInfo.workerIndex + "-" + testInfo.repeatEachIndex,
      { waitUntil: "domcontentloaded" },
    );
    await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('iframe[title^="Preview of "]')).toHaveAttribute(
      "src",
      /^https?:\/\//,
      { timeout: 90_000 },
    );
    const preview = page.locator('iframe[title^="Preview of "]');
    const previewUrl = await preview.getAttribute("src");

    const editor = page.locator(".cm-content");
    await editor.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("export const broken = ;");

    await expect(page.getByRole("alert")).toContainText(/Unexpected token|PARSE_ERROR/, {
      timeout: 60_000,
    });

    await editor.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("export const fixed = 1;");
    await expect(page.getByRole("alert")).toHaveCount(0, { timeout: 60_000 });
    await expect(preview).toHaveAttribute("src", previewUrl ?? "");
  });

  test("sends the existing cursor to a collaborator who joins later", async ({ browser }) => {
    const firstContext = await browser.newContext();
    const secondContext = await browser.newContext();
    await firstContext.addInitScript(
      (identity) => {
        window.localStorage.setItem("iris.identity.v1", JSON.stringify(identity));
      },
      { userId: "e2e-existing-cursor", displayName: "Maya", color: "#d88961" },
    );
    await secondContext.addInitScript(
      (identity) => {
        window.localStorage.setItem("iris.identity.v1", JSON.stringify(identity));
      },
      { userId: "e2e-late-joiner", displayName: "Jun", color: "#7389b7" },
    );

    const firstPage = await firstContext.newPage();
    await firstPage.goto("/room/e2e-presence-late", { waitUntil: "domcontentloaded" });
    await expect(firstPage.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
    await firstPage.locator(".cm-content").click({ position: { x: 28, y: 12 } });

    const secondPage = await secondContext.newPage();
    await secondPage.goto("/room/e2e-presence-late", { waitUntil: "domcontentloaded" });
    await expect(secondPage.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });

    await expect(
      secondPage.locator(".cm-remote-cursor-label").filter({ hasText: "Maya" }),
    ).toBeVisible({
      timeout: 15_000,
    });

    await firstContext.close();
    await secondContext.close();
  });

  test("shows an existing focused cursor to a late joiner without requiring a click", async ({
    browser,
  }) => {
    const firstContext = await browser.newContext();
    const secondContext = await browser.newContext();
    await firstContext.addInitScript(
      (identity) => {
        window.localStorage.setItem("iris.identity.v1", JSON.stringify(identity));
      },
      { userId: "e2e-initial-observer", displayName: "Maya", color: "#d88961" },
    );
    await secondContext.addInitScript(
      (identity) => {
        window.localStorage.setItem("iris.identity.v1", JSON.stringify(identity));
      },
      { userId: "e2e-initial-joiner", displayName: "Jun", color: "#7389b7" },
    );

    const secondPage = await secondContext.newPage();
    await secondPage.goto("/room/e2e-presence-initial", { waitUntil: "domcontentloaded" });
    await expect(secondPage.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
    await secondPage.locator(".cm-content").click({ position: { x: 28, y: 12 } });

    const firstPage = await firstContext.newPage();
    await firstPage.goto("/room/e2e-presence-initial", { waitUntil: "domcontentloaded" });
    await expect(firstPage.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });

    await expect(
      firstPage.locator(".cm-remote-cursor-label").filter({ hasText: "Jun" }),
    ).toBeVisible({
      timeout: 15_000,
    });

    await firstContext.close();
    await secondContext.close();
  });

  test("keeps remaining collaborator cursors when one member leaves", async ({ browser }) => {
    test.setTimeout(90_000);
    const identities = [
      { userId: "e2e-owner", displayName: "Maya", color: "#d88961" },
      { userId: "e2e-jun", displayName: "Jun", color: "#7389b7" },
      { userId: "e2e-sora", displayName: "Sora", color: "#5d9f8c" },
    ];
    const contexts = await Promise.all(
      identities.map(async (identity) => {
        const context = await browser.newContext();
        await context.addInitScript((value) => {
          window.localStorage.setItem("iris.identity.v1", JSON.stringify(value));
        }, identity);
        return context;
      }),
    );
    const pages = await Promise.all(contexts.map((context) => context.newPage()));

    await Promise.all(
      pages.map((page) => page.goto("/room/e2e-presence-leave", { waitUntil: "domcontentloaded" })),
    );
    await Promise.all(
      pages.map((page) => expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 })),
    );

    await pages[1].locator(".cm-content").click();
    await pages[1].keyboard.press("ControlOrMeta+A");
    await pages[2].locator(".cm-content").click();
    await pages[2].keyboard.press("ControlOrMeta+A");

    await Promise.all([
      expect(pages[0].locator(".cm-remote-cursor-label").filter({ hasText: "Jun" })).toBeVisible({
        timeout: 30_000,
      }),
      expect(pages[0].locator(".cm-remote-cursor-label").filter({ hasText: "Sora" })).toBeVisible({
        timeout: 30_000,
      }),
    ]);

    await contexts[2].close();

    await expect(
      pages[0].locator(".cm-remote-cursor-label").filter({ hasText: "Sora" }),
    ).toHaveCount(0);
    await expect(
      pages[0].locator(".cm-remote-cursor-label").filter({ hasText: "Jun" }),
    ).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      pages[0].locator(".cm-remote-selection[data-user-id='e2e-jun']").first(),
    ).toBeVisible();

    await contexts[0].close();
    await contexts[1].close();
  });

  test("keeps a collapsed cursor when a selected collaborator leaves", async ({ browser }) => {
    test.setTimeout(90_000);
    const identities = [
      { userId: "e2e-collapsed-observer", displayName: "Maya", color: "#d88961" },
      { userId: "e2e-collapsed-survivor", displayName: "Sora", color: "#5d9f8c" },
      { userId: "e2e-selected-leaver", displayName: "Jun", color: "#7389b7" },
    ];
    const contexts = await Promise.all(
      identities.map(async (identity) => {
        const context = await browser.newContext();
        await context.addInitScript((value) => {
          window.localStorage.setItem("iris.identity.v1", JSON.stringify(value));
        }, identity);
        return context;
      }),
    );
    const pages = await Promise.all(contexts.map((context) => context.newPage()));
    await Promise.all(
      pages.map((page) =>
        page.goto("/room/e2e-presence-collapsed", { waitUntil: "domcontentloaded" }),
      ),
    );
    await Promise.all(
      pages.map((page) => expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 })),
    );

    await pages[1].locator(".cm-content").click({ position: { x: 12, y: 12 } });
    await pages[2].locator(".cm-content").click();
    await pages[2].keyboard.press("ControlOrMeta+A");
    await Promise.all([
      expect(pages[0].locator(".cm-remote-cursor-label").filter({ hasText: "Sora" })).toBeVisible({
        timeout: 30_000,
      }),
      expect(pages[0].locator(".cm-remote-cursor-label").filter({ hasText: "Jun" })).toBeVisible({
        timeout: 30_000,
      }),
    ]);

    await contexts[2].close();
    await expect(
      pages[0].locator(".cm-remote-cursor-label").filter({ hasText: "Jun" }),
    ).toHaveCount(0);
    await expect(
      pages[0].locator(".cm-remote-cursor-label").filter({ hasText: "Sora" }),
    ).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      pages[0].locator(".cm-remote-cursor[data-user-id='e2e-collapsed-survivor']"),
    ).toBeVisible();

    await contexts[0].close();
    await contexts[1].close();
  });
});
