import { expect, test } from "playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (window === window.top) localStorage.setItem("iris.language", "en");
  });
});

test("highlights edited and scrolled code in a worker without replacing the editor", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`/room/highlight-worker-${crypto.randomUUID()}`);
  const editor = page.locator(".cm-content");
  await expect(editor).toBeFocused();
  await expect
    .poll(() => page.workers().some((worker) => worker.url().includes("shiki.worker")))
    .toBe(true);
  await page
    .locator(".cm-editor")
    .evaluate((element) => element.setAttribute("data-test-instance", "original"));
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText(
    Array.from({ length: 500 }, (_, index) => `const value${index} = ${index};`).join("\n"),
  );
  await page.keyboard.press("ControlOrMeta+End");
  const lastLine = editor.locator(".cm-line").filter({ hasText: "const value499 = 499;" });
  await expect(lastLine.locator("span[style*='color:']").first()).toBeVisible();
  await page.keyboard.press("ControlOrMeta+Home");
  const firstLine = editor.locator(".cm-line").filter({ hasText: /^const value0 = 0;$/ });
  await expect(firstLine.locator("span[style*='color:']").first()).toBeVisible();
  await page.keyboard.insertText("// rapid\n");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(firstLine.locator("span[style*='color:']").first()).toBeVisible();
  await expect(page.locator(".cm-editor")).toHaveAttribute("data-test-instance", "original");
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("keeps the highlight worker warm while switching files", async ({ page }) => {
  const highlightWorkers: string[] = [];
  page.on("worker", (worker) => {
    if (worker.url().includes("shiki.worker")) highlightWorkers.push(worker.url());
  });

  await page.goto(`/room/highlight-switch-${crypto.randomUUID()}`);
  await expect(page.locator(".cm-shiki").first()).toBeVisible();
  expect(highlightWorkers).toHaveLength(1);

  await page.getByRole("treeitem", { name: "main.tsx", exact: true }).click();
  await expect(page.locator(".cm-shiki").first()).toBeVisible();
  await page.getByRole("treeitem", { name: "App.tsx", exact: true }).click();
  await expect(page.locator(".cm-shiki").first()).toBeVisible();

  expect(highlightWorkers).toHaveLength(1);
});

test("a blocked highlight worker leaves native highlighting and editing available", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    window.Worker = class extends OriginalWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        if (String(url).includes("shiki.worker")) throw new Error("highlight worker blocked");
        super(url, options);
      }
    };
  });
  await page.goto(`/room/highlight-worker-failure-${crypto.randomUUID()}`);
  const editor = page.locator(".cm-content");
  await expect(editor).toBeFocused();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText("const stillEditable = 42;");
  await expect(editor).toHaveText("const stillEditable = 42;");
  const keyword = editor.getByText("const", { exact: true });
  await expect(keyword).toBeVisible();
  const bodyColor = await editor.evaluate((element) => getComputedStyle(element).color);
  await expect(keyword).not.toHaveCSS("color", bodyColor);
  await expect(editor.getByText("42", { exact: true })).not.toHaveCSS("color", bodyColor);
  await page.screenshot({ path: testInfo.outputPath("highlight-worker-fallback.png") });
  expect(errors).toEqual([]);
});

test("a nonresponsive highlight worker reveals the editable native fallback", async ({ page }) => {
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    window.Worker = class extends OriginalWorker {
      private readonly isShiki: boolean;

      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.isShiki = String(url).includes("shiki.worker");
      }

      override set onmessage(listener: ((event: MessageEvent) => void) | null) {
        super.onmessage = this.isShiki ? null : listener;
      }

      override get onmessage() {
        return super.onmessage;
      }
    };
  });
  await page.goto(`/room/highlight-worker-stall-${crypto.randomUUID()}`);
  const editorHost = page.locator(".cm-editor").locator("..");
  await expect(editorHost).toHaveCSS("opacity", "0");
  await expect(editorHost).toHaveCSS("opacity", "1", { timeout: 5000 });
  const editor = page.locator(".cm-content");
  await expect(editor).toBeFocused();
  await page.keyboard.insertText("// editable after timeout");
  await expect(editor).toContainText("// editable after timeout");
});

test("fallback syntax colors follow the selected theme across editor remounts", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    window.Worker = class extends OriginalWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        if (String(url).includes("shiki.worker")) throw new Error("highlight worker blocked");
        super(url, options);
      }
    };
  });
  await page.goto(`/room/highlight-theme-${crypto.randomUUID()}`);
  await expect(page.locator(".cm-content")).toBeFocused();
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("button", { name: "Choose theme", exact: true }).click();
  await page.getByRole("button", { name: "Dracula", exact: true }).click();
  await expect(page.locator("main")).toHaveClass(/theme-dracula/);

  const expectThemeKeyword = async () => {
    await expect(page.locator(".cm-line").first().getByText("import", { exact: true })).toHaveCSS(
      "color",
      "rgb(189, 147, 249)",
    );
  };
  await expectThemeKeyword();

  await page.getByRole("treeitem", { name: "main.tsx", exact: true }).click();
  await expectThemeKeyword();

  await page.locator(".cm-content").focus();
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("button", { name: "Vim mode", exact: true }).click();
  await expectThemeKeyword();

  await page.reload();
  await expect(page.locator("main")).toHaveClass(/theme-dracula/);
  await expectThemeKeyword();
});

test("refresh does not reveal the default theme before the room snapshot", async ({ page }) => {
  await page.goto(`/room/theme-snapshot-${crypto.randomUUID()}`);
  await expect(page.locator(".cm-content")).toBeFocused();
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("button", { name: "Choose theme", exact: true }).click();
  await page.getByRole("button", { name: "Dracula", exact: true }).click();
  await expect(page.locator("main")).toHaveClass(/theme-dracula/);

  await page.addInitScript(() => {
    const OriginalWebSocket = window.WebSocket;
    window.WebSocket = class extends OriginalWebSocket {
      override set onmessage(listener: ((event: MessageEvent) => void) | null) {
        super.onmessage = listener ? (event) => setTimeout(() => listener(event), 900) : null;
      }

      override get onmessage() {
        return super.onmessage;
      }
    };
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("main")).toBeVisible();
  expect(await page.locator("main").getAttribute("class")).toContain("theme-dracula");
  await expect(page.locator("main")).toHaveClass(/theme-dracula/);
});

test("a first-time visitor does not see a room's default theme before its snapshot", async ({
  browser,
  page,
}) => {
  const roomId = `theme-first-visit-${crypto.randomUUID()}`;
  await page.goto(`/room/${roomId}`);
  await expect(page.locator(".cm-content")).toBeFocused();
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("button", { name: "Choose theme", exact: true }).click();
  await page.getByRole("button", { name: "Dracula", exact: true }).click();
  await expect(page.locator("main")).toHaveClass(/theme-dracula/);

  const visitor = await browser.newContext();
  try {
    const freshPage = await visitor.newPage();
    await freshPage.addInitScript(() => {
      localStorage.setItem("iris.language", "en");
      const OriginalWebSocket = window.WebSocket;
      window.WebSocket = class extends OriginalWebSocket {
        override set onmessage(listener: ((event: MessageEvent) => void) | null) {
          super.onmessage = listener ? (event) => setTimeout(() => listener(event), 900) : null;
        }

        override get onmessage() {
          return super.onmessage;
        }
      };
    });
    await freshPage.goto(`/room/${roomId}`, { waitUntil: "domcontentloaded" });
    const freshMain = freshPage.locator("main");
    await expect(freshMain).toBeAttached();
    await expect(freshMain).not.toBeVisible();
    await expect(freshPage.locator("#app-boot")).toBeVisible();
    await expect(freshMain).toHaveClass(/theme-dracula/);
    await expect(freshMain).toBeVisible();
  } finally {
    await visitor.close();
  }
});
