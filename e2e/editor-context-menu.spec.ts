import { expect, test, type Page } from "playwright/test";

async function replaceCode(page: Page, source: string) {
  await page.locator(".cm-content").focus();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText(source);
}

async function rightClickText(page: Page, line: string, token: string) {
  const point = await page
    .locator(".cm-line")
    .filter({ hasText: line })
    .last()
    .evaluate((element, word) => {
      const start = element.textContent?.indexOf(word) ?? -1;
      if (start < 0) throw new Error(`Missing symbol ${word}`);
      const end = start + word.length;
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      let offset = 0;
      let started = false;
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const length = node.textContent?.length ?? 0;
        if (!started && start < offset + length) {
          range.setStart(node, start - offset);
          started = true;
        }
        if (started && end <= offset + length) {
          range.setEnd(node, end - offset);
          const rect = range.getBoundingClientRect();
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        }
        offset += length;
      }
      throw new Error(`Missing symbol ${word}`);
    }, token);
  await page.mouse.click(point.x, point.y, { button: "right" });
  await expect(page.getByRole("menu")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("iris.language", "en"));
  await page.goto(`/room/context-${crypto.randomUUID()}`);
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15000 });
});

test("definition navigation and Peek have different effects and references retain every result", async ({
  page,
}) => {
  await replaceCode(page, "const answer = 42;\n\nconsole.log(answer);\nconsole.log(answer);");
  await rightClickText(page, "console.log(answer)", "answer");
  await page.getByRole("menuitem", { name: "Peek definition", exact: true }).click();
  const peek = page.getByRole("region", { name: "Peek definition" });
  await expect(peek).toBeVisible();
  await expect(peek).toContainText("const answer = 42;");
  await expect(page.locator(".cm-activeLine")).toHaveText("console.log(answer);");
  await page.keyboard.press("Escape");
  await expect(peek).toBeHidden();
  await expect(page.locator(".cm-content")).toBeFocused();
  await rightClickText(page, "console.log(answer)", "answer");
  await page.getByRole("menuitem", { name: "Go to definition", exact: true }).click();
  await expect(page.locator(".cm-activeLine")).toHaveText("const answer = 42;");
  await rightClickText(page, "const answer", "answer");
  await page.getByRole("menuitem", { name: "Find references", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Find references" }).getByRole("option"),
  ).toHaveCount(3);
  const references = page.getByRole("region", { name: "Find references" });
  await references.getByRole("option").first().focus();
  await page.keyboard.press("ArrowDown");
  await expect(references.getByRole("option").nth(1)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(references).toBeHidden();
  await expect(page.locator(".cm-content")).toBeFocused();
});

test("navigates to an unopened workspace file and exact target position", async ({ page }) => {
  await page.locator('[data-context-path="src"]').first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "New file", exact: true }).click();
  await page.getByLabel("Path", { exact: true }).fill("src/value.ts");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await replaceCode(page, "// definition\n\nexport const answer = 42;");
  await page.getByRole("tab", { name: "src/App.tsx", exact: true }).click();
  await replaceCode(page, "import { answer } from './value';\nconsole.log(answer);");
  await page.getByRole("button", { name: "Close src/value.ts", exact: true }).click();
  await rightClickText(page, "console.log(answer)", "answer");
  await page.getByRole("menuitem", { name: "Peek definition", exact: true }).click();
  await expect(page.getByRole("tab", { name: "src/App.tsx", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("region", { name: "Peek definition" })).toContainText(
    "src/value.ts:3:14",
  );
  await page.getByRole("button", { name: "Open location", exact: true }).click();
  await expect(page.getByRole("tab", { name: "src/value.ts", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator(".cm-activeLine")).toHaveText("export const answer = 42;");
  await expect(page.locator(".cm-content")).toBeFocused();
});

test("navigates types and implementations and reports missing targets", async ({ page }) => {
  await replaceCode(
    page,
    "interface Shape { size: number }\nclass Box implements Shape { size = 1 }\nconst shape: Shape = new Box();\nconsole.log(shape);\nconsole.log(unknownName);",
  );
  await rightClickText(page, "console.log(shape)", "shape");
  await page.getByRole("menuitem", { name: "Go to type definition", exact: true }).click();
  await expect(page.locator(".cm-activeLine")).toHaveText("interface Shape { size: number }");
  await rightClickText(page, "interface Shape", "Shape");
  await page.getByRole("menuitem", { name: "Go to implementation", exact: true }).click();
  await expect(page.locator(".cm-activeLine")).toHaveText(
    "class Box implements Shape { size = 1 }",
  );
  await rightClickText(page, "console.log(unknownName)", "unknownName");
  await page.getByRole("menuitem", { name: "Peek references", exact: true }).click();
  await expect(page.getByRole("region", { name: "Peek references" })).toContainText(
    "No locations found",
  );
  await page.keyboard.press("Escape");
  await page
    .locator('[data-context-kind="file"]')
    .filter({ hasText: "index.css" })
    .getByRole("button")
    .click();
  await page.locator(".cm-content").click({ button: "right", position: { x: 15, y: 12 } });
  await expect(
    page.getByRole("menuitem", { name: "Go to definition", exact: true }),
  ).toHaveAttribute("aria-disabled", "true");
});

test("preserves selections for clipboard commands and supports collaborative undo and redo", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await replaceCode(page, "const answer = 42;");
  await page.keyboard.press("ControlOrMeta+A");
  await rightClickText(page, "const answer", "answer");
  await page.getByRole("menuitem", { name: "Copy", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("const answer = 42;");
  await page.keyboard.press("Shift+F10");
  await page.getByRole("menuitem", { name: "Cut", exact: true }).click();
  await expect(page.locator(".cm-content")).toHaveText("");
  await page.keyboard.press("Shift+F10");
  await page.getByRole("menuitem", { name: "Undo", exact: true }).click();
  await expect(page.locator(".cm-content")).toHaveText("const answer = 42;");
  await page.keyboard.press("Shift+F10");
  await page.getByRole("menuitem", { name: "Redo", exact: true }).click();
  await expect(page.locator(".cm-content")).toHaveText("");
  await page.keyboard.press("Shift+F10");
  await page.getByRole("menuitem", { name: "Paste", exact: true }).click();
  await expect(page.locator(".cm-content")).toHaveText("const answer = 42;");
});

test("denied clipboard access never removes selected code", async ({ page }) => {
  await replaceCode(page, "const protectedText = 1;");
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new DOMException("Denied", "NotAllowedError");
        },
      },
    }),
  );
  await page.keyboard.press("ControlOrMeta+A");
  await rightClickText(page, "const protectedText", "protectedText");
  await page.getByRole("menuitem", { name: "Cut", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Clipboard access failed");
  await expect(page.locator(".cm-content")).toHaveText("const protectedText = 1;");
});

test("round-trips every selection through cut and paste with multiple cursors", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await replaceCode(page, "answer\nanswer");
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  await page.keyboard.press("ControlOrMeta+d");
  await page.keyboard.press("Shift+F10");
  await page.getByRole("menuitem", { name: "Cut", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("answer\nanswer");
  await expect(page.locator(".cm-content")).toHaveText("");
  await page.keyboard.press("Shift+F10");
  await page.getByRole("menuitem", { name: "Paste", exact: true }).click();
  await expect(page.locator(".cm-line")).toHaveText(["answer", "answer"]);
});

test("rejects stale menu positions after a collaborator edits the source", async ({
  page,
  browser,
}) => {
  await replaceCode(page, "const answer = 42;\nconsole.log(answer);");
  const otherContext = await browser.newContext();
  try {
    const other = await otherContext.newPage();
    await other.goto(page.url());
    await expect(other.locator(".cm-content")).toContainText("const answer = 42;", {
      timeout: 15000,
    });
    await rightClickText(page, "console.log(answer)", "answer");
    await replaceCode(other, "const answer = 43;\nconsole.log(answer);");
    await expect(page.locator(".cm-content")).toContainText("const answer = 43;");
    await page.getByRole("menuitem", { name: "Go to definition", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("The source has changed");
    await rightClickText(page, "console.log(answer)", "answer");
    await page.getByRole("menuitem", { name: "Go to definition", exact: true }).click();
    await expect(page.locator(".cm-activeLine")).toHaveText("const answer = 43;");
  } finally {
    await otherContext.close();
  }
});

test("opens from the editor keyboard shortcut with Vim mode enabled", async ({ page }) => {
  await page.evaluate(() => localStorage.setItem("tsugite.vim-mode", "true"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-vim-mode="normal"]')).toBeVisible();
  await page.locator(".cm-content").focus();
  await page.keyboard.press("Shift+F10");
  await expect(page.getByRole("menu")).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Go to definition", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".cm-content")).toBeFocused();
});

test("renders themed menus and Peek within desktop and narrow viewports", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await replaceCode(page, "const answer = 42;\n\nconsole.log(answer);");
  await expect(page).toHaveTitle(/Tsugite/i);
  await rightClickText(page, "console.log(answer)", "answer");
  await page.screenshot({ path: "/tmp/tsugite-editor-menu-light.png" });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Open shared settings" }).click();
  await page.getByRole("button", { name: "Dracula", exact: true }).click();
  await page.getByRole("button", { name: "Close settings" }).click();
  await rightClickText(page, "console.log(answer)", "answer");
  await expect(page.getByRole("menu")).toHaveClass(/theme-dracula/);
  await page.screenshot({ path: "/tmp/tsugite-editor-menu-dark.png" });
  await page.getByRole("menuitem", { name: "Peek definition", exact: true }).click();
  await expect(page.getByRole("region", { name: "Peek definition" })).toBeVisible();
  await page.screenshot({ path: "/tmp/tsugite-editor-peek-desktop.png" });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Toggle files panel" })).toBeVisible();
  await expect(page.locator(".cm-line").filter({ hasText: "console.log" })).toBeVisible();
  await page.locator(".cm-content").click();
  await page.keyboard.press("Shift+F10");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.getByRole("menuitem", { name: "Peek definition", exact: true }).click();
  const peek = page.getByRole("region", { name: "Peek definition" });
  await expect(peek).toBeVisible();
  const box = await peek.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(391);
  await page.screenshot({ path: "/tmp/tsugite-editor-peek-narrow.png" });
  await page.keyboard.press("Escape");
  await rightClickText(page, "console.log(answer)", "answer");
  const menuBox = await page.getByRole("menu").boundingBox();
  expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(391);
  expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(845);
  await page.screenshot({ path: "/tmp/tsugite-editor-menu-narrow.png" });
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  expect(errors).toEqual([]);
});
