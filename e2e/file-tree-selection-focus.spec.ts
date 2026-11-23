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
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 60_000));
  for (const [path, control] of [
    ["src/main.tsx", page.getByLabel("File name")],
    ["src/index.css", page.getByRole("menu", { name: "File actions" })],
  ] as const) {
    await page.evaluate((path) => window.editorFocusHarness.select(path), path);
    await expect(page.locator("output")).toHaveText(path);
    await control.focus();
    await page.evaluate(() => window.editorFocusHarness.ready("old-editor"));
    await page.clock.runFor(50);
    await expect(control).toBeFocused();
  }
  await page.getByLabel("File name").focus();
  await page.evaluate(() => window.editorFocusHarness.select("src/App.tsx"));
  await expect(page.locator("output")).toHaveText("src/App.tsx");
  await other.focus();
  await page.getByLabel("File name").focus();
  await page.evaluate(() => window.editorFocusHarness.ready("new-editor"));
  await page.clock.runFor(50);
  await expect(page.getByLabel("File name")).toBeFocused();
  await page.evaluate(() => window.editorFocusHarness.select("index.html"));
  await expect(page.locator("output")).toHaveText("index.html");
  await page.evaluate(() => window.editorFocusHarness.ready("new-editor"));
  await page.clock.runFor(50);
  await expect(page.getByLabel("New editor")).toBeFocused();
  await page.evaluate(() => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML =
      '<input aria-label="Tree search"><button>Tree row</button>';
    root.querySelector("input")!.focus();
  });
  await page.evaluate(() => window.editorFocusHarness.select("src/main.tsx"));
  await expect(page.locator("output")).toHaveText("src/main.tsx");
  await page.getByRole("button", { name: "Tree row" }).focus();
  await page.getByLabel("Tree search").focus();
  await page.evaluate(() => window.editorFocusHarness.ready("new-editor"));
  await page.clock.runFor(50);
  await expect(page.getByLabel("Tree search")).toBeFocused();
  await page.getByLabel("Tree search").evaluate((input) => {
    const container = document.createElement("div");
    container.setAttribute("data-file-tree-search-container", "true");
    container.setAttribute("data-open", "true");
    input.replaceWith(container);
    container.append(input);
    (input as HTMLInputElement).focus();
  });
  await page.evaluate(() => window.editorFocusHarness.select("src/index.css"));
  await expect(page.locator("output")).toHaveText("src/index.css");
  await page.evaluate(() => window.editorFocusHarness.ready("new-editor"));
  await page.clock.runFor(50);
  await expect(page.getByLabel("Tree search")).toBeFocused();
  await page.clock.resume();
  expect(errors).toEqual([]);
});
