import { expect, test } from "playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("iris.language", "en");
    localStorage.setItem(
      "iris.identity.v1",
      JSON.stringify({ userId: "profile-owner", displayName: "Maya", color: "#d88961" }),
    );
  });
  await page.goto(`/room/profile-${crypto.randomUUID()}`);
  await expect(page.locator(".cm-content")).toBeFocused();
});

test("committing a name refreshes sidebar initials and survives another blur", async ({
  page,
}, testInfo) => {
  const name = page.getByRole("textbox", { name: "Edit display name" });
  const avatar = page.getByLabel("Change avatar color");
  await expect(avatar).toHaveText("M");
  await name.fill("Alex Chen");
  await name.press("Enter");
  await expect(page.getByTitle("Alex Chen", { exact: true })).toBeVisible();
  await expect(avatar).toHaveText("AC");
  await name.focus();
  await page.locator(".cm-content").click();
  await expect(name).toHaveValue("Alex Chen");
  await page.screenshot({ path: testInfo.outputPath("updated-name.png") });
});

test("changing avatar color refreshes the sidebar and the selected swatch", async ({
  page,
}, testInfo) => {
  const avatar = page.getByLabel("Change avatar color");
  await expect(avatar).toHaveCSS("background-color", "rgb(216, 137, 97)");
  await avatar.click();
  const sage = page.getByRole("button", { name: "Sage", exact: true });
  await sage.click();
  await expect(page.getByTitle("Maya", { exact: true })).toHaveCSS(
    "background-color",
    "rgb(93, 159, 140)",
  );
  await expect(avatar).toHaveCSS("background-color", "rgb(93, 159, 140)");
  await avatar.click();
  await expect(sage.locator("svg")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Terracotta", exact: true }).locator("svg"),
  ).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("updated-color.png") });
});
