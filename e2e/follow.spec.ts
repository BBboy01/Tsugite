import { expect, test } from "playwright/test";

test("follows a collaborator's file and cursor until a local action", async ({ browser }) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  await firstContext.addInitScript(
    (identity) => {
      window.localStorage.setItem("iris.language", "en");
      window.localStorage.setItem("iris.identity.v1", JSON.stringify(identity));
    },
    { userId: "e2e-follow-first", displayName: "Maya", color: "#d88961" },
  );
  await secondContext.addInitScript(
    (identity) => {
      window.localStorage.setItem("iris.language", "en");
      window.localStorage.setItem("iris.identity.v1", JSON.stringify(identity));
    },
    { userId: "e2e-follow-second", displayName: "Jun", color: "#7389b7" },
  );

  const firstPage = await firstContext.newPage();
  const secondPage = await secondContext.newPage();
  const room = `/room/e2e-follow-${Date.now()}`;
  await Promise.all([
    firstPage.goto(room, { waitUntil: "domcontentloaded" }),
    secondPage.goto(room, { waitUntil: "domcontentloaded" }),
  ]);
  await expect(firstPage.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
  await expect(secondPage.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });

  await firstPage.getByRole("button", { name: "index.html", exact: true }).click();
  await secondPage.getByRole("button", { name: "index.html", exact: true }).click();
  await secondPage.getByRole("button", { name: "main.tsx", exact: true }).click();
  await secondPage
    .locator(".cm-line")
    .filter({ hasText: /^createRoot\(document/ })
    .click();

  const secondActiveLine = secondPage.locator(".cm-activeLine").first();
  await expect(secondActiveLine).toHaveText(/createRoot/);

  await firstPage.getByRole("button", { name: /2 online/ }).click();
  await firstPage.getByRole("button", { name: "Jun", exact: true }).click();

  const followedMember = firstPage.locator("[data-following-member='e2e-follow-second']");
  await expect(followedMember).toBeVisible();
  const hasVisibleFollowStyle = async () => {
    const style = await followedMember.evaluate((element) => {
      const computed = getComputedStyle(element);
      return { backgroundColor: computed.backgroundColor, borderColor: computed.borderColor };
    });
    return ![style.backgroundColor, style.borderColor].some((value) =>
      /\/ 0\)|rgba\(0, 0, 0, 0\)/.test(value),
    );
  };
  await expect.poll(hasVisibleFollowStyle).toBe(true);
  await expect(firstPage.locator('section[aria-label="Editing src/main.tsx"]')).toBeVisible();
  await expect(firstPage.locator(".cm-activeLine").first()).toHaveText(/createRoot/);

  await firstPage
    .locator(".cm-line")
    .filter({ hasText: /^createRoot\(document/ })
    .click();
  await expect(firstPage.locator("[data-following-member='e2e-follow-second']")).toHaveCount(0);

  await secondPage.keyboard.press("ArrowDown");
  await expect(firstPage.locator(".cm-activeLine").first()).toHaveText(/createRoot/);

  await firstPage.getByRole("button", { name: "index.html", exact: true }).click();
  await expect(firstPage.locator("[data-following-member='e2e-follow-second']")).toHaveCount(0);
  await expect(firstPage.locator('section[aria-label="Editing index.html"]')).toBeVisible();

  await secondPage.keyboard.press("ArrowDown");
  await expect(firstPage.locator('section[aria-label="Editing index.html"]')).toBeVisible();

  await firstContext.close();
  await secondContext.close();
});
