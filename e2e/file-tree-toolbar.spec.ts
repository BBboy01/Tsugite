import { expect, test } from "playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("iris.language", "en"));
  await page.goto(`/room/tree-toolbar-${crypto.randomUUID()}`);
  await expect(page.locator(".cm-content")).toBeVisible();
});

test("toolbar reveals a compact search input on demand", async ({ page }, testInfo) => {
  const toolbar = page.getByRole("toolbar", { name: "Project files" });
  await expect(toolbar.getByRole("button")).toHaveCount(3);
  await toolbar.getByRole("button", { name: "Search", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(toolbar.getByRole("button", { name: "New file", exact: true })).toBeFocused();
  await page.keyboard.press("End");
  await expect(toolbar.getByRole("button", { name: "New folder", exact: true })).toBeFocused();
  const search = page.getByPlaceholder("Search...");
  await expect(search).toBeHidden();
  const firstRow = page.getByRole("treeitem", { name: "src folder", exact: true });
  const closedRowBox = await firstRow.boundingBox();
  const toolbarBox = await toolbar.boundingBox();
  expect(closedRowBox!.y - (toolbarBox!.y + toolbarBox!.height)).toBeLessThanOrEqual(12);
  await page.locator(".cm-content").focus();
  await page.screenshot({ path: testInfo.outputPath("toolbar-closed.png") });
  const toggle = toolbar.getByRole("button", { name: "Search", exact: true });
  await toggle.click();
  await expect(search).toBeFocused();
  await expect(search).toHaveCSS("height", "26px");
  await page.screenshot({ path: testInfo.outputPath("toolbar-search.png") });
  expect((await firstRow.boundingBox())!.y).toBeGreaterThan(closedRowBox!.y);
  await search.fill("index.css");
  await expect(page.getByRole("treeitem", { name: "App.tsx", exact: true })).toHaveCount(0);
  await page.getByRole("treeitem", { name: "index.css", exact: true }).click();
  await expect(search).toHaveValue("index.css");
  await toggle.click();
  await expect(search).toBeHidden();
  expect((await firstRow.boundingBox())!.y).toBe(closedRowBox!.y);
  await expect(page.getByRole("treeitem", { name: "App.tsx", exact: true })).toBeVisible();
});

test("toolbar and search fit the mobile files panel", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open files panel", exact: true }).click();
  const toolbar = page.getByRole("toolbar", { name: "Project files" });
  await expect(toolbar.getByRole("button")).toHaveCount(3);
  const firstRow = page.getByRole("treeitem", { name: "src folder", exact: true });
  const closedRowBox = await firstRow.boundingBox();
  const toolbarBox = await toolbar.boundingBox();
  expect(closedRowBox!.y - (toolbarBox!.y + toolbarBox!.height)).toBeLessThanOrEqual(12);
  await toolbar.getByRole("button", { name: "Search", exact: true }).click();
  const search = page.getByPlaceholder("Search...");
  await expect(search).toBeFocused();
  expect((await firstRow.boundingBox())!.y).toBeGreaterThan(closedRowBox!.y);
  const panelBox = await page.getByRole("complementary", { name: "Project files" }).boundingBox();
  const searchBox = await search.boundingBox();
  expect(searchBox!.x).toBeGreaterThanOrEqual(panelBox!.x);
  expect(searchBox!.x + searchBox!.width).toBeLessThanOrEqual(panelBox!.x + panelBox!.width);
  await page.screenshot({ path: testInfo.outputPath("toolbar-mobile.png") });
});

test("empty search does not show a directory focus ring and keeps keyboard navigation", async ({
  page,
}, testInfo) => {
  const directory = page.getByRole("treeitem", { name: "src folder", exact: true });
  const outline = (item: typeof directory) =>
    item.evaluate((element) => getComputedStyle(element, "::before").outlineStyle);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const search = page.getByPlaceholder("Search...");
  await expect(search).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("search-focus.png") });
  expect(await outline(directory)).toBe("none");
  await expect(page.getByRole("treeitem", { name: "App.tsx", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await search.fill("index");
  const firstMatch = page.getByRole("treeitem", { name: "index.css", exact: true });
  expect(await outline(firstMatch)).toBe("solid");
  await search.press("ArrowDown");
  const nextMatch = page.getByRole("treeitem", { name: "index.html", exact: true });
  expect(await outline(nextMatch)).toBe("solid");
  await search.clear();
  expect(await outline(nextMatch)).toBe("none");
  await search.fill("index");
  await search.press("ArrowDown");
  await search.press("Enter");
  await expect(page.getByRole("region", { name: "Editing index.html", exact: true })).toBeVisible();
  await expect(search).toBeHidden();
  await directory.focus();
  await expect(directory).toBeFocused();
  expect(await outline(directory)).toBe("solid");
});

test("new nested files flatten single-child directory chains", async ({ page }, testInfo) => {
  await page.getByRole("toolbar").getByRole("button", { name: "New file", exact: true }).click();
  const input = page.locator("[data-item-rename-input]");
  await input.fill("nested/one/two/note.txt");
  await input.press("Enter");
  const directory = page.getByRole("treeitem", { name: "nested/one/two folder", exact: true });
  await expect(directory).toBeVisible();
  await expect(page.getByRole("treeitem", { name: "note.txt", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("toolbar-nested.png") });
  await page.reload();
  await expect(directory).toBeVisible();
  await expect(page.getByRole("treeitem", { name: "nested folder", exact: true })).toHaveCount(0);
});

for (const kind of ["file", "folder"] as const) {
  test(`toolbar creates a root ${kind} inline`, async ({ page }) => {
    const toolbar = page.getByRole("toolbar", { name: "Project files" });
    await toolbar
      .getByRole("button", { name: kind === "file" ? "New file" : "New folder", exact: true })
      .click();
    const input = page.locator("[data-item-rename-input]");
    await expect(input).toBeFocused();
    const name = kind === "file" ? "root-note.txt" : "root-notes";
    await input.fill(name);
    await input.press("Enter");
    await page.reload();
    await expect(
      page.locator(`[role="treeitem"][data-item-path="${name}${kind === "folder" ? "/" : ""}"]`),
    ).toBeVisible();
  });
}
