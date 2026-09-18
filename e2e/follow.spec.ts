import { expect, test } from "playwright/test";

test("follows a collaborator's file and cursor until a local action", async ({
  browser,
}, testInfo) => {
  test.setTimeout(90_000);
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

  const onlineMembers = firstPage.getByRole("button", { name: /2 online/ });
  await expect(onlineMembers).toBeVisible({ timeout: 30_000 });
  await onlineMembers.click();
  await firstPage.getByRole("button", { name: "Jun", exact: true }).click();

  await expect(firstPage.locator('section[aria-label="Editing src/main.tsx"]')).toBeVisible();
  await expect(firstPage.locator(".cm-activeLine").first()).toHaveText(/createRoot/);
  const followedEditor = firstPage.locator("[data-editor-following='true']");
  await expect(followedEditor).toBeVisible();
  await expect
    .poll(() => followedEditor.evaluate((element) => getComputedStyle(element).borderTopColor))
    .not.toBe("rgba(0, 0, 0, 0)");
  await expect
    .poll(() => followedEditor.evaluate((element) => getComputedStyle(element).boxShadow))
    .not.toBe("none");
  const followLayout = await followedEditor.evaluate((element) => ({
    editorRight: element.parentElement?.getBoundingClientRect().right ?? 0,
    gutterRight:
      element.parentElement?.querySelector(".cm-gutters")?.getBoundingClientRect().right ?? 0,
    indicatorLeft: element.getBoundingClientRect().left,
    indicatorRight: element.getBoundingClientRect().right,
    bottomGap: window.innerHeight - element.getBoundingClientRect().bottom,
    documentClientHeight: document.documentElement.clientHeight,
    documentScrollHeight: document.documentElement.scrollHeight,
  }));
  expect(followLayout.indicatorLeft).toBeGreaterThanOrEqual(followLayout.gutterRight);
  expect(followLayout.editorRight - followLayout.indicatorRight).toBeLessThanOrEqual(1);
  expect(followLayout.bottomGap).toBeGreaterThanOrEqual(4);
  expect(followLayout.documentScrollHeight).toBe(followLayout.documentClientHeight);

  await firstPage
    .locator(".cm-line")
    .filter({ hasText: /^createRoot\(document/ })
    .click();
  await expect(firstPage.locator("[data-following-member='e2e-follow-second']")).toHaveCount(0);
  await expect(firstPage.locator("[data-editor-following='true']")).toHaveCount(0);

  await secondPage.keyboard.press("ArrowDown");
  await expect(firstPage.locator(".cm-activeLine").first()).toHaveText(/createRoot/);

  await firstPage.getByRole("button", { name: "index.html", exact: true }).click();
  await expect(firstPage.locator("[data-following-member='e2e-follow-second']")).toHaveCount(0);
  await expect(firstPage.locator('section[aria-label="Editing index.html"]')).toBeVisible();

  await secondPage.keyboard.press("ArrowDown");
  await expect(firstPage.locator('section[aria-label="Editing index.html"]')).toBeVisible();

  await secondPage.locator(".cm-content").click();
  await secondPage.keyboard.press("ControlOrMeta+End");
  await secondPage.keyboard.insertText("\n" + "// expanded gutter\n".repeat(1500));
  await onlineMembers.click();
  await firstPage.getByRole("button", { name: "Jun", exact: true }).click();
  await expect(firstPage.locator('section[aria-label="Editing src/main.tsx"]')).toBeVisible();
  await expect(firstPage.locator(".cm-lineNumbers")).toContainText("1500");

  await secondPage.getByRole("button", { name: "Open shared settings" }).click();
  await secondPage.getByRole("button", { name: "Editor", exact: true }).click();
  await secondPage.locator('[data-setting-id="fontSize"]').getByRole("slider").focus();
  await secondPage.keyboard.press("End");
  await secondPage.keyboard.press("Escape");

  for (const viewport of [
    { width: 1440, height: 960 },
    { width: 390, height: 844 },
  ]) {
    await firstPage.setViewportSize(viewport);
    await expect(followedEditor).toBeVisible();
    await expect
      .poll(() =>
        followedEditor.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          const gutter = element
            .parentElement!.querySelector(".cm-gutters")!
            .getBoundingClientRect();
          return bounds.left - gutter.right;
        }),
      )
      .toBeGreaterThanOrEqual(0);
    await expect
      .poll(() =>
        firstPage.evaluate(
          () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
        ),
      )
      .toBe(0);
    const screenshot = testInfo.outputPath(`following-${viewport.width}.png`);
    await firstPage.screenshot({ path: screenshot });
    await testInfo.attach(`following-${viewport.width}`, {
      path: screenshot,
      contentType: "image/png",
    });
  }

  await firstContext.close();
  await secondContext.close();
});
