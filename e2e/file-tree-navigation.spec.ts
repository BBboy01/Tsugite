import { expect, test } from "playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("iris.language", "en"));
  await page.goto(`/room/tree-navigation-${crypto.randomUUID()}`);
  await expect(page.locator(".cm-content")).toBeVisible();
});

for (const source of ["quick open", "editor tab"] as const) {
  test(`${source} reveals the selected file in its collapsed directory`, async ({
    page,
  }) => {
    const folder = page.getByRole("treeitem", {
      name: "src folder",
      exact: true,
    });
    const file = page.getByRole("treeitem", { name: "index.css", exact: true });
    if (source === "editor tab") {
      await file.click();
      await page
        .getByRole("treeitem", { name: "index.html", exact: true })
        .click();
    }
    await folder.click();
    await expect(folder).toHaveAttribute("aria-expanded", "false");
    if (source === "quick open") {
      await page.keyboard.press("ControlOrMeta+p");
      await page.getByPlaceholder("Search files...").fill("index.css");
      await page.getByPlaceholder("Search files...").press("Enter");
    } else {
      await page
        .getByRole("tab", { name: "src/index.css", exact: true })
        .click();
    }
    await expect(
      page.getByRole("region", { name: "Editing src/index.css", exact: true }),
    ).toBeVisible();
    await expect(folder).toHaveAttribute("aria-expanded", "true");
    await expect(file).toBeVisible();
    await expect(file).toHaveAttribute("aria-selected", "true");
  });
}

test("quick open leaves unrelated directories collapsed", async ({ page }) => {
  const folder = page.getByRole("treeitem", {
    name: "src folder",
    exact: true,
  });
  await folder.click();
  await expect(folder).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("ControlOrMeta+p");
  await page.getByPlaceholder("Search files...").fill("index.html");
  await page.getByPlaceholder("Search files...").press("Enter");
  await expect(
    page.getByRole("region", { name: "Editing index.html", exact: true }),
  ).toBeVisible();
  await expect(folder).toHaveAttribute("aria-expanded", "false");
});
