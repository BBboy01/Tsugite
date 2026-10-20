import { expect, test, type Page } from "playwright/test";

async function showCommandError(page: Page) {
  await page.keyboard.press(":");
  const input = page.locator(".cm-vim-panel input");
  await input.fill("notacommand");
  await input.press("Enter");
  await expect(page.locator(".cm-vim-message")).toHaveText('Not an editor command ":notacommand"');
  await expect(page.locator(".cm-content")).toBeFocused();
}

async function searchMissingText(page: Page) {
  await page.keyboard.press("/");
  const input = page.locator(".cm-vim-panel input");
  await input.fill("missing-text");
  await input.press("Enter");
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (window !== window.top) return;
    localStorage.setItem("iris.language", "en");
    localStorage.setItem("tsugite.vim-mode", "true");
  });
  await page.goto(`/room/e2e-vim-notification-${crypto.randomUUID()}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator(".cm-content")).toBeFocused({ timeout: 15_000 });
  await page.keyboard.type("ggVGc");
  await page.keyboard.insertText("alpha beta\ngamma delta");
  await page.keyboard.press("Escape");
  await page.keyboard.type("gg0");
});

test("dismisses an error immediately without consuming the next motion", async ({ page }) => {
  await showCommandError(page);
  await page.keyboard.press("j");
  await expect(page.locator(".cm-vim-message")).toHaveCount(0, { timeout: 750 });
  await expect(page.locator(".cm-vim-panel [data-status-mode]")).toHaveText("--NORMAL--");
  await page.keyboard.press("x");
  await expect(page.locator(".cm-line")).toHaveText(["alpha beta", "amma delta"]);
});

for (const { first, rest, line } of [
  { first: "d", rest: "w", line: "beta" },
  { first: "2", rest: "x", line: "pha beta" },
  { first: "g", rest: "gx", line: "lpha beta" },
]) {
  test(`dismisses on the first ${first} of a Vim sequence without breaking it`, async ({
    page,
  }) => {
    await showCommandError(page);
    await page.keyboard.press(first);
    await expect(page.locator(".cm-vim-message")).toHaveCount(0, { timeout: 750 });
    await expect(page.locator(".cm-vim-panel [data-status-mode]")).toHaveText("--NORMAL--");
    await page.keyboard.type(rest);
    await expect(page.locator(".cm-line")).toHaveText([line, "gamma delta"]);
  });
}

test("does not dismiss an error for standalone modifiers", async ({ page }) => {
  await showCommandError(page);
  for (const key of ["Shift", "Control", "Alt", "Meta"]) {
    await page.keyboard.press(key);
    await expect(page.locator(".cm-vim-message")).toHaveText(
      'Not an editor command ":notacommand"',
    );
  }
  await page.keyboard.press("Escape");
  await expect(page.locator(".cm-vim-message")).toHaveCount(0, { timeout: 750 });
  await expect(page.locator(".cm-vim-panel [data-status-mode]")).toHaveText("--NORMAL--");
});

test("keeps newly opened command and search prompts editable", async ({ page }) => {
  for (const prefix of [":", "/", "?"]) {
    await showCommandError(page);
    await page.keyboard.press(prefix);
    const input = page.locator(".cm-vim-panel input");
    await expect(input).toBeFocused();
    await page.keyboard.type("alpha");
    await expect(input).toHaveValue("alpha");
    await expect(input).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator(".cm-content")).toBeFocused();
  }
});

test("keeps a new error raised by the dismissing key visible", async ({ page }) => {
  await page.keyboard.type("Go");
  await page.keyboard.press("Escape");
  await showCommandError(page);
  await page.keyboard.press("*");
  await expect(page.locator(".cm-vim-message")).toHaveText("No word under cursor");
});

test("keeps the new search error raised by n visible", async ({ page }) => {
  await searchMissingText(page);
  await showCommandError(page);
  await page.keyboard.press("n");
  await expect(page.locator(".cm-vim-message")).toContainText("No match found");
  await expect(page.locator(".cm-vim-message")).toContainText("missing-text");
});

test("dismisses errors before the custom Visual star search", async ({ page }) => {
  await searchMissingText(page);
  await page.keyboard.type("vlln");
  await expect(page.locator('[data-vim-mode="visual"]')).toBeVisible();
  await expect(page.locator(".cm-vim-message")).toContainText("No match found");
  await page.keyboard.press("*");
  await expect(page.locator(".cm-vim-message")).toHaveCount(0, { timeout: 750 });
  await expect(page.locator("[data-vim-search-query]")).toHaveText("alp");
  await expect(page.locator('[data-vim-mode="normal"]')).toBeVisible();
});

test("does not consume Enter after dismissing a long Vim notification", async ({ page }) => {
  await page.keyboard.press(":");
  const input = page.locator(".cm-vim-panel input");
  await input.fill("registers");
  await input.press("Enter");
  await expect(page.locator(".cm-vim-message")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".cm-vim-message")).toHaveCount(0, { timeout: 750 });
  await expect(page.locator(".cm-vim-panel [data-status-mode]")).toHaveText("--NORMAL--");
  await page.keyboard.press("x");
  await expect(page.locator(".cm-line")).toHaveText(["alpha beta", "amma delta"]);
});

test("still dismisses an idle error after the existing timeout", async ({ page }) => {
  await page.clock.install();
  await showCommandError(page);
  await page.clock.fastForward(20_000);
  await expect(page.locator(".cm-vim-message")).toHaveCount(0);
  await expect(page.locator(".cm-vim-panel [data-status-mode]")).toHaveText("--NORMAL--");
});
