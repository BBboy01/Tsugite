import { expect, test, type Locator, type Page } from "playwright/test";

async function themeColor(element: Locator, token: string, property = "color") {
  return element.evaluate(
    (parent, { token: variable, property: cssProperty }) => {
      const probe = document.createElement("span");
      probe.style.setProperty(cssProperty, `var(${variable})`);
      parent.append(probe);
      const value = getComputedStyle(probe).getPropertyValue(cssProperty);
      probe.remove();
      return value;
    },
    { token, property },
  );
}

async function openThemedRoom(page: Page, theme: string) {
  await page.addInitScript(() => {
    if (window !== window.top) return;
    localStorage.setItem("iris.language", "en");
    localStorage.setItem("tsugite.vim-mode", "false");
  });
  await page.goto(`/room/palette-theme-details-${crypto.randomUUID()}`);
  await expect(page.locator(".cm-content")).toBeFocused({ timeout: 15_000 });
  await page.keyboard.press("ControlOrMeta+K");
  await page.getByRole("button", { name: "Choose theme", exact: true }).click();
  await page.getByRole("button", { name: theme, exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

for (const theme of ["Paper Light", "Ink Dark", "Dracula"]) {
  test(`palette separator and back hover inherit ${theme}`, async ({ page }) => {
    await openThemedRoom(page, theme);
    await page.keyboard.press("ControlOrMeta+K");
    const dialog = page.getByRole("dialog");
    const input = dialog.locator("input");
    const search = input.locator("..");
    await expect(search).toHaveCSS(
      "border-bottom-color",
      await themeColor(dialog, "--divider", "border-bottom-color"),
    );
    await expect(input).toHaveCSS("color", await themeColor(dialog, "--ink"));
    const hoveredResult = dialog.locator(":scope > div").last().getByRole("button").nth(1);
    await hoveredResult.hover();
    await expect(hoveredResult).toHaveCSS(
      "background-color",
      await themeColor(dialog, "--selection-surface", "background-color"),
    );
    await expect(hoveredResult).toHaveCSS("color", await themeColor(dialog, "--ink"));
    const selected = dialog.getByRole("button", { name: "Choose theme", exact: true });
    await selected.focus();
    await expect(selected).toHaveCSS("color", await themeColor(dialog, "--ink"));
    await page.getByRole("button", { name: "Choose theme", exact: true }).click();
    const back = dialog.getByRole("button", { name: "Back", exact: true });
    await back.hover();
    await expect(back).toHaveCSS(
      "background-color",
      await themeColor(dialog, "--hover-surface", "background-color"),
    );
    await expect(back).toHaveCSS("color", await themeColor(dialog, "--ink-strong"));
    await back.click();
    await expect(input).toHaveAttribute("placeholder", "Search commands...");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test(`settings navigation hover inherits ${theme}`, async ({ page }) => {
    await openThemedRoom(page, theme);
    await page.getByRole("button", { name: "Open settings", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Editor", exact: true }).click();
    const inactiveSection = dialog.getByRole("button", { name: "Workspace", exact: true });
    await inactiveSection.hover();
    await expect(inactiveSection).toHaveCSS(
      "background-color",
      await themeColor(dialog, "--hover-surface", "background-color"),
    );
    await inactiveSection.click();
    await expect(dialog.getByRole("heading", { name: "Workspace", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
}

test("mobile panel controls use themed hover and keyboard focus surfaces", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await openThemedRoom(page, "Dracula");
  const main = page.locator("main");
  for (const name of ["Open files panel", "Toggle preview panel"]) {
    const control = page.getByRole("button", { name, exact: true });
    await control.hover();
    await expect(control).toHaveCSS(
      "background-color",
      await themeColor(main, "--hover-surface", "background-color"),
    );
    await page.mouse.move(0, 799);
    await page.keyboard.press("Tab");
    await control.focus();
    await expect(control).toHaveCSS(
      "background-color",
      await themeColor(main, "--hover-surface", "background-color"),
    );
  }
});
