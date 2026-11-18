import { expect, test } from "playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (window.top === window) localStorage.setItem("iris.language", "en");
  });
  await page.goto(`/room/tree-context-${crypto.randomUUID()}`);
  await expect(page.locator(".cm-content")).toBeVisible();
});

for (const width of [1280, 390]) {
  for (const kind of ["file", "folder"] as const) {
    test(`renames the ${kind} from its right-click menu at ${width}px`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 720 });
      if (width < 760) {
        await page.getByRole("button", { name: "Open files panel", exact: true }).click();
      }
      const tree = page.getByRole("tree", { name: "Project files" });
      await expect(tree).toBeVisible();
      const name = kind === "file" ? "index.css" : "src folder";
      const renamed = kind === "file" ? "renamed.css" : "renamed-src";
      const row = page.getByRole("treeitem", { name, exact: true });

      await row.hover();
      await expect(page.getByRole("button", { name: "Options", exact: true })).toBeVisible();
      await row.click({ button: "right" });
      const rename = page.getByRole("menuitem", { name: "Rename", exact: true });
      await expect(rename).toBeEnabled();
      await expect(page.getByRole("menuitem", { name: "Delete", exact: true })).toBeEnabled();
      await expect(page.getByRole("menuitem", { name: "Copy", exact: true })).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath("icon-context-menu.png") });
      await rename.click();
      const input = tree.locator("[data-item-rename-input]");
      await expect(page.locator("#file-tree-path")).toHaveCount(0);
      await expect(input).toBeFocused();
      await expect(input).toHaveValue(kind === "file" ? "index.css" : "src");
      await page.screenshot({ path: testInfo.outputPath("inline-rename.png") });
      await input.fill(renamed);
      await input.press("Enter");

      await expect(input).toHaveCount(0);
      if (width < 760 && !(await tree.isVisible())) {
        await page.getByRole("button", { name: "Open files panel", exact: true }).click();
      }
      await expect(
        page.getByRole("treeitem", {
          name: kind === "folder" ? `${renamed} folder` : renamed,
          exact: true,
        }),
      ).toBeVisible();
      await expect(row).toHaveCount(0);
    });
  }
}

test("right click opens the row menu and its action targets that item", async ({
  page,
}, testInfo) => {
  const file = page.getByRole("treeitem", { name: "index.css", exact: true });
  const itemActions = page.getByRole("button", { name: "Options", exact: true });
  await expect(itemActions).toBeHidden();
  await file.hover();
  await expect(itemActions).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("row-options-hover.png") });
  await page.mouse.move(1000, 700);
  await expect(itemActions).toBeHidden();
  await file.hover();
  await expect(itemActions).toBeVisible();
  await itemActions.click();
  const buttonMenu = page.getByRole("menu");
  await expect(buttonMenu).toBeVisible();
  await expect(buttonMenu).toHaveCSS("opacity", "1");
  await page.keyboard.press("Escape");
  await expect(buttonMenu).toHaveCount(0);
  await file.hover();
  const clickPoint = await file.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  });
  await file.click({ button: "right" });
  const menu = page.getByRole("menu");
  await expect(menu).toHaveCSS("opacity", "1");
  await expect(menu.getByRole("menuitem", { name: "Move", exact: true })).toHaveCount(0);
  await expect(menu.getByText(/^File:/)).toHaveCount(0);
  await expect(menu.getByRole("separator")).toHaveCount(1);
  await expect(menu.getByRole("menuitem")).toHaveText([
    "New file",
    "New folder",
    "Rename",
    "Delete",
  ]);
  expect(
    await menu
      .getByRole("separator")
      .evaluate((element) => element.previousElementSibling?.textContent),
  ).toBe("Rename");
  await expect(page.getByRole("menuitem", { name: "Rename", exact: true })).toBeEnabled();
  await expect(menu.locator("svg")).toHaveCount(0);
  const inset = await menu.evaluate((element) => {
    const menuRect = element.getBoundingClientRect();
    const itemRect = element.querySelector('[role="menuitem"]')!.getBoundingClientRect();
    return { x: itemRect.left - menuRect.left, y: itemRect.top - menuRect.top };
  });
  expect(inset).toEqual({ x: 5, y: 5 });
  await expect
    .poll(async () => {
      const menuBox = await menu.boundingBox();
      if (!menuBox) return Number.POSITIVE_INFINITY;
      return Math.max(Math.abs(menuBox.x - clickPoint.x), Math.abs(menuBox.y - clickPoint.y));
    })
    .toBeLessThanOrEqual(1);
  const rightEdgeIsVisible = await menu.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.right - 2, rect.top + rect.height / 2);
    return hit === element || element.contains(hit);
  });
  expect(rightEdgeIsVisible).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("right-click-menu.png") });
  await page.keyboard.press("Escape");
  const nextFile = page.getByRole("treeitem", { name: "main.tsx", exact: true });
  await nextFile.focus();
  await expect(nextFile).toBeFocused();
  await page.keyboard.press("Shift+F10");
  await expect(page.getByRole("menuitem", { name: "Rename", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Copy", exact: true })).toHaveCount(0);
});

for (const width of [1280, 390]) {
  test(`blank tree space opens root creation actions at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 720 });
    if (width < 760 && !(await page.getByRole("tree", { name: "Project files" }).isVisible())) {
      await page
        .getByRole("button", { name: /files panel/i })
        .first()
        .click();
    }
    await page
      .getByRole("treeitem", { name: "src folder", exact: true })
      .click({ button: "right" });
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    const tree = page.getByRole("group", { name: "Project files", exact: true });
    const box = await tree.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box!.x + 40, box!.y + box!.height - 40, { button: "right" });
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem")).toHaveCount(2);
    await expect(menu.getByRole("separator")).toHaveCount(0);
    await menu.getByRole("menuitem", { name: "New file", exact: true }).click();
    const input = page.locator("[data-item-rename-input]");
    await input.fill("root-from-blank.ts");
    await input.press("Enter");
    if (width < 760 && !(await page.getByRole("tree", { name: "Project files" }).isVisible())) {
      await page
        .getByRole("button", { name: /files panel/i })
        .first()
        .click();
    }
    await expect(
      page.getByRole("treeitem", { name: "root-from-blank.ts", exact: true }),
    ).toBeVisible();
    await page.getByRole("treeitem", { name: "src folder", exact: true }).click();
    await expect(
      page.getByRole("treeitem", { name: "root-from-blank.ts", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "Edit display name", exact: true })
      .click({ button: "right" });
    await expect(menu).toHaveCount(0);
    await page.locator(".glass-header").click({ button: "right", position: { x: 15, y: 15 } });
    await expect(menu).toHaveCount(0);
  });
}
