import { expect, test } from "playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("iris.language", "en"));
  await page.goto(`/room/tree-ui-${crypto.randomUUID()}`);
  await expect(page.locator(".cm-content")).toBeVisible();
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
    if (width < 760)
      await page.getByRole("button", { name: "Toggle files panel", exact: true }).click();
    const sidebar = page.getByRole("complementary", { name: "Project files" });
    await sidebar.getByRole("button", { name: fileName, exact: true }).click({ button: "right" });
    const deleteItem = page.getByRole("menuitem", { name: "Delete", exact: true });
    await expect(deleteItem).toBeVisible();
    const anchor = await deleteItem.boundingBox();
    expect(anchor).not.toBeNull();
    if (keyboard) {
      await page.keyboard.press("End");
      await expect(deleteItem).toBeFocused();
      await page.keyboard.press("Enter");
    } else {
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
        return gap < 1 && box.x < anchor.x + anchor.width && box.x + box.width > anchor.x;
      })
      .toBe(true);
    await expect(deleteItem).toHaveCount(0);
    await page.screenshot({
      path: `/tmp/iris-delete-anchor-${width}x${height}-${keyboard ? "keyboard" : "pointer"}.png`,
    });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(sidebar.getByRole("button", { name: fileName, exact: true })).toBeVisible();
  });
}

test("inline creation and rename accept typing without clicking the input", async ({ page }) => {
  const folder = page.getByRole("button", { name: "src folder", exact: true });
  const file = page
    .getByRole("complementary", { name: "Project files" })
    .getByRole("button", { name: "App.tsx", exact: true });
  const input = page.locator("#file-tree-path");
  for (const [target, action] of [
    [folder, "New file"],
    [folder, "New folder"],
    [folder, "Rename"],
    [file, "Rename"],
  ] as const) {
    await target.click({ button: "right" });
    await page.getByRole("menuitem", { name: action, exact: true }).click();
    await expect(input).toBeFocused();
    await expect
      .poll(() =>
        input.evaluate((el: HTMLInputElement) => [
          el.selectionStart,
          el.selectionEnd,
          el.value.length,
        ]),
      )
      .toEqual([0, (await input.inputValue()).length, (await input.inputValue()).length]);
    await page.keyboard.insertText("replacement");
    await expect(input).toHaveValue("replacement");
    await page.screenshot({ path: `/tmp/iris-inline-${action.replaceAll(" ", "-")}.png` });
    await page.keyboard.press("Escape");
    await expect(input).toHaveCount(0);
    await expect(folder).toBeVisible();
  }
});

test("inline editing does not submit or cancel input method composition", async ({ page }) => {
  await page.getByRole("button", { name: "src folder", exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "New file", exact: true }).click();
  const input = page.getByLabel("Path", { exact: true });
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
  await expect(page.getByRole("button", { name: "composing.ts", exact: true })).toBeVisible();
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
    .getByRole("button", { name: "index.css", exact: true });
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
