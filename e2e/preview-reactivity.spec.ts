import { expect, test } from "playwright/test";

test("text-only local and remote edits refresh the standalone preview", async ({ browser }) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  try {
    await firstContext.addInitScript(() => localStorage.setItem("iris.language", "en"));
    await secondContext.addInitScript(() => localStorage.setItem("iris.language", "en"));
    const first = await firstContext.newPage();
    const room = `/room/e2e-preview-reactivity-${Date.now()}`;
    await first.goto(room);
    const editor = first.locator(".cm-content");
    await expect(editor).toBeVisible();
    await editor.click();
    await first.keyboard.press("ControlOrMeta+A");
    await first.keyboard.insertText('document.getElementById("app").textContent = "Before edit";');
    first.on("dialog", (dialog) => dialog.accept());
    await first
      .getByRole("button", { name: "package.json", exact: true })
      .click({ button: "right" });
    await first.getByRole("menuitem", { name: "Delete", exact: true }).click();
    const firstPreview = first.frameLocator('iframe[title^="Preview of "]');
    await expect(firstPreview.locator("#app")).toHaveText("Before edit", { timeout: 15_000 });

    const second = await secondContext.newPage();
    await second.goto(room);
    const secondPreview = second.frameLocator('iframe[title^="Preview of "]');
    await expect(secondPreview.locator("#app")).toHaveText("Before edit", { timeout: 15_000 });
    await editor.click();
    await first.keyboard.press("ControlOrMeta+A");
    await first.keyboard.insertText('document.getElementById("app").textContent = "After edit";');
    await expect(firstPreview.locator("#app")).toHaveText("After edit");
    await expect(secondPreview.locator("#app")).toHaveText("After edit");
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});
