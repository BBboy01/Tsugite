import { expect, test, type Page } from "playwright/test";

function cursorPosition(page: Page) {
  return page.locator(".cm-content").evaluate((content) => {
    const selection = window.getSelection();
    const node = selection?.focusNode;
    const line = (node instanceof Element ? node : node?.parentElement)?.closest(".cm-line");
    if (!selection || !node || !line || !content.contains(line)) return null;
    const range = document.createRange();
    range.selectNodeContents(line);
    range.setEnd(node, selection.focusOffset);
    return {
      line: Array.from(content.querySelectorAll(".cm-line")).indexOf(line) + 1,
      column: range.toString().length,
    };
  });
}

for (const shortcut of ["Control+p", "ControlOrMeta+p"]) {
  for (const path of ["src/main.tsx", "src/index.css", "src/App.tsx"]) {
    test(`Vim hjkl works immediately after ${shortcut} and Enter opens ${path}`, async ({
      page,
    }) => {
      await page.addInitScript(() => {
        localStorage.setItem("iris.language", "en");
        localStorage.setItem("tsugite.vim-mode", "true");
      });
      await page.goto(`/room/e2e-vim-enter-${Date.now()}`, { waitUntil: "domcontentloaded" });
      await expect(page.locator(".cm-content")).toBeVisible({ timeout: 15_000 });
      await page.locator(".cm-content").focus();
      await page.keyboard.press(shortcut);
      await page.getByPlaceholder("Search files...").fill(path);
      await page.keyboard.press("Enter");
      await expect(page.getByRole("dialog")).toBeHidden();
      await expect(
        page.getByRole("region", { name: `Editing ${path}` }).locator(".cm-content"),
      ).toBeVisible();

      await page.keyboard.press("j");
      await expect.poll(() => cursorPosition(page)).toEqual({ line: 2, column: 0 });
      await page.keyboard.press("k");
      await expect.poll(() => cursorPosition(page)).toEqual({ line: 1, column: 0 });
      await page.keyboard.press("l");
      await expect.poll(() => cursorPosition(page)).toEqual({ line: 1, column: 1 });
      await page.keyboard.press("h");
      await expect.poll(() => cursorPosition(page)).toEqual({ line: 1, column: 0 });
      await expect(page.locator(".cm-content")).toBeFocused();
      await expect(page.locator("[data-vim-mode='normal']")).toBeVisible();
    });
  }
}
