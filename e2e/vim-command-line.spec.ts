import { expect, test } from "playwright/test";

for (const width of [1280, 390]) {
  test(`keeps Vim commands in one themed statusline at ${width}px`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.setViewportSize({ width, height: 800 });
    await page.addInitScript(() => {
      if (window !== window.top) return;
      localStorage.setItem("iris.language", "en");
      localStorage.setItem("tsugite.vim-mode", "true");
    });
    await page.goto(`/room/e2e-vim-command-line-${Date.now()}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page).toHaveTitle(/Tsugite/);

    const editor = page.locator(".cm-editor");
    const content = page.locator(".cm-content");
    const statusline = editor.locator(".cm-vim-panel");
    await expect(editor).toBeVisible({ timeout: 15_000 });
    await content.focus();
    await expect(statusline).toBeVisible();
    await expect(statusline).toContainText("--NORMAL--");

    const editorBackground = await editor.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    await expect(statusline).toHaveCSS("background-color", editorBackground);

    await page.keyboard.type("ggVGc");
    await page.keyboard.insertText("alpha\nbeta");
    await page.keyboard.press("Escape");
    await page.keyboard.type("gg0");
    const statusBounds = (await statusline.boundingBox())!;
    const contentBounds = (await editor.locator(".cm-scroller").boundingBox())!;
    await page.keyboard.press(":");

    const commandInput = statusline.locator("input");
    await expect(commandInput).toBeFocused();
    await expect(editor.locator(".cm-vim-panel")).toHaveCount(1);
    expect((await statusline.boundingBox())!.height).toBe(statusBounds.height);
    expect((await editor.locator(".cm-scroller").boundingBox())!.height).toBe(contentBounds.height);
    const inputBounds = (await commandInput.boundingBox())!;
    expect(inputBounds.y).toBeGreaterThanOrEqual(statusBounds.y);
    expect(inputBounds.y + inputBounds.height).toBeLessThanOrEqual(
      statusBounds.y + statusBounds.height,
    );
    expect(inputBounds.x + inputBounds.width).toBeLessThanOrEqual(
      statusBounds.x + statusBounds.width,
    );

    await commandInput.fill("s/alpha/omega/");
    await commandInput.press("Enter");
    await expect(statusline.locator("input")).toHaveCount(0);
    await expect(content).toBeFocused();
    await expect(content.locator(".cm-line")).toHaveText(["omega", "beta"]);

    await page.keyboard.press(":");
    await expect(statusline.locator("input")).toBeFocused();
    await statusline.locator("input").fill("s/omega/cancelled/");
    await page.keyboard.press("Escape");
    await expect(statusline.locator("input")).toHaveCount(0);
    await expect(content).toBeFocused();
    await expect(statusline).toContainText("--NORMAL--");
    await expect(content.locator(".cm-line")).toHaveText(["omega", "beta"]);

    for (const theme of [
      { name: "Paper Light", id: "paper" },
      { name: "Dracula", id: "dracula" },
    ]) {
      await page.keyboard.press("ControlOrMeta+K");
      await page.getByRole("button", { name: "Choose theme", exact: true }).click();
      await page.getByRole("button", { name: theme.name, exact: true }).click();
      await expect(page.locator("main")).toHaveClass(new RegExp(`theme-${theme.id}`));
      await expect(content).toBeFocused();
      await page.keyboard.press(":");
      await expect(commandInput).toBeFocused();
      await commandInput.fill("s/omega/themed/");
      await expect(statusline).toHaveCSS(
        "background-color",
        await editor.evaluate((element) => getComputedStyle(element).backgroundColor),
      );
      await expect(commandInput).toHaveCSS(
        "color",
        await editor.evaluate((element) => getComputedStyle(element).color),
      );
      await expect(commandInput).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      const divider = await editor.evaluate((element) => {
        const probe = document.createElement("span");
        probe.style.color = "var(--divider)";
        element.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      });
      await expect(editor.locator(".cm-panels-bottom")).toHaveCSS("border-top-color", divider);
      await expect(statusline).toHaveCSS("border-top-width", "0px");
      await page.screenshot({ path: `/tmp/tsugite-vim-cmdline-${theme.id}-${width}.png` });
      await page.keyboard.press("Escape");
    }
    await expect(page.locator("vite-error-overlay")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test("shows the Vim mode control only in Vim mode and updates its label", async ({ page }) => {
  await page.addInitScript(() => {
    if (window !== window.top) return;
    localStorage.setItem("iris.language", "en");
    localStorage.setItem("tsugite.vim-mode", "false");
  });
  await page.goto(`/room/e2e-vim-status-toggle-${crypto.randomUUID()}`, {
    waitUntil: "domcontentloaded",
  });
  const content = page.locator(".cm-content");
  const statusline = page.locator(".cm-vim-panel");
  await expect(content).toBeFocused({ timeout: 15_000 });
  await expect(statusline).toHaveCount(0);
  await expect(page.locator("[data-vim-mode]")).toHaveCount(0);

  await page.keyboard.press("ControlOrMeta+K");
  await page.getByRole("button", { name: "Vim mode", exact: true }).click();
  await expect(statusline).toHaveCount(1);
  await expect(statusline.locator("[data-status-mode]")).toHaveText("--NORMAL--");
  await content.focus();
  await page.keyboard.press("i");
  await expect(statusline.locator("[data-status-mode]")).toHaveText("--INSERT--");
  await page.keyboard.press("Escape");
  await expect(statusline.locator("[data-status-mode]")).toHaveText("--NORMAL--");
  await page.keyboard.press("v");
  await expect(statusline.locator("[data-status-mode]")).toHaveText("--VISUAL--");
  await page.keyboard.press("Escape");
  await expect(statusline.locator("[data-status-mode]")).toHaveText("--NORMAL--");

  await page.keyboard.press("ControlOrMeta+K");
  await page.getByRole("button", { name: "Vim mode", exact: true }).click();
  await expect(statusline).toHaveCount(0);
  await expect(page.locator("[data-vim-mode]")).toHaveCount(0);
});

test("keeps file position details in non-Vim mode without a mode control", async ({ page }) => {
  await page.addInitScript(() => {
    if (window !== window.top) return;
    localStorage.setItem("iris.language", "en");
    localStorage.setItem("tsugite.vim-mode", "false");
  });
  await page.goto(`/room/e2e-editor-status-${crypto.randomUUID()}`, {
    waitUntil: "domcontentloaded",
  });

  const content = page.locator(".cm-content");
  const statusline = page.locator("[data-editor-status]");
  await expect(content).toBeFocused({ timeout: 15_000 });
  await expect(statusline).toBeVisible();
  await expect(statusline.locator("[data-status-path]")).toHaveText("src/App.tsx");
  await expect(statusline.locator("[data-status-position]")).toHaveText("1:1");
  await expect(statusline.locator("[data-status-progress]")).toHaveText("Top");
  await expect(statusline.locator("[data-status-mode]")).toHaveCount(0);

  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText("alpha\nsecond line");
  await expect(statusline.locator("[data-status-position]")).toHaveText("2:12");
  await expect(statusline.locator("[data-status-progress]")).toHaveText("Bot");
});

for (const vimMode of [true, false]) {
  test(`keeps a long path on one statusline with Vim ${vimMode ? "on" : "off"}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addInitScript((enabled) => {
      if (window !== window.top) return;
      localStorage.setItem("iris.language", "en");
      localStorage.setItem("tsugite.vim-mode", String(enabled));
    }, vimMode);
    await page.goto(`/room/e2e-long-status-path-${crypto.randomUUID()}`, {
      waitUntil: "domcontentloaded",
    });
    const statusline = vimMode
      ? page.locator(".cm-vim-panel")
      : page.locator("[data-editor-status]");
    await expect(statusline).toBeVisible({ timeout: 15_000 });
    const originalHeight = (await statusline.boundingBox())!.height;

    await page.getByRole("treeitem", { name: "App.tsx", exact: true }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
    const path = "src/feature notes/nested components/a very long workspace component.tsx";
    const pathInput = page.locator("#file-tree-path");
    await pathInput.fill(path);
    await pathInput.press("Enter");
    await expect(statusline.locator("[data-status-path]")).toHaveText(path);
    await page.setViewportSize({ width: 390, height: 800 });

    await expect.poll(async () => (await statusline.boundingBox())?.height).toBe(originalHeight);
    const statusPath = statusline.locator(".iris-editor-status-path");
    await expect(statusPath).toHaveAttribute("title", path);
    expect(await statusPath.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
      true,
    );
    await expect(statusline.locator("[data-status-position]")).toBeVisible();
    await page.screenshot({ path: `/tmp/tsugite-long-status-path-vim-${vimMode}.png` });
  });
}
