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

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("iris.language", "en"));
});

test("dismisses file search and command palette by clicking the backdrop", async ({ page }) => {
  await page.goto(`/room/e2e-dialog-backdrop-${Date.now()}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
  await page.locator(".cm-content").focus();

  await page.keyboard.press("ControlOrMeta+P");
  await expect(page.getByPlaceholder("Search files...")).toBeVisible();
  await page
    .locator("[data-dialog-overlay]")
    .last()
    .click({ position: { x: 4, y: 4 } });
  await expect(page.getByRole("dialog")).toBeHidden();

  await page.keyboard.press("ControlOrMeta+K");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .locator("[data-dialog-overlay]")
    .last()
    .click({ position: { x: 4, y: 4 } });
  await expect(page.getByRole("dialog")).toBeHidden();
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
  await expect.poll(() => page.evaluate(() => localStorage.getItem("iris.language"))).toBe("zh-CN");
});

test("previews themes on highlight and restores the committed theme on escape", async ({
  page,
}) => {
  await page.goto(`/room/e2e-command-palette-theme-preview-${Date.now()}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-status="live"]').first()).toBeVisible({ timeout: 15_000 });
  const main = page.locator("main");
  await page.locator(".cm-content").focus();
  await page.keyboard.press("ControlOrMeta+K");
  await page.waitForTimeout(500);
  const committedThemeClass = await main.getAttribute("class");
  const committedTheme = committedThemeClass?.match(/theme-[\w-]+/)?.[0];
  expect(committedTheme).toBeTruthy();
  await page.getByRole("button", { name: "Choose theme" }).click();
  const committedThemeOption = page
    .getByRole("dialog")
    .getByRole("button")
    .filter({ has: page.locator("svg.lucide-check") });
  await expect(committedThemeOption).toHaveCount(1);
  const committedThemeLabel = await committedThemeOption.textContent();
  await page.getByRole("button", { name: "Dracula" }).hover();
  await expect(committedThemeOption).toHaveText(committedThemeLabel ?? "");
  await expect(main).toHaveClass(/theme-dracula/);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Choose theme" })).toBeVisible();
  await expect(main).toHaveClass(new RegExp(committedTheme as string));

  await page.getByRole("button", { name: "Choose theme" }).click();
  await page.getByRole("button", { name: "Dracula" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(main).toHaveClass(/theme-dracula/);
});

test("uses opaque dialog surfaces for transient search and command dialogs", async ({ page }) => {
  await page.goto(`/room/e2e-dialog-surfaces-${Date.now()}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
  await page.locator(".cm-content").focus();

  await page.keyboard.press("ControlOrMeta+P");
  const fileSearch = page.getByRole("dialog");
  await expect(fileSearch).toBeVisible();
  await expect(fileSearch).not.toHaveClass(/glass-dialog/);
  await expect(fileSearch).toHaveCSS("backdrop-filter", "none");
  await page.keyboard.press("Escape");

  await page.keyboard.press("ControlOrMeta+K");
  const commandPalette = page.getByRole("dialog");
  await expect(commandPalette).toBeVisible();
  await expect(commandPalette).not.toHaveClass(/glass-dialog/);
  await expect(commandPalette).toHaveCSS("backdrop-filter", "none");
  await expect(commandPalette).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await page.keyboard.press("Escape");

  await page.keyboard.press("ControlOrMeta+,");
  const settings = page.getByRole("dialog");
  await expect(settings).toBeVisible();
  await expect(settings).not.toHaveClass(/glass-dialog/);
  await expect(settings).toHaveCSS("backdrop-filter", "none");
});

test("opens the command palette and exposes extensible keymap actions", async ({ page }) => {
  await page.goto(`/room/e2e-command-palette-${Date.now()}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
  await page.locator(".cm-content").focus();
  await page.keyboard.press("ControlOrMeta+K");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open file" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open settings" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Use system clipboard" })).toBeVisible();
  const primaryModifier = await page.evaluate(() =>
    /Mac|iPhone|iPad|iPod/i.test(navigator.platform) ? "Cmd" : "Ctrl",
  );
  await expect(page.getByRole("button", { name: "Open file" })).toContainText(
    `${primaryModifier}-P`,
  );
  await expect(page.getByRole("button", { name: "Open settings" })).toContainText(
    `${primaryModifier}-,`,
  );
  await expect(page.getByRole("button", { name: "Open settings" })).toHaveClass(
    /text-\[color-mix\(in_srgb,var\(--muted\)_45%,transparent\)\]/,
  );
  await expect(
    page.getByRole("button", { name: "Open settings" }).locator("span").last(),
  ).toHaveClass(/text-\[color-mix\(in_srgb,var\(--muted\)_45%,transparent\)\]/);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "Keyboard" }).click();
  await expect(page.getByLabel("File search shortcut")).toHaveValue(`${primaryModifier}-P`);
  await expect(page.getByLabel("Open settings shortcut")).toHaveValue(`${primaryModifier}-,`);
  await expect(page.getByLabel("Command palette shortcut")).toHaveValue(`${primaryModifier}-K`);
  await page.getByLabel("File search shortcut").press("ControlOrMeta+Shift+P");
  await expect(page.getByLabel("File search shortcut")).toHaveValue(`${primaryModifier}-Shift-P`);
  await page.getByRole("button", { name: "Restore default shortcut" }).first().click();
  await expect(page.getByLabel("File search shortcut")).toHaveValue(`${primaryModifier}-P`);
  await page.getByLabel("File search shortcut").press("ControlOrMeta+K");
  await expect(page.getByRole("alert")).toContainText("Command palette shortcut");
  await expect(page.getByLabel("File search shortcut")).toHaveValue(`${primaryModifier}-P`);
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

test("navigates command palette actions with arrow keys", async ({ page }) => {
  await page.goto(`/room/e2e-command-palette-arrows-${Date.now()}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
  await page.locator(".cm-content").focus();
  await page.keyboard.press("ControlOrMeta+K");
  const commands = page.getByRole("dialog").locator("button");
  const firstCommand = commands.first();
  const secondCommand = commands.nth(1);
  await expect(firstCommand).toHaveClass(/accent/);

  await page.keyboard.press("ArrowDown");
  await expect(secondCommand).toHaveClass(/accent/);
  await expect(firstCommand).not.toHaveClass(/accent/);

  await page.keyboard.press("ArrowUp");
  await expect(firstCommand).toHaveClass(/accent/);
});

test("wraps command palette selection from the last item to the first", async ({ page }) => {
  await page.goto(`/room/e2e-command-palette-wrap-${Date.now()}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
  await page.locator(".cm-content").focus();
  await page.keyboard.press("ControlOrMeta+K");
  const commands = page.getByRole("dialog").locator("button");
  await expect(commands.first()).toBeVisible();
  await page.keyboard.press("ControlOrMeta+P");
  await page.keyboard.press("ControlOrMeta+N");
  await expect(commands.first()).toHaveClass(/accent/);
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
  await page.locator("[data-dialog-overlay]").click({ position: { x: 12, y: 12 } });
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
