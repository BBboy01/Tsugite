import { expect, test } from "playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("iris.language", "en"));
  await page.goto(`/room/tree-ui-${crypto.randomUUID()}`);
  await expect(page.locator(".cm-content")).toBeVisible();
});

test("virtualized file tree keeps keyboard navigation across rows", async ({ page }) => {
  const files = page.getByRole("complementary", { name: "Project files" });
  const tree = files.getByRole("tree", { name: "Project files" });
  const activeFile = tree.getByRole("treeitem", { name: "App.tsx", exact: true });
  const nextFile = tree.getByRole("treeitem", { name: "index.css", exact: true });
  const sourceFolder = tree.getByRole("treeitem", { name: "src folder", exact: true });

  await expect(sourceFolder).toHaveAttribute("aria-level", "1");
  await expect(sourceFolder).toHaveAttribute("aria-posinset", "1");
  await expect(sourceFolder).toHaveAttribute(
    "aria-setsize",
    String(await tree.locator('[role="treeitem"][aria-level="1"]').count()),
  );
  await expect(activeFile).toHaveAttribute("aria-level", "2");
  await expect(activeFile).toHaveAttribute("aria-selected", "true");
  await activeFile.focus();
  await page.keyboard.press("ArrowDown");
  await expect(nextFile).toBeFocused();
  await page.keyboard.press("Home");
  await expect(sourceFolder).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(activeFile).toBeFocused();
});

test("tree search opens separately from quick open and hides non-matching rows", async ({
  page,
}) => {
  const tree = page.getByRole("tree", { name: "Project files" });
  const sourceFolder = tree.getByRole("treeitem", { name: "src folder", exact: true });
  await sourceFolder.focus();
  await page.keyboard.press("ControlOrMeta+P");
  const quickOpen = page.getByRole("dialog");
  await expect(quickOpen).toBeVisible();
  await page.keyboard.press("Escape");
  await sourceFolder.focus();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const treeSearch = tree.getByPlaceholder("Search...");
  await treeSearch.fill("i");
  await expect(treeSearch).toHaveValue("i");
  await expect(tree.getByRole("treeitem", { name: "index.css", exact: true })).toBeVisible();
  await expect(tree.getByRole("treeitem", { name: "App.tsx", exact: true })).toHaveCount(0);
});

test("delayed result clicks keep tree search results", async ({ page }) => {
  const tree = page.getByRole("tree", { name: "Project files" });
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const treeSearch = tree.getByPlaceholder("Search...");
  await treeSearch.fill("i");
  const result = tree.getByRole("treeitem", { name: "index.css", exact: true });
  await result.click({ delay: 150 });
  await expect(treeSearch).toHaveValue("i");
  await expect(result).toHaveAttribute("aria-selected", "true");
  await expect(tree.getByRole("treeitem", { name: "App.tsx", exact: true })).toHaveCount(0);
});

test("delayed selected-result clicks keep tree search results", async ({ page }) => {
  const tree = page.getByRole("tree", { name: "Project files" });
  const selected = tree.getByRole("treeitem", { name: "App.tsx", exact: true });
  await selected.click();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const treeSearch = tree.getByPlaceholder("Search...");
  await treeSearch.fill("a");
  await selected.click({ delay: 150 });
  await expect(treeSearch).toHaveValue("a");
  await expect(tree.getByRole("treeitem", { name: "index.css", exact: true })).toHaveCount(0);
});

test("file and folder icons retain their colors across selection", async ({ page }) => {
  const tree = page.getByRole("tree", { name: "Project files" });
  const active = tree.getByRole("treeitem", { name: "App.tsx", exact: true });
  const inactive = tree.getByRole("treeitem", { name: "index.css", exact: true });
  const folder = tree.getByRole("treeitem", { name: "src folder", exact: true });
  const activeIcon = active.locator('[data-item-section="icon"] svg');
  const inactiveIcon = inactive.locator('[data-item-section="icon"] svg');
  const folderIcon = folder.locator('[data-item-section="icon"] svg');

  await expect(activeIcon).toHaveCSS("filter", "none");
  await expect(activeIcon).toHaveCSS("opacity", "1");
  await expect(inactiveIcon).toHaveCSS("filter", "none");
  await expect(inactiveIcon).toHaveCSS("opacity", "1");
  await expect(folderIcon).toHaveCSS("filter", "none");
  await expect(folderIcon).toHaveCSS("opacity", "1");

  await inactive.click();
  await expect(inactiveIcon).toHaveCSS("filter", "none");
  await expect(inactiveIcon).toHaveCSS("opacity", "1");
  await expect(activeIcon).toHaveCSS("filter", "none");
  await expect(activeIcon).toHaveCSS("opacity", "1");
});

for (const [action, key] of [
  ["Cancel", "Enter"],
  ["Delete", "Enter"],
  ["Cancel", "Space"],
  ["Delete", "Space"],
] as const) {
  test(`delete confirmation accepts ${key} on ${action} without opening the file`, async ({
    page,
  }) => {
    const file = page.getByRole("treeitem", { name: "index.css", exact: true });
    await file.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    if (action === "Delete") await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: action, exact: true })).toBeFocused();
    await page.keyboard.press(key);
    await expect(dialog).toHaveCount(0);
    if (action === "Delete") {
      await expect(file).toHaveCount(0);
      await page.getByRole("button", { name: "Undo deletion", exact: true }).click();
    }
    await expect(file).toBeVisible();
    await expect(page.getByRole("tab", { name: "src/index.css", exact: true })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "src/App.tsx", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
}

for (const action of ["Cancel", "Delete"] as const) {
  test(`clicking ${action} on an inactive file preserves the active tab`, async ({ page }) => {
    await page.getByRole("treeitem", { name: "main.tsx", exact: true }).click();
    const file = page.getByRole("treeitem", { name: "index.css", exact: true });
    await file.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
    const dialog = page.getByRole("alertdialog");
    await dialog.getByRole("button", { name: action, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "src/main.tsx", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    if (action === "Delete") await expect(file).toHaveCount(0);
    else await expect(file).toBeVisible();
  });
}

test("cancelling folder deletion does not collapse it", async ({ page }) => {
  const folder = page.getByRole("treeitem", { name: "src folder", exact: true });
  await expect(folder).toHaveAttribute("aria-expanded", "true");
  await folder.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(folder).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("treeitem", { name: "App.tsx", exact: true })).toBeVisible();
});

for (const { width, height, fileName, keyboard } of [
  { width: 1280, height: 720, fileName: "index.css", keyboard: false },
  { width: 390, height: 720, fileName: "index.css", keyboard: false },
  { width: 1280, height: 360, fileName: "vite.config.ts", keyboard: false },
  { width: 390, height: 360, fileName: "vite.config.ts", keyboard: false },
  { width: 1280, height: 720, fileName: "index.css", keyboard: true },
  { width: 390, height: 360, fileName: "vite.config.ts", keyboard: true },
]) {
  test(`delete confirmation anchors to its menu item at ${width}x${height} using ${keyboard ? "keyboard" : "pointer"}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    if (width <= 760)
      await page.getByRole("button", { name: "Open files panel", exact: true }).click();
    const sidebar = page.getByRole("complementary", { name: "Project files" });
    const target = sidebar.getByRole("treeitem", { name: fileName, exact: true });
    if (keyboard) {
      await target.focus();
      await page.keyboard.press("Shift+F10");
    } else {
      await target.click({ button: "right" });
    }
    const deleteItem = page.getByRole("menuitem", { name: "Delete", exact: true });
    await expect(deleteItem).toBeVisible();
    const firstMenuItem = page.getByRole("menuitem", { name: "New file", exact: true });
    let anchor: { x: number; y: number; width: number; height: number } | null = null;
    if (keyboard) {
      await firstMenuItem.focus();
      await page.keyboard.press("End");
      await expect(deleteItem).toBeFocused();
      anchor = await deleteItem.boundingBox();
      expect(anchor).not.toBeNull();
      await page.keyboard.press("Enter");
    } else {
      await deleteItem.scrollIntoViewIfNeeded();
      anchor = await deleteItem.boundingBox();
      expect(anchor).not.toBeNull();
      await deleteItem.click();
    }
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveCSS("opacity", "1");
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    await expect
      .poll(async () => {
        const box = await dialog.boundingBox();
        return Boolean(
          box &&
          box.x >= 0 &&
          box.y >= 0 &&
          box.x + box.width <= width &&
          box.y + box.height <= height,
        );
      })
      .toBe(true);
    expect(
      await dialog.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return [
          [box.left + 4, box.top + 4],
          [box.right - 4, box.bottom - 4],
        ].every(([x, y]) => element.contains(document.elementFromPoint(x!, y!)));
      }),
    ).toBe(true);
    await expect
      .poll(async () => {
        const box = await dialog.boundingBox();
        if (!box || !anchor) return false;
        const gap = Math.min(
          Math.abs(box.y - (anchor.y + anchor.height) - 6),
          Math.abs(anchor.y - (box.y + box.height) - 6),
        );
        return gap < 24 && box.x < anchor.x + anchor.width && box.x + box.width > anchor.x;
      })
      .toBe(true);
    await expect(deleteItem).toHaveCount(0);
    await page.screenshot({
      path: `/tmp/iris-delete-anchor-${width}x${height}-${keyboard ? "keyboard" : "pointer"}.png`,
    });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(sidebar.getByRole("treeitem", { name: fileName, exact: true })).toBeVisible();
  });
}

test("tree creation commits a typed name while Escape keeps a unique default name", async ({
  page,
}) => {
  const folder = page.getByRole("treeitem", { name: "src folder", exact: true });
  await folder.click({ button: "right" });
  const menu = page.getByRole("menu");
  await expect(menu.getByText(/^Folder:/)).toHaveCount(0);
  await expect(menu.getByRole("separator")).toHaveCount(1);
  await page.getByRole("menuitem", { name: "New file", exact: true }).click();
  const fileInput = page.locator("[data-item-rename-input]");
  await expect(fileInput).toBeFocused();
  await fileInput.fill("tree-created.ts");
  await fileInput.press("Enter");
  await expect(page.getByRole("treeitem", { name: "tree-created.ts", exact: true })).toBeVisible();

  await folder.click({ button: "right" });
  await page.getByRole("menuitem", { name: "New folder", exact: true }).click();
  const folderInput = page.locator("[data-item-rename-input]");
  const defaultFolderName = await folderInput.inputValue();
  await folderInput.fill("discarded-name");
  await page.keyboard.press("Escape");
  await expect(folderInput).toHaveCount(0);
  await expect(
    page.getByRole("treeitem", { name: `src/${defaultFolderName} folder`, exact: true }),
  ).toBeVisible();
});

test("new file editing starts inline in the tree row", async ({ page }) => {
  const tree = page.getByRole("tree", { name: "Project files" });
  await tree.getByRole("treeitem", { name: "src folder", exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "New file", exact: true }).click();
  const inlineInput = tree.locator("[data-item-rename-input]");
  await expect(inlineInput).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Path", exact: true })).toHaveCount(0);
  await inlineInput.fill("inline-created.ts");
  await inlineInput.press("Enter");
  await expect(
    tree.getByRole("treeitem", { name: "inline-created.ts", exact: true }),
  ).toBeVisible();
});

test("dragging a file into a folder moves it", async ({ page }) => {
  const tree = page.getByRole("tree", { name: "Project files" });
  const file = tree.getByRole("treeitem", { name: "vite.config.ts", exact: true });
  const destination = tree.getByRole("treeitem", { name: "src folder", exact: true });
  await file.dragTo(destination, { steps: 8 });
  await expect(file).toHaveAttribute("data-item-path", "src/vite.config.ts");
});

test("dragging into a name collision preserves both files with a suffix", async ({ page }) => {
  const tree = page.getByRole("tree", { name: "Project files" });
  const destination = tree.getByRole("treeitem", { name: "src folder", exact: true });
  await destination.click({ button: "right" });
  await page.getByRole("menuitem", { name: "New file", exact: true }).click();
  const input = tree.locator("[data-item-rename-input]");
  await input.fill("vite.config.ts");
  await input.press("Enter");
  const source = tree.locator('[data-item-path="vite.config.ts"]');
  await source.dragTo(destination, { steps: 8 });
  await expect(tree.locator('[data-item-path="src/vite.config 2.ts"]')).toBeVisible();
  await expect(tree.locator('[data-item-path="src/vite.config.ts"]')).toBeVisible();
  await expect(source).toHaveCount(0);
});

test("failed F2 rename restores the latest shared tree", async ({ page }) => {
  const tree = page.getByRole("tree", { name: "Project files" });
  await tree.getByRole("treeitem", { name: "src folder", exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "New file", exact: true }).click();
  const input = tree.locator("[data-item-rename-input]");
  await input.fill("retained.ts");
  await input.press("Enter");
  const original = tree.getByRole("treeitem", { name: "index.css", exact: true });
  await original.click();
  await expect(
    page.getByRole("region", { name: "Editing src/index.css", exact: true }),
  ).toBeVisible();
  await page.locator(".cm-content").focus();
  await expect(page.locator(".cm-content")).toBeFocused();
  await original.focus();
  await page.keyboard.press("F2");
  const rename = tree.locator("[data-item-rename-input]");
  await rename.fill("..");
  await rename.press("Enter");
  await expect(page.getByRole("alert")).toContainText("relative non-empty path");
  await expect(original).toBeVisible();
  await expect(tree.locator('[data-item-path="src/retained.ts"]')).toBeVisible();
  await expect(tree.locator('[data-item-path="src/.."]')).toHaveCount(0);
});

test("file tree refresh preserves collapsed folders", async ({ page }) => {
  const tree = page.getByRole("tree", { name: "Project files" });
  const folder = tree.getByRole("treeitem", { name: "src folder", exact: true });
  await folder.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(folder).toHaveAttribute("aria-expanded", "false");

  const rootFile = tree.getByRole("treeitem", { name: "package.json", exact: true });
  await rootFile.click({ button: "right" });
  await page.getByRole("menuitem", { name: "New file", exact: true }).click();
  const input = tree.locator("[data-item-rename-input]");
  await input.fill("preserved-collapse.ts");
  await input.press("Enter");

  await expect(folder).toHaveAttribute("aria-expanded", "false");
  await expect(tree.getByRole("treeitem", { name: "App.tsx", exact: true })).toHaveCount(0);
});

test("dragging a range selection moves every selected file", async ({ page }) => {
  const tree = page.getByRole("tree", { name: "Project files" });
  const folder = tree.getByRole("treeitem", { name: "src folder", exact: true });
  await folder.click({ button: "right" });
  await page.getByRole("menuitem", { name: "New folder", exact: true }).click();
  const folderInput = tree.locator("[data-item-rename-input]");
  await folderInput.fill("destination");
  await folderInput.press("Enter");

  const first = tree.getByRole("treeitem", { name: "App.tsx", exact: true });
  const second = tree.getByRole("treeitem", { name: "index.css", exact: true });
  await first.focus();
  await page.keyboard.press("Shift+ArrowDown");
  await expect(first).toHaveAttribute("aria-selected", "true");
  await expect(second).toHaveAttribute("aria-selected", "true");
  const destination = tree.getByRole("treeitem", { name: "src/destination folder", exact: true });
  await first.dragTo(destination, { steps: 8 });

  await expect(first).toHaveAttribute("data-item-path", "src/destination/App.tsx");
  await expect(second).toHaveAttribute("data-item-path", "src/destination/index.css");
});

test("tree editing does not submit or cancel input method composition", async ({ page }) => {
  await page.getByRole("treeitem", { name: "src folder", exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "New file", exact: true }).click();
  const input = page.locator("[data-item-rename-input]");
  await input.fill("composing.ts");
  await input.dispatchEvent("compositionstart");
  for (const key of ["Enter", "Escape"]) {
    await input.dispatchEvent("keydown", { key, isComposing: true });
    await expect(input).toBeFocused();
  }
  await input.dispatchEvent("compositionend");
  await input.dispatchEvent("keydown", { key: "Enter", keyCode: 229 });
  await expect(input).toBeFocused();
  await input.press("Enter");
  await expect(input).toHaveCount(0);
  await expect(page.getByRole("treeitem", { name: "composing.ts", exact: true })).toBeVisible();
});

test("delete confirmation keeps the workspace theme and dismisses outside without deleting", async ({
  page,
}) => {
  await page.locator(".cm-content").focus();
  await page.keyboard.press("ControlOrMeta+K");
  await page.getByRole("button", { name: "Choose theme" }).click();
  await page.getByRole("button", { name: "Dracula", exact: true }).click();
  const file = page
    .getByRole("complementary", { name: "Project files" })
    .getByRole("treeitem", { name: "index.css", exact: true });
  await file.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toHaveCSS("background-color", "rgb(40, 42, 54)");
  await expect(dialog).toHaveCSS("opacity", "1");
  await page.screenshot({ path: "/tmp/iris-delete-anchor-dark.png" });
  await page.mouse.click(600, 80);
  await expect(dialog).toHaveCount(0);
  await expect(file).toBeVisible();
});

test("command palette has opaque backgrounds in light and dark themes", async ({ page }) => {
  await page.locator(".cm-content").focus();
  await page.keyboard.press("ControlOrMeta+K");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveCSS("background-color", "rgb(245, 245, 247)");
  await page.screenshot({ path: "/tmp/iris-palette-light-fixed.png" });
  await page.getByRole("button", { name: "Choose theme" }).click();
  await page.getByRole("button", { name: "Dracula", exact: true }).hover();
  await expect(dialog).toHaveCSS("background-color", "rgb(40, 42, 54)");
  await page.screenshot({ path: "/tmp/iris-palette-dark-fixed.png" });
});

test("Header file control keeps the existing narrow-screen drawer behavior", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.getByRole("button", { name: "Collapse files panel", exact: true }).click();
  await expect(page.getByRole("button", { name: "Expand files panel", exact: true })).toBeFocused();

  await page.setViewportSize({ width: 390, height: 844 });
  const toggle = page.getByRole("button", { name: "Open files panel", exact: true });
  const filesPanel = page.locator("#workspace-files-panel");

  await expect(page.locator('button[aria-controls="workspace-files-panel"]')).toHaveCount(1);
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  const region = page.locator("[data-header-files-region]");
  const mobileRegionBox = await region.boundingBox();
  const mobileToggleBox = await toggle.boundingBox();
  const mobileRightInset = await region.evaluate((element) => {
    const regionStyle = getComputedStyle(element);
    const button = element.querySelector("button[aria-controls='workspace-files-panel']");
    if (!button) return Number.POSITIVE_INFINITY;
    const buttonStyle = getComputedStyle(button);
    return (
      Number.parseFloat(regionStyle.paddingRight) +
      Number.parseFloat(regionStyle.borderRightWidth) +
      Number.parseFloat(buttonStyle.marginRight)
    );
  });
  expect(mobileRegionBox).not.toBeNull();
  expect(mobileToggleBox).not.toBeNull();
  expect(
    (await page.getByRole("heading", { name: "Tsugite", exact: true }).boundingBox())!.x,
  ).toBeLessThan(mobileToggleBox!.x);
  expect(
    Math.abs(
      mobileToggleBox!.x +
        mobileToggleBox!.width -
        (mobileRegionBox!.x + mobileRegionBox!.width - mobileRightInset),
    ),
  ).toBeLessThan(1);
  await toggle.click();
  await expect(
    page.getByRole("button", { name: "Close files panel", exact: true }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("tree", { name: "Project files" })).toBeVisible();
  await page.getByRole("treeitem", { name: "main.tsx", exact: true }).click();
  await expect(filesPanel).toBeHidden();
  await expect(page.getByRole("tab", { name: "src/main.tsx", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("Header transitions respect reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });

  await expect
    .poll(() =>
      page.evaluate(() => {
        const region = document.querySelector<HTMLElement>("[data-header-files-region]");
        const grid = document.querySelector<HTMLElement>(".workspace-layout-grid");
        const filesContent = document.querySelector<HTMLElement>(".workspace-files-content");
        if (!region || !grid || !filesContent) return null;
        return {
          background: getComputedStyle(region).transitionDuration === "0s",
          glass: getComputedStyle(region, "::before").transitionDuration === "0s",
          grid: getComputedStyle(grid).transitionDuration === "0s",
          filesContent: getComputedStyle(filesContent).transitionDuration === "0s",
        };
      }),
    )
    .toEqual({
      background: true,
      glass: true,
      grid: true,
      filesContent: true,
    });
});
