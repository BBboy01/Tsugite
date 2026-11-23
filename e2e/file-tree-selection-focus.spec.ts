import { expect, test } from "playwright/test";
import type {} from "./editor-focus-harness";

test("file selection keeps editor focus pending until pointer focus settles", async ({
  page,
}) => {
  await page.clock.install();
  await page.addInitScript(() => localStorage.setItem("iris.language", "en"));
  await page.goto(`/room/tree-selection-focus-${crypto.randomUUID()}`);
  const editor = page.locator(".cm-content");
  await expect(editor).toBeFocused();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 60_000));
  const file = page.getByRole("treeitem", { name: "index.html", exact: true });
  const box = (await file.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(editor).toHaveAttribute("data-language", "html");
  // Reproduce pointer focus arriving after the new editor has mounted.
  await file.focus();
  await page.clock.runFor(50);
  await page.clock.resume();
  await expect(editor).toBeFocused();
  await page.keyboard.insertText("<!-- focus-restored -->");
  await expect(editor).toContainText("focus-restored");
});

test("a selection cannot consume focus through the previous editor", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.clock.install();
  await page.route(/\/src\/main\.tsx(?:\?.*)?$/, (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `import ${JSON.stringify(`/@fs${import.meta.dirname}/editor-focus-harness.tsx`)};`,
    }),
  );
  await page.goto(`/room/focus-ownership-${crypto.randomUUID()}`);
  await expect(page.locator("output")).toHaveText("src/App.tsx");
  await page.evaluate(() => window.editorFocusHarness.ready("old-editor"));
  await expect(page.getByLabel("Old editor")).toBeFocused();
  const other = page.getByRole("button", { name: "Other control" });
  await other.focus();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 60_000));
  await page.evaluate(() => window.editorFocusHarness.select("index.html"));
  await expect(page.locator("output")).toHaveText("index.html");
  await page.clock.runFor(50);
  await expect(other).toBeFocused();
  await page.evaluate(() => window.editorFocusHarness.ready("new-editor"));
  await page.clock.runFor(50);
  await page.clock.resume();
  await expect(page.getByLabel("New editor")).toBeFocused();
  expect(errors).toEqual([]);
});
