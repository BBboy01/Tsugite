import { expect, test } from "playwright/test";

for (const confirmation of ["Enter", "blur"] as const) {
  test(`rebuilt Pierre rows retain labels and full-path rename on ${confirmation}`, async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem("iris.language", "en"));
    await page.goto(`/room/pierre-adapter-${crypto.randomUUID()}`);
    await expect(page.locator(".cm-content")).toBeVisible();
    const tree = page.getByRole("tree", { name: "Project files", exact: true });
    await page
      .getByRole("toolbar", { name: "Project files" })
      .getByRole("button", { name: "New file", exact: true })
      .click();
    const input = tree.locator("[data-item-rename-input]");
    await expect(input).toBeFocused();
    await input.fill("adapter/deep/note.ts");
    await input.press("Enter");

    const folder = tree.getByRole("treeitem", { name: "adapter/deep folder", exact: true });
    const original = tree.getByRole("treeitem", { name: "note.ts", exact: true });
    await expect(folder).toBeVisible();
    await expect(original).toBeVisible();
    await original.focus();
    await page.keyboard.press("F2");
    await expect(input).toBeFocused();
    await input.fill("adapter/moved/renamed.ts");
    if (confirmation === "Enter") await input.press("Enter");
    else await tree.getByRole("treeitem", { name: "App.tsx", exact: true }).click();

    await expect(input).toHaveCount(0);
    await expect(original).toHaveCount(0);
    const renamed = tree.getByRole("treeitem", { name: "renamed.ts", exact: true });
    const movedFolder = tree.getByRole("treeitem", { name: "adapter/moved folder", exact: true });
    await expect(renamed).toBeVisible();
    await expect(movedFolder).toBeVisible();
    await renamed.click();
    await expect(
      page.getByRole("region", {
        name: "Editing adapter/moved/renamed.ts",
        exact: true,
      }),
    ).toBeVisible();

    await page.reload();
    await expect(movedFolder).toBeVisible();
    await expect(renamed).toBeVisible();
    await renamed.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dialog).toHaveCount(0);
    await expect(renamed).toBeVisible();
  });
}
