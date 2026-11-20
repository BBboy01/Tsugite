import { expect, test } from "playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("iris.language", "en"));
  await page.goto(`/room/tree-rename-${crypto.randomUUID()}`);
  await expect(page.locator(".cm-content")).toBeVisible();
});

for (const keyboard of [false, true]) {
  test(`inline rename cancels without switching the active file using ${keyboard ? "keyboard" : "pointer"}`, async ({
    page,
  }) => {
    const file = page.getByRole("treeitem", { name: "index.css", exact: true });
    if (keyboard) {
      await file.focus();
      await page.keyboard.press("Shift+F10");
    } else {
      await file.click({ button: "right" });
    }
    const rename = page.getByRole("menuitem", { name: "Rename", exact: true });
    if (keyboard) {
      await rename.focus();
      await rename.press("Enter");
    } else await rename.click();
    const input = page.locator("[data-item-rename-input]");
    await expect(input).toBeFocused();
    await input.fill("cancelled.css");
    await input.press("Escape");
    await expect(input).toHaveCount(0);
    await expect(file).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "src/App.tsx", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByRole("treeitem", { name: "cancelled.css", exact: true }),
    ).toHaveCount(0);
  });
}

test("inline rename commits on blur and survives reload", async ({ page }) => {
  await page
    .getByRole("treeitem", { name: "index.css", exact: true })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
  const input = page.locator("[data-item-rename-input]");
  await expect(input).toBeFocused();
  await input.fill("blur-renamed.css");
  await page.getByRole("treeitem", { name: "App.tsx", exact: true }).click();
  await page.reload();
  const renamed = page.getByRole("treeitem", {
    name: "blur-renamed.css",
    exact: true,
  });
  await renamed.click();
  await expect(
    page.getByRole("region", {
      name: "Editing src/blur-renamed.css",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".cm-content")).toContainText("tailwindcss");
});

test("submitting a search path does not rename the focused file", async ({
  page,
}) => {
  const tree = page.getByRole("tree", { name: "Project files" });
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const search = tree.getByPlaceholder("Search...");
  await search.fill("src/");
  await search.press("Enter");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await search.fill("");
  await expect(
    tree.getByRole("treeitem", { name: "App.tsx", exact: true }),
  ).toBeVisible();
});
