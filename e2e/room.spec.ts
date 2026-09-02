import { expect, test } from "playwright/test";

test.describe("room shell", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("iris.language", "en");
    });
  });

  test("loads the editor and supports collapsing the source tree", async ({ page }) => {
    await page.goto("/room/e2e", { waitUntil: "domcontentloaded" });

    await expect(page.locator("header.glass-header")).toBeVisible();
    await expect(page.getByText("Tsugite", { exact: true })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Project files" })).toBeVisible();
    await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });

    const sourceFolder = page.getByRole("button", { name: "src folder" });
    await expect(sourceFolder).toHaveAttribute("aria-expanded", "true");
    await sourceFolder.click();
    await expect(sourceFolder).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("button", { name: "main.tsx", exact: true })).toBeHidden();
    await sourceFolder.click();
    await expect(page.getByRole("button", { name: "main.tsx", exact: true })).toBeVisible();
  });
});
