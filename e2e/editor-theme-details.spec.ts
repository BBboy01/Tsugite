import { expect, test, type Locator, type Page } from "playwright/test";

async function chooseTheme(page: Page, name: string) {
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "Workspace", exact: true }).click();
  await page.getByRole("button", { name, exact: true }).click();
  await page.getByRole("button", { name: "Close settings" }).click();
  await expect(page.locator(".cm-content")).toBeFocused();
}

async function tokenValue(
  element: Locator,
  property: "color" | "background-color" | "border-top-color",
  value: string,
) {
  return element.evaluate(
    (parent, { property: cssProperty, value: cssValue }) => {
      const probe = document.createElement("span");
      probe.style.setProperty(cssProperty, cssValue);
      parent.append(probe);
      const result = getComputedStyle(probe).getPropertyValue(cssProperty);
      probe.remove();
      return result;
    },
    { property, value },
  );
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (window !== window.top) return;
    localStorage.setItem("iris.language", "en");
  });
});

for (const theme of ["Paper Light", "Dracula"]) {
  test(`themes a selected diagnostic in ${theme}`, async ({ page }) => {
    await page.goto(`/room/e2e-theme-diagnostic-${crypto.randomUUID()}`, {
      waitUntil: "domcontentloaded",
    });
    const content = page.locator(".cm-content");
    await expect(content).toBeFocused({ timeout: 15_000 });
    await chooseTheme(page, theme);
    const editor = page.locator(".cm-editor");
    const expected = await tokenValue(
      editor,
      "background-color",
      "var(--editor-selection-surface)",
    );
    const selected = await editor.evaluate((root) => {
      const panel = document.createElement("div");
      panel.className = "cm-panel cm-panel-lint";
      panel.innerHTML =
        '<ul tabindex="0"><li aria-selected="true"><u>example.ts:1</u> Error</li></ul>';
      root.append(panel);
      const item = panel.querySelector("[aria-selected]")!;
      const background = getComputedStyle(item).backgroundColor;
      panel.querySelector("ul")!.focus();
      return [background, getComputedStyle(item).backgroundColor];
    });
    expect(selected).toEqual([expected, expected]);
  });

  test(`uses theme tokens for search button states in ${theme}`, async ({ page }) => {
    await page.goto(`/room/e2e-theme-search-${crypto.randomUUID()}`, {
      waitUntil: "domcontentloaded",
    });
    const content = page.locator(".cm-content");
    await expect(content).toBeFocused({ timeout: 15_000 });
    await chooseTheme(page, theme);
    await content.press("ControlOrMeta+f");
    const panel = page.locator(".cm-search");
    const button = panel.locator('button[name="next"]');
    await expect(button).toHaveCSS("background-image", "none");
    await expect(button).toHaveCSS("color", await tokenValue(panel, "color", "var(--accent-deep)"));
    await button.hover();
    await expect(button).toHaveCSS("background-image", "none");
    await expect(button).toHaveCSS(
      "background-color",
      await tokenValue(
        panel,
        "background-color",
        "color-mix(in srgb, var(--accent) 12%, transparent)",
      ),
    );
    await page.mouse.down();
    await expect(button).toHaveCSS("background-image", "none");
    await expect(button).toHaveCSS(
      "background-color",
      await tokenValue(
        panel,
        "background-color",
        "color-mix(in srgb, var(--accent) 18%, transparent)",
      ),
    );
    await page.mouse.up();
  });

  test(`themes matches and folded content in ${theme}`, async ({ page }) => {
    await page.goto(`/room/e2e-theme-matches-${crypto.randomUUID()}`, {
      waitUntil: "domcontentloaded",
    });
    const content = page.locator(".cm-content");
    await expect(content).toBeFocused({ timeout: 15_000 });
    await chooseTheme(page, theme);
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.insertText("function example() {\n  const alpha = 1;\n  return alpha;\n}");
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Home");
    for (let index = 0; index < 8; index++) await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ControlOrMeta+d");
    const editor = page.locator(".cm-editor");
    const selectionBackground = await tokenValue(
      editor,
      "background-color",
      "var(--editor-selection-surface)",
    );
    await expect(content.locator(".cm-selectionMatch").first()).toBeVisible();
    await expect
      .soft(content.locator(".cm-selectionMatch").first())
      .toHaveCSS("background-color", selectionBackground);

    await content.press("ControlOrMeta+f");
    const search = page.locator('.cm-search input[name="search"]');
    await search.fill("alpha");
    await search.press("Enter");
    await expect(content.locator(".cm-searchMatch-selected")).toBeVisible();
    await expect
      .soft(content.locator(".cm-searchMatch:not(.cm-searchMatch-selected)").first())
      .toHaveCSS("background-color", selectionBackground);
    await expect
      .soft(content.locator(".cm-searchMatch-selected"))
      .toHaveCSS(
        "background-color",
        await tokenValue(
          editor,
          "background-color",
          "color-mix(in srgb, var(--accent) 24%, transparent)",
        ),
      );
    await search.press("Escape");
    await content.focus();
    await page.keyboard.press("ControlOrMeta+End");
    await expect(content.locator(".cm-matchingBracket").first()).toBeVisible();
    await expect
      .soft(content.locator(".cm-matchingBracket").first())
      .toHaveCSS("background-color", selectionBackground);
    await page.locator('.cm-foldGutter [title="Fold line"]').first().click();
    const folded = content.locator(".cm-foldPlaceholder");
    await expect(folded).toBeVisible();
    await expect
      .soft(folded)
      .toHaveCSS(
        "background-color",
        await tokenValue(
          editor,
          "background-color",
          "color-mix(in srgb, var(--accent) 8%, var(--editor-surface))",
        ),
      );
    await expect.soft(folded).toHaveCSS("color", await tokenValue(editor, "color", "var(--muted)"));
    await expect
      .soft(folded)
      .toHaveCSS(
        "border-top-color",
        await tokenValue(editor, "border-top-color", "var(--divider)"),
      );
  });

  test(`uses the accent for an unfocused Vim cursor in ${theme}`, async ({ page }) => {
    await page.addInitScript(() => {
      if (window === window.top) localStorage.setItem("tsugite.vim-mode", "true");
    });
    await page.goto(`/room/e2e-theme-vim-cursor-${crypto.randomUUID()}`, {
      waitUntil: "domcontentloaded",
    });
    const content = page.locator(".cm-content");
    await expect(content).toBeFocused({ timeout: 15_000 });
    await chooseTheme(page, theme);
    const editor = page.locator(".cm-editor");
    const cursor = editor.locator(".cm-fat-cursor").first();
    const accent = await tokenValue(editor, "color", "var(--accent)");
    await expect(cursor).toBeVisible();
    await expect(cursor).toHaveCSS("background-color", accent);
    await expect(cursor).toHaveCSS("outline-style", "none");
    await page.getByRole("tab", { name: "src/App.tsx", exact: true }).focus();
    await expect(editor).not.toHaveClass(/cm-focused/);
    await expect(cursor).toHaveCSS("outline-color", accent);
    await expect(cursor).toHaveCSS("outline-style", "solid");
    await expect(cursor).toHaveCSS("outline-width", "1px");
    await content.focus();
    await expect(cursor).toHaveCSS("background-color", accent);
    await expect(cursor).toHaveCSS("outline-style", "none");
  });
}
