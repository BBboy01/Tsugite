import { expect, test } from "playwright/test";

test("closing a row menu cannot steal focus from a new root menu", async ({
  page,
}) => {
  await page.clock.install();
  await page.addInitScript(() => localStorage.setItem("iris.language", "en"));
  await page.goto(`/room/tree-context-focus-${crypto.randomUUID()}`);
  const folder = page.getByRole("treeitem", {
    name: "src folder",
    exact: true,
  });
  await folder.click({ button: "right" });
  await expect(page.getByRole("menu")).toBeVisible();

  // Let the next menu open before the old menu's deferred focus restoration.
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  const tree = page.getByRole("group", { name: "Project files", exact: true });
  const box = (await tree.boundingBox())!;
  await page.mouse.click(box.x + 40, box.y + box.height - 40, {
    button: "right",
  });
  const rootMenu = page.getByRole("menu", { name: "File tree actions" });
  await expect(rootMenu).toBeVisible();
  await page.clock.runFor(1);
  await page.clock.resume();
  await expect(rootMenu).toBeVisible();
  await expect(rootMenu.getByRole("menuitem")).toHaveCount(2);
  await expect
    .poll(() =>
      rootMenu.evaluate((menu) => menu.contains(document.activeElement)),
    )
    .toBe(true);
  await page.keyboard.press("Escape");
  await expect(rootMenu).toHaveCount(0);
  await folder.click({ button: "right" });
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(folder).toBeFocused();
});
