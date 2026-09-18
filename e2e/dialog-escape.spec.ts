import { expect, test } from "playwright/test";

for (const vimMode of [false, true]) {
  for (const [shortcut, placeholder] of [
    ["ControlOrMeta+P", "Search files..."],
    ["ControlOrMeta+K", "Search commands..."],
  ]) {
    for (const query of ["", "app"]) {
      test(`one Escape dismisses ${placeholder} with vim=${vimMode} and query=${query || "empty"}`, async ({
        page,
      }) => {
        await page.addInitScript((enabled) => {
          localStorage.setItem("iris.language", "en");
          localStorage.setItem("tsugite.vim-mode", String(enabled));
        }, vimMode);
        await page.goto(`/room/e2e-escape-${crypto.randomUUID()}`);
        const editor = page.locator(".cm-content");
        await expect(editor).toBeFocused();
        await page.keyboard.press(shortcut);
        const input = page.getByPlaceholder(placeholder);
        await expect(input).toBeFocused();
        if (query) await page.keyboard.type(query);
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toBeHidden();
        await expect(editor).toBeFocused();
      });
    }
  }
}

for (const shortcut of ["Control+P", "ControlOrMeta+Shift+P"]) {
  test(`one immediate Escape dismisses custom shortcut ${shortcut}`, async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("iris.language", "en");
      localStorage.setItem("tsugite.vim-mode", "true");
      localStorage.setItem(
        "tsugite.keymap",
        JSON.stringify([
          { action: "file.search", key: "Ctrl-P" },
          { action: "command.palette", key: "Mod-Shift-P" },
        ]),
      );
    });
    await page.goto(`/room/e2e-fast-escape-${crypto.randomUUID()}`);
    const editor = page.locator(".cm-content");
    await expect(editor).toBeFocused();
    const openings = await page.evaluateHandle(() => {
      const state = { count: 0 };
      document.addEventListener("focusin", (event) => {
        if (event.target instanceof HTMLInputElement && event.target.closest('[role="dialog"]')) {
          state.count++;
        }
      });
      return state;
    });
    for (let attempt = 0; attempt < 10; attempt++) {
      await page.keyboard.press(shortcut);
      await page.keyboard.press("Escape");
      expect(await openings.evaluate((state) => state.count)).toBe(attempt + 1);
      await expect(page.getByRole("dialog")).toBeHidden();
      await expect(editor).toBeFocused();
    }
    await openings.dispose();
  });
}

for (const [shortcut, placeholder] of [
  ["ControlOrMeta+P", "Search files..."],
  ["ControlOrMeta+K", "Search commands..."],
]) {
  test(`one Escape dismisses ${placeholder} opened above the editor context menu`, async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem("iris.language", "en"));
    await page.goto(`/room/e2e-menu-escape-${crypto.randomUUID()}`);
    const editor = page.locator(".cm-content");
    await expect(editor).toBeFocused();
    for (let attempt = 0; attempt < 10; attempt++) {
      await editor.click({ button: "right" });
      await expect(page.getByRole("menu")).toBeVisible();
      await page.keyboard.press(shortcut);
      await expect(page.getByPlaceholder(placeholder)).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toBeHidden();
      if (await page.getByRole("menu").isVisible()) await page.keyboard.press("Escape");
      await expect(editor).toBeFocused();
    }
  });
}

test("Escape returns from a command submenu before closing the palette", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("iris.language", "en"));
  await page.goto(`/room/e2e-submenu-escape-${crypto.randomUUID()}`);
  const editor = page.locator(".cm-content");
  await expect(editor).toBeFocused();
  await page.keyboard.press("ControlOrMeta+K");
  await page.getByPlaceholder("Search commands...").fill("language");
  await page.keyboard.press("Enter");
  await expect(page.getByPlaceholder("Language: Search commands...")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByPlaceholder("Search commands...")).toBeFocused();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(editor).toBeFocused();
});
