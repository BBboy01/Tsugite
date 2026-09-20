import { expect, test } from "playwright/test";

test("new files start empty and deletion has an independent undo", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("iris.language", "en"));
  await page.goto(`/room/e2e-recovery-${crypto.randomUUID()}`);
  const editor = page.locator(".cm-content");
  await expect(editor).toBeVisible();
  await page.getByRole("button", { name: "package.json", exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "New file", exact: true }).click();
  await page.getByLabel("Path", { exact: true }).fill("recovery/note.json");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(editor).toHaveText("");
  await editor.fill('{"retained":true}');
  await page
    .locator('[data-context-kind="folder"][data-context-path="recovery"]')
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("1 file");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("button", { name: "note.json", exact: true })).toBeVisible();
  await page
    .locator('[data-context-kind="folder"][data-context-path="recovery"]')
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("button", { name: "note.json", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Collapse files", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("complementary", { name: "Project files" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Undo deletion", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Undo deletion", exact: true }).click();
  await page.getByRole("button", { name: "Expand files", exact: true }).click();
  await expect(page.getByRole("button", { name: "note.json", exact: true })).toBeVisible();
  await expect(editor).toHaveText('{"retained":true}');
});
