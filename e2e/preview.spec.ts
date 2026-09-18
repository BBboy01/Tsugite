import { expect, test, type Page } from "playwright/test";

function starterCounter(page: Page, count = 0) {
  return page
    .frameLocator('iframe[title^="Preview of "]')
    .getByRole("button", { name: `Count is ${count}`, exact: true });
}

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) return;
  const expand = page.getByRole("button", { name: "Expand output", exact: true });
  if (await expand.isVisible()) await expand.click();
  await testInfo.attach("preview-output", {
    body: await page.getByRole("region", { name: "Live preview" }).innerText(),
    contentType: "text/plain",
  });
});

test("keeps the initial room socket open through development remounts", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const socketWarnings: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning" && message.text().includes("WebSocket connection")) {
      socketWarnings.push(message.text());
    }
  });
  await page.goto("/room/e2e-connection-" + process.pid + "-" + testInfo.repeatEachIndex, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
  const preview = page.locator('iframe[title^="Preview of "]');
  await expect(preview).toHaveAttribute("src", /^https?:\/\//, { timeout: 150_000 });
  await expect(preview).toHaveAttribute("sandbox", "allow-scripts allow-same-origin");
  await expect(starterCounter(page)).toBeVisible({ timeout: 30_000 });
  await starterCounter(page).click();
  await expect(starterCounter(page, 1)).toBeVisible();
  expect(socketWarnings).toEqual([]);
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("iris.language", "en"));
});

test("keeps the runtime action focused while restarting the preview", async ({ page }) => {
  await page.goto(`/room/e2e-settings-runtime-focus-${Date.now()}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Open shared settings" }).click();
  await page.getByRole("button", { name: "Runtime" }).click();

  const restart = page.getByRole("button", { name: "Restart preview runtime" });
  await restart.focus();
  await page.keyboard.press("Enter");
  await expect(restart).toBeFocused();
});

test("restores the preview after either runtime recovery action", async ({ page }) => {
  test.setTimeout(360_000);
  await page.goto(`/room/e2e-runtime-recovery-${Date.now()}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Waiting for the room snapshot…")).toBeHidden({ timeout: 90_000 });
  await expect(page.getByRole("button", { name: "package.json", exact: true })).toBeVisible({
    timeout: 90_000,
  });
  const preview = page.locator('iframe[title^="Preview of "]');
  await expect(preview).toHaveAttribute("src", /^https?:\/\//, { timeout: 150_000 });
  await expect(starterCounter(page)).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Open shared settings" }).click();
  await page.getByRole("button", { name: "Runtime" }).click();

  const restart = page.getByRole("button", { name: "Restart preview runtime" });
  await restart.click();
  await expect(preview).not.toHaveAttribute("src", /^https?:\/\//);
  await expect(page.getByText("Waiting for preview…")).toBeHidden({ timeout: 90_000 });
  await expect(preview).toHaveAttribute("src", /^https?:\/\//, { timeout: 150_000 });
  await expect(starterCounter(page)).toBeVisible({ timeout: 30_000 });

  const reinstall = page.getByRole("button", {
    name: "Reinstall dependencies and restart preview",
  });
  await reinstall.click();
  await expect(preview).not.toHaveAttribute("src", /^https?:\/\//);
  await expect(page.getByText("Waiting for preview…")).toBeHidden({ timeout: 90_000 });
  await expect(preview).toHaveAttribute("src", /^https?:\/\//, { timeout: 150_000 });
  await expect(starterCounter(page)).toBeVisible({ timeout: 30_000 });
});

test("keeps the preview running after closing the last file tab", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto(`/room/e2e-preview-after-close-${Date.now()}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Close src/App.tsx" }).click();
  await expect(page.getByText("No open files")).toBeVisible();
  await expect(page.getByText("Waiting for the room snapshot…")).toBeHidden();
  await expect(page.getByText("Waiting for preview…")).toBeHidden();
  await expect(page.getByRole("region", { name: "Live preview" })).toBeVisible();
  await expect(page.locator("iframe").first()).toBeVisible({ timeout: 15_000 });
  await expect(starterCounter(page)).toBeVisible({ timeout: 150_000 });
});

test("keeps the project preview stable when switching editor files", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto(`/room/e2e-preview-file-switch-${Date.now()}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
  const preview = page.locator('iframe[title^="Preview of "]');
  await expect(preview).toHaveAttribute("src", /^https?:\/\//, { timeout: 150_000 });
  const previewUrl = await preview.getAttribute("src");
  await expect(starterCounter(page)).toBeVisible({ timeout: 30_000 });
  await starterCounter(page).click();
  await expect(starterCounter(page, 1)).toBeVisible();

  await page.getByRole("button", { name: "index.html", exact: true }).click();
  await expect(preview).toHaveAttribute("src", previewUrl ?? "");
  await expect(page.getByText("Waiting for preview…")).toBeHidden();
  await expect(starterCounter(page, 1)).toBeVisible();
});

test("shows syntax errors in preview instead of a blank frame", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.goto(
    "/room/e2e-preview-syntax-" + testInfo.workerIndex + "-" + testInfo.repeatEachIndex,
    { waitUntil: "domcontentloaded" },
  );
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('iframe[title^="Preview of "]')).toHaveAttribute(
    "src",
    /^https?:\/\//,
    { timeout: 150_000 },
  );
  const preview = page.locator('iframe[title^="Preview of "]');
  const previewUrl = await preview.getAttribute("src");
  await expect(starterCounter(page)).toBeVisible({ timeout: 30_000 });

  const editor = page.locator(".cm-content");
  const originalSource = await editor.locator(".cm-line").allTextContents();
  await editor.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("export const broken = ;");

  await expect(page.getByRole("alert")).toContainText(/Unexpected token|PARSE_ERROR/, {
    timeout: 60_000,
  });

  await editor.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText(originalSource.join("\n"));
  await expect(page.getByRole("alert")).toHaveCount(0, { timeout: 60_000 });
  await expect(preview).toHaveAttribute("src", previewUrl ?? "");
  await expect(starterCounter(page)).toBeVisible({ timeout: 30_000 });
});
