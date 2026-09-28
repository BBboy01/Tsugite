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
    test(`renames the ${kind} targeted through its icon at ${width}px`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 720 });
      if (width < 760) {
        await page.getByRole("button", { name: "Toggle files panel", exact: true }).click();
      }
      const tree = page.getByRole("tree", { name: "Project files" });
      const name = kind === "file" ? "index.css" : "src folder";
      const renamed = kind === "file" ? "renamed.css" : "renamed-src";
      const row = tree.getByRole("treeitem", { name, exact: true });

      await row.locator("svg").last().click({ button: "right" });
      const rename = page.getByRole("menuitem", { name: "Rename", exact: true });
      await expect(rename).toBeEnabled();
      await expect(page.getByRole("menuitem", { name: "Delete", exact: true })).toBeEnabled();
      if (kind === "file") {
        await expect(page.getByRole("menuitem", { name: "Copy", exact: true })).toBeEnabled();
      }
      await page.screenshot({ path: testInfo.outputPath("icon-context-menu.png") });
      await rename.click();
      const input = page.getByLabel("Path", { exact: true });
      await expect(input).toBeFocused();
      await expect(input).toHaveValue(kind === "file" ? "index.css" : "src");
      await input.fill(renamed);
      await input.press("Enter");

      await expect(input).toHaveCount(0);
      await expect(
        tree.getByRole("treeitem", {
          name: kind === "file" ? renamed : `${renamed} folder`,
          exact: true,
        }),
      ).toBeVisible();
      await expect(row).toHaveCount(0);
    });
  }
}

test("opening the background menu clears a previous file target", async ({ page }) => {
  const sidebar = page.getByRole("complementary", { name: "Project files" });
  await sidebar
    .getByRole("treeitem", { name: "index.css", exact: true })
    .click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Rename", exact: true })).toBeEnabled();
  await page.keyboard.press("Escape");
  await sidebar.click({ button: "right", position: { x: 150, y: 500 } });

  await expect(page.getByRole("menuitem", { name: "Rename", exact: true })).toBeDisabled();
  await expect(page.getByRole("menuitem", { name: "Delete", exact: true })).toBeDisabled();
  await expect(page.getByRole("menuitem", { name: "New file", exact: true })).toBeEnabled();
});
