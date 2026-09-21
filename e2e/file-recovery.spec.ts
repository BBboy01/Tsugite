import { expect, test, type Page } from "playwright/test";

async function deleteFile(page: Page, name: string) {
  await page
    .getByRole("complementary", { name: "Project files" })
    .getByRole("button", { name, exact: true })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete", exact: true }).click();
}

test("deletion recovery controls stay inside a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 720 });
  await page.addInitScript(() => localStorage.setItem("iris.language", "en"));
  await page.goto(`/room/recovery-narrow-${crypto.randomUUID()}`);
  await expect(page.locator(".cm-content")).toBeVisible();
  await page.getByRole("button", { name: "Toggle files panel", exact: true }).click();
  await deleteFile(page, "index.css");
  const undo = page.getByRole("button", { name: "Undo deletion", exact: true });
  const toast = undo.locator("..");
  const box = await toast.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await undo.click();
  await expect(page.getByRole("button", { name: "index.css", exact: true })).toBeVisible();
});

test("a new deletion clears the previous recovery conflict", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("iris.language", "en"));
  await page.goto(`/room/recovery-conflict-${crypto.randomUUID()}`);
  await expect(page.locator(".cm-content")).toBeVisible();
  await deleteFile(page, "index.css");
  await page.getByRole("button", { name: "src folder", exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "New file", exact: true }).click();
  await page.getByLabel("Path", { exact: true }).fill("index.css");
  await page.getByLabel("Path", { exact: true }).press("Enter");
  await page.getByRole("button", { name: "Undo deletion", exact: true }).click();
  const status = page
    .getByRole("button", { name: "Undo deletion", exact: true })
    .locator("..")
    .getByRole("status");
  await expect(status).toContainText("Cannot restore");
  await deleteFile(page, "index.css");
  await expect(status).toContainText("Deleted");
  await page.getByRole("button", { name: "Undo deletion", exact: true }).click();
  await expect(page.getByRole("button", { name: "index.css", exact: true })).toBeVisible();
});

test("new files start empty and deletion has an independent undo", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("iris.language", "en"));
  await page.goto(`/room/e2e-recovery-${crypto.randomUUID()}`);
  const editor = page.locator(".cm-content");
  await expect(editor).toBeVisible();
  await page.getByRole("button", { name: "package.json", exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "New file", exact: true }).click();
  const pathInput = page.getByLabel("Path", { exact: true });
  await pathInput.fill("recovery/note.json");
  await pathInput.press("Enter");
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
