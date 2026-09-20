import { randomBytes } from "node:crypto";
import { expect, test } from "playwright/test";

test("keeps an oversized edit local and exposes the synchronization limit", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    if (window === window.top) localStorage.setItem("iris.language", "en");
  });
  await page.goto(`/room/e2e-sync-limit-${Date.now()}`);
  const editor = page.locator(".cm-content");
  await expect(editor).toBeVisible();
  await expect(page.locator('.live-dot[data-status="live"]')).toBeVisible();
  await editor.click();
  await page.keyboard.press("ControlOrMeta+A");
  const content = Array.from(
    { length: 17_000 },
    () => `// local-only-${randomBytes(50).toString("hex")}`,
  ).join("\n");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate((text) => navigator.clipboard.writeText(text), content);
  await page.keyboard.press("ControlOrMeta+V");
  const status = page.locator('.live-dot[data-status="offline"]');
  await expect(status).toHaveAttribute("role", "alert");
  await expect(status).toHaveAttribute("title", /1 MiB/);
  await expect(editor).toContainText("local-only-");
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("sync-limit.png") });
});
