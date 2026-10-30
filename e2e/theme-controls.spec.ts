import { expect, test, type Locator, type Page } from "playwright/test";

const themes = [
  { id: "paper", label: "Paper Light" },
  { id: "dracula", label: "Dracula" },
] as const;

async function themeColor(scope: Locator, token: string) {
  return scope.evaluate((element, name) => {
    const probe = document.createElement("span");
    probe.style.backgroundColor = `var(${name})`;
    element.append(probe);
    const result = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return result;
  }, token);
}

async function openThemedSettings(page: Page, theme: (typeof themes)[number]) {
  await page.addInitScript(() => {
    if (window === window.top) localStorage.setItem("iris.language", "en");
  });
  await page.goto(`/room/theme-controls-${crypto.randomUUID()}`);
  await expect(page.locator(".cm-editor")).toBeVisible();
  await page.locator(".cm-content").focus();
  await page.keyboard.press("ControlOrMeta+,");
  await page.getByRole("button", { name: theme.label, exact: true }).click();
  await expect(page.locator("main")).toHaveClass(new RegExp(`theme-${theme.id}`));
  return page.getByRole("dialog");
}

for (const theme of themes) {
  test(`settings controls and preview filter use ${theme.label} tokens`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const dialog = await openThemedSettings(page, theme);
    await dialog.getByRole("button", { name: "Editor", exact: true }).click();
    const accent = await themeColor(dialog, "--accent");
    await expect.soft(dialog.locator(".rt-SliderRange")).toHaveCSS("background-color", accent);

    const wordWrap = dialog.getByRole("switch", { name: "Word wrap", exact: true });
    await wordWrap.setChecked(true);
    await expect(wordWrap).toBeChecked();
    expect
      .soft(
        await wordWrap.evaluate((element) => getComputedStyle(element, "::before").backgroundImage),
      )
      .toContain(accent);

    const runtimeNavigation = dialog.getByRole("button", { name: "Runtime", exact: true });
    await runtimeNavigation.hover();
    await expect
      .soft(runtimeNavigation)
      .toHaveCSS("background-color", await themeColor(dialog, "--hover-surface"));
    await page.screenshot({ path: `/tmp/iris-theme-controls-${theme.id}-settings.png` });
    await dialog.getByRole("button", { name: "Close settings" }).click();

    await page.getByRole("combobox", { name: "Filter output" }).click();
    const popup = page.getByRole("listbox");
    const main = page.locator("main");
    await expect
      .soft(popup)
      .toHaveCSS("background-color", await themeColor(main, "--glass-popover"));
    await expect.soft(popup).toHaveCSS("color", await themeColor(main, "--ink"));
    const selected = page.getByRole("option", { name: "All", exact: true });
    await selected.hover();
    await expect(selected).toHaveAttribute("aria-selected", "true");
    await expect
      .soft(selected)
      .toHaveCSS("background-color", await themeColor(main, "--selection-surface"));
    await expect.soft(selected).toHaveCSS("color", await themeColor(main, "--accent-deep"));
    await page.screenshot({ path: `/tmp/iris-theme-controls-${theme.id}-filter.png` });
    await page.getByRole("option", { name: "Errors", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "Filter output" })).toHaveText("Errors");
    expect(errors).toEqual([]);
  });

  test(`mobile header hover uses ${theme.label} tokens`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const dialog = await openThemedSettings(page, theme);
    await dialog.getByRole("button", { name: "Close settings" }).click();
    const hoverSurface = await themeColor(page.locator("main"), "--hover-surface");
    for (const name of ["Open files panel", "Toggle preview panel"]) {
      const button = page.getByRole("button", { name, exact: true });
      await button.hover();
      await expect.soft(button).toHaveCSS("background-color", hoverSurface);
    }
    await page.screenshot({ path: `/tmp/iris-theme-controls-${theme.id}-mobile.png` });
  });
}
