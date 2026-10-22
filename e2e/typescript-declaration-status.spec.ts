import { expect, test, type Page } from "playwright/test";

async function controlledRuntime(page: Page) {
  await page.route("**/src/lib/webcontainer-runtime.ts*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `export class WebContainerRuntime {
      async start(files, folders, onEvent) {
        onEvent({ type: "state", state: "installing" });
        onEvent({ type: "state", state: "paused" });
      }
      async restart(...args) { return this.start(...args); }
      async readTypeScriptDeclarations() {
        if (document.documentElement.dataset.failDeclarations === "true") {
          throw new Error("Types not installed");
        }
        const answer =
          document.documentElement.dataset.declarationVersion === "2" ? "number" : JSON.stringify("declared");
        return [
          { path: "package.json", text: "{}" },
          { path: "node_modules/typed-pkg/package.json", text: '{"types":"index.d.ts"}' },
          { path: "node_modules/typed-pkg/index.d.ts", text: "export declare const answer: " + answer + ";" },
        ];
      }
      async sync() { return { packageChanged: false }; }
      async syncChangedFiles() { return { packageChanged: false }; }
      dispose() {}
    }`,
    }),
  );
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
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const length = node.textContent?.length ?? 0;
        if (start < offset + length && end <= offset + length) {
          range.setStart(node, start - offset);
          range.setEnd(node, end - offset);
          const rect = range.getBoundingClientRect();
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        }
        offset += length;
      }
      throw new Error(`Missing text node ${word}`);
    }, token);
  await page.mouse.click(point.x, point.y, { button: "right" });
  await expect(page.getByRole("menu")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (window === window.top) localStorage.setItem("iris.language", "en");
  });
});

test("paused preview loads declared package types into the editor worker", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await controlledRuntime(page);
  await page.goto(`/room/types-paused-${crypto.randomUUID()}`, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveTitle(/Tsugite/i);
  const editor = page.locator(".cm-content");
  await expect(editor).toBeFocused();
  await expect(
    page.getByRole("region", { name: "Live preview" }).getByText("paused", { exact: true }),
  ).toBeVisible();
  await expect(page.locator('[data-typescript-ready="true"]')).toHaveCount(1, { timeout: 15_000 });
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText('import { answer } from "typed-pkg";\nanswer;');
  const token = page.locator(".cm-line").filter({ hasText: /^answer;$/ });
  const point = await token.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const rect = range.getBoundingClientRect();
    return { x: rect.x + 8, y: rect.y + rect.height / 2 };
  });
  await page.mouse.move(point.x, point.y);
  await expect(page.locator(".cm-tooltip-hover")).toContainText('"declared"', { timeout: 15_000 });
  await rightClickText(page, "answer;", "answer");
  await page.getByRole("menuitem", { name: "Go to definition", exact: true }).click();
  const declarationPeek = page.getByRole("region", { name: "Go to definition" });
  await expect(declarationPeek).toContainText("node_modules/typed-pkg/index.d.ts");
  await expect(declarationPeek).toContainText('export declare const answer: "declared";');
  await expect(declarationPeek.getByRole("button", { name: "Open location" })).toHaveCount(0);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: "/tmp/iris-declaration-ready-desktop.png" });
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("type scan errors do not block edits and recover on restart", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await controlledRuntime(page);
  await page.addInitScript(() =>
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        document.documentElement.dataset.failDeclarations = "true";
      },
      { once: true },
    ),
  );
  await page.goto(`/room/types-failure-${crypto.randomUUID()}`, { waitUntil: "domcontentloaded" });
  const editor = page.locator(".cm-content");
  await expect(editor).toBeFocused();
  await expect(page.locator('[data-typescript-declarations-state="unavailable"]')).toHaveCount(1, {
    timeout: 15_000,
  });
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText("const stillEditable = 1;");
  await expect(editor).toContainText("stillEditable");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('[data-panel="preview"]')).toHaveCount(0);
  await expect
    .poll(() =>
      page
        .locator(".cm-editor")
        .evaluate((element) => getComputedStyle(element.parentElement!).opacity),
    )
    .toBe("1");
  await page.screenshot({ path: "/tmp/iris-declaration-unavailable-narrow.png" });
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator('[data-panel="preview"]')).toHaveCount(1);
  await page.evaluate(() => delete document.documentElement.dataset.failDeclarations);
  await page.getByRole("button", { name: "Run preview", exact: true }).click();
  await expect(page.locator('[data-typescript-declarations-state="ready"]')).toHaveCount(1, {
    timeout: 15_000,
  });
  await expect(editor).toContainText("stillEditable");
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("refreshes active diagnostics when declarations change without editing the active file", async ({
  page,
}) => {
  await controlledRuntime(page);
  await page.goto(`/room/types-refresh-${crypto.randomUUID()}`, { waitUntil: "domcontentloaded" });
  const editor = page.locator(".cm-content");
  await expect(editor).toBeFocused();
  await expect(page.locator('[data-typescript-ready="true"]')).toHaveCount(1, { timeout: 15_000 });
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText(
    'import { answer } from "typed-pkg";\nconst count: number = answer;',
  );
  await expect(page.locator(".cm-lintRange-error")).toHaveCount(1, { timeout: 15_000 });

  await page.evaluate(() => {
    document.documentElement.dataset.declarationVersion = "2";
  });
  await page.getByRole("button", { name: "Run preview", exact: true }).click();
  await expect(page.locator(".cm-lintRange-error")).toHaveCount(0, { timeout: 15_000 });
  await expect(editor).toContainText("const count: number = answer;");
});
