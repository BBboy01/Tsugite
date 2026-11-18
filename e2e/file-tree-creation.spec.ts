import { expect, test } from "playwright/test";

for (const confirmation of ["Enter", "blur"] as const) {
  test(`stepwise same-name directories flatten after ${confirmation} confirmation`, async ({
    page,
  }, testInfo) => {
    await page.addInitScript(() => localStorage.setItem("iris.language", "en"));
    await page.goto(`/room/tree-stepwise-${crypto.randomUUID()}`);
    await expect(page.locator(".cm-content")).toBeVisible();
    const input = page.locator("[data-item-rename-input]");
    const confirmName = async (name: string) => {
      await input.fill(name);
      if (confirmation === "Enter") await input.press("Enter");
      else await page.getByRole("treeitem", { name: "App.tsx", exact: true }).click();
      await expect(input).toHaveCount(0);
    };
    await page
      .getByRole("toolbar")
      .getByRole("button", { name: "New folder", exact: true })
      .click();
    await confirmName("a");
    await page.getByRole("treeitem", { name: "a folder", exact: true }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "New folder", exact: true }).click();
    await confirmName("a");
    const directory = page.getByRole("treeitem", { name: "a/a folder", exact: true });
    await expect(directory).toBeVisible();
    await directory.click({ button: "right" });
    await page.getByRole("menuitem", { name: "New file", exact: true }).click();
    await confirmName("a.js");
    await expect(directory).toBeVisible();
    await expect(page.locator('[role="treeitem"][data-item-path="a/a/a.js"]')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("stepwise-directories.png") });
    await page.reload();
    await expect(directory).toBeVisible();
    await expect(page.getByRole("treeitem", { name: "a folder", exact: true })).toHaveCount(0);
    await expect(page.locator('[role="treeitem"][data-item-path="a/a/a.js"]')).toBeVisible();
  });
}

for (const typedName of [null, "blur-created.ts"]) {
  test(`a new file can be opened and deleted after blur with ${typedName ? "a typed" : "the default"} name`, async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem("iris.language", "en"));
    await page.goto(`/room/tree-create-${crypto.randomUUID()}`);
    await expect(page.locator(".cm-content")).toBeVisible();
    const tree = page.getByRole("tree", { name: "Project files" });
    await tree
      .getByRole("treeitem", { name: "src folder", exact: true })
      .click({ button: "right" });
    await page.getByRole("menuitem", { name: "New file", exact: true }).click();
    const input = tree.locator("[data-item-rename-input]");
    await expect(input).toBeFocused();
    await expect(input).toHaveValue("untitled");
    const name = typedName ?? (await input.inputValue());
    if (typedName) await input.fill(typedName);
    await tree.getByRole("treeitem", { name: "index.css", exact: true }).click();
    const created = tree.getByRole("treeitem", { name, exact: true });
    await expect(created).toBeVisible();
    await created.click();
    await expect(
      page.getByRole("region", { name: `Editing src/${name}`, exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(created).toBeVisible();
    await tree.getByRole("treeitem", { name: "App.tsx", exact: true }).click();
    await created.click();
    await expect(
      page.getByRole("region", { name: `Editing src/${name}`, exact: true }),
    ).toBeVisible();
    await created.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await expect(created).toHaveCount(0);
    await page.reload();
    await expect(page.locator(".cm-content")).toBeVisible();
    await expect(created).toHaveCount(0);
  });
}

test("starting another creation persists the previous default file", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("iris.language", "en"));
  await page.goto(`/room/tree-create-${crypto.randomUUID()}`);
  await expect(page.locator(".cm-content")).toBeVisible();
  const tree = page.getByRole("tree", { name: "Project files" });
  const folder = tree.getByRole("treeitem", { name: "src folder", exact: true });
  await folder.click({ button: "right" });
  await page.getByRole("menuitem", { name: "New file", exact: true }).click();
  const input = tree.locator("[data-item-rename-input]");
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("untitled");
  const firstName = await input.inputValue();
  await folder.click({ button: "right" });
  await page.getByRole("menuitem", { name: "New file", exact: true }).click();
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("untitled 2");
  await input.fill("second.ts");
  await input.press("Enter");
  await page.reload();
  await expect(tree.getByRole("treeitem", { name: firstName, exact: true })).toBeVisible();
  await expect(tree.getByRole("treeitem", { name: "second.ts", exact: true })).toBeVisible();
});

test("a default folder committed by blur can be deleted", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("iris.language", "en"));
  await page.goto(`/room/tree-create-${crypto.randomUUID()}`);
  await expect(page.locator(".cm-content")).toBeVisible();
  const tree = page.getByRole("tree", { name: "Project files" });
  await tree.getByRole("treeitem", { name: "src folder", exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "New folder", exact: true }).click();
  const input = tree.locator("[data-item-rename-input]");
  await expect(input).toBeFocused();
  const name = await input.inputValue();
  await tree.getByRole("treeitem", { name: "index.css", exact: true }).click();
  await page.reload();
  const folder = tree.getByRole("treeitem", { name: `src/${name} folder`, exact: true });
  await folder.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(folder).toHaveCount(0);
});
