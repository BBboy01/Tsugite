import { expect, test } from "playwright/test";

for (const input of ["pointer", "keyboard"] as const) {
  test(`closing the active tab restores editing focus using ${input}`, async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("iris.language", "en"));
    await page.goto(`/room/tab-close-focus-${crypto.randomUUID()}`);
    const editor = page.locator(".cm-content");
    await expect(editor).toBeFocused();
    await page.getByRole("treeitem", { name: "main.tsx", exact: true }).click();
    await expect(editor).toBeFocused();

    const close = page.getByRole("button", { name: "Close src/main.tsx", exact: true });
    if (input === "pointer") await close.click();
    else {
      await close.focus();
      await page.keyboard.press("Enter");
    }

    await expect(page.getByRole("tab", { name: "src/main.tsx", exact: true })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "src/App.tsx", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(editor).toBeFocused();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.insertText("\n// typing after closing a tab");
    await expect(editor).toContainText("// typing after closing a tab");
  });
}
