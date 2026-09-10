import { expect, test, type Page } from "playwright/test";

async function keys(page: Page, sequence: string) {
  for (const key of sequence) await page.keyboard.press(key);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("tsugite.vim-mode", "true");
    localStorage.setItem("iris.language", "en");
  });
  await page.goto(`/room/e2e-vim-keyboard-${crypto.randomUUID()}`);
  await expect(page.locator(".cm-editor")).toBeVisible();
  await page.locator(".cm-content").focus();
  await keys(page, "ggVGc");
  await page.keyboard.insertText("abcdef\nx\n\nxyz");
  await page.keyboard.press("Escape");
  await keys(page, "gg0");
  await expect(page.locator(".cm-line")).toHaveText(["abcdef", "x", "", "xyz"]);
});

for (const style of ["block", "line", "underline"]) {
  test(`repeated l reaches the last character with ${style} cursor`, async ({ page }) => {
    await page.getByRole("button", { name: "Open shared settings" }).click();
    await page.getByRole("button", { name: "Editor", exact: true }).click();
    await page.getByLabel("Normal mode cursor").selectOption(style);
    await page.getByRole("button", { name: "Close settings" }).click();
    await expect(page.getByRole("button", { name: "Open shared settings" })).toBeFocused();
    await page.locator(".cm-content").focus();
    await keys(page, "gg0");
    for (let i = 0; i < 20; i++) await page.keyboard.down("l");
    await page.keyboard.up("l");
    const cursor = page.locator(".cm-vimCursorLayer .cm-fat-cursor");
    await expect(cursor).toHaveText("f");
    await expect(cursor).toBeVisible();
    await page.keyboard.press("x");
    await expect(page.locator(".cm-line")).toHaveText(["abcde", "x", "", "xyz"]);
    await keys(page, "G0" + "l".repeat(20) + "x");
    await expect(page.locator(".cm-line").last()).toHaveText("xy");
  });
}

test("l respects counts", async ({ page }) => {
  await keys(page, "3lx");
  await expect(page.locator(".cm-line").first()).toHaveText("abcef");
});

test("l completes a pending delete operator", async ({ page }) => {
  await keys(page, "dl");
  await expect(page.locator(".cm-line").first()).toHaveText("bcdef");
});

test("l extends the Visual selection", async ({ page }) => {
  await keys(page, "vllx");
  await expect(page.locator(".cm-line").first()).toHaveText("def");
});

test("l stays on single-character and empty lines", async ({ page }) => {
  await keys(page, "j0" + "l".repeat(10));
  await expect(page.locator(".cm-fat-cursor")).toHaveText("x");
  await keys(page, "jx");
  await expect(page.locator(".cm-line")).toHaveText(["abcdef", "x", "", "xyz"]);
  await keys(page, "l".repeat(10) + "ix");
  await page.keyboard.press("Escape");
  await expect(page.locator(".cm-line")).toHaveText(["abcdef", "x", "x", "xyz"]);
});

for (const modifier of ["Meta", "Control"]) {
  for (const mode of ["normal", "insert"]) {
    test(`${modifier}-comma opens settings from Vim ${mode}`, async ({ page }) => {
      if (mode === "insert") await page.keyboard.press("i");
      await page.keyboard.press(`${modifier}+,`);
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page.getByRole("button", { name: "Close settings" })).toBeVisible();
      await expect(page.locator(".cm-line")).toHaveText(["abcdef", "x", "", "xyz"]);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
    });
  }
}
