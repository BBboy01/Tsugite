import { expect, test } from "playwright/test";

async function waitForHighlighting(page: import("playwright/test").Page) {
  await expect(page.locator(".cm-editor").locator("..")).toHaveCSS("opacity", "1");
}

async function rightClickText(page: import("playwright/test").Page, line: string, token: string) {
  const point = await page
    .locator(".cm-line")
    .filter({ hasText: line })
    .last()
    .evaluate((element, word) => {
      const start = element.textContent?.indexOf(word) ?? -1;
      if (start < 0) throw new Error(`Missing symbol ${word}`);
      const range = document.createRange();
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let offset = 0;
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const length = node.textContent?.length ?? 0;
        if (start >= offset && start + word.length <= offset + length) {
          range.setStart(node, start - offset);
          range.setEnd(node, start + word.length - offset);
          const rect = range.getBoundingClientRect();
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        }
        offset += length;
      }
      throw new Error(`Missing text node ${word}`);
    }, token);
  await page.mouse.click(point.x, point.y, { button: "right" });
}

async function hoverToken(page: import("playwright/test").Page, line: string, token: string) {
  const match = page
    .locator(".cm-line")
    .filter({ hasText: line })
    .last()
    .getByText(token, { exact: true })
    .first();
  await expect(match).toBeVisible();
  await match.scrollIntoViewIfNeeded();
  await match.evaluate(
    (element) =>
      new Promise<void>((resolve) => {
        let lastRect = "";
        let stableSince = performance.now();
        const started = stableSince;
        const check = () => {
          const bounds = element.getBoundingClientRect();
          const rect = [bounds.x, bounds.y, bounds.width, bounds.height].join(":");
          const now = performance.now();
          if (rect !== lastRect) {
            lastRect = rect;
            stableSince = now;
          }
          if (now - stableSince >= 400 || now - started >= 3000) resolve();
          else requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
      }),
  );
  await page.mouse.move(0, 0);
  await match.hover();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (window === window.top) localStorage.setItem("iris.language", "en");
  });
});

test("keeps editing while the worker loads and enables language navigation", async ({ page }) => {
  const release = Promise.withResolvers<void>();
  const requested = Promise.withResolvers<void>();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/src/lib/typescript.worker.ts*", async (route) => {
    requested.resolve();
    await release.promise;
    await route.continue();
  });
  try {
    await page.goto(`/room/language-delay-${crypto.randomUUID()}`, {
      waitUntil: "domcontentloaded",
    });
    await requested.promise;
    await expect(page.getByText("Waiting for the room snapshot…")).toBeHidden();
    const content = page.locator(".cm-content");
    await expect(content).toBeFocused();
    await waitForHighlighting(page);
    await page.locator(".cm-editor").evaluate((element) => {
      element.setAttribute("data-test-editor-instance", "original");
    });
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.insertText("const answer = 42;");
    await page.keyboard.press("Enter");
    await page.keyboard.insertText("console.log(answer);");
    await rightClickText(page, "console.log(answer)", "answer");
    const definition = page.getByRole("menuitem", { name: "Go to definition", exact: true });
    await expect(definition).toBeDisabled();
    await expect(page.getByRole("menuitem", { name: "Select all", exact: true })).toBeEnabled();
    release.resolve();
    await expect(definition).toBeEnabled({ timeout: 15_000 });
    await definition.click();
    await expect(page.locator(".cm-activeLine")).toHaveText("const answer = 42;");
    await expect(content).toBeFocused();
    await expect(page.locator(".cm-editor")).toHaveAttribute(
      "data-test-editor-instance",
      "original",
    );
    await expect(page.locator("vite-error-overlay")).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    release.resolve();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("keeps editing and collaboration available when worker construction fails", async ({
  page,
  browser,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    window.Worker = class extends OriginalWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        if (String(url).includes("typescript.worker")) throw new Error("worker blocked");
        super(url, options);
      }
    };
  });
  const room = `/room/language-failure-${crypto.randomUUID()}`;
  await page.goto(room, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Waiting for the room snapshot…")).toBeHidden();
  const content = page.locator(".cm-content");
  await expect(content).toBeFocused();
  await waitForHighlighting(page);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText("const survives = 42;\nconsole.log(survives);");
  await rightClickText(page, "console.log(survives)", "survives");
  await expect(page.getByText("Using local language services", { exact: true })).toBeVisible();
  await page.getByRole("menuitem", { name: "Go to definition", exact: true }).click();
  await expect(page.locator(".cm-activeLine")).toHaveText("const survives = 42;");
  await expect(content).toBeFocused();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText(
    "const survives = 42;\nconsole.log(survives);\n// collaboration remains available",
  );
  await expect(content).toContainText("// collaboration remains available");

  const peer = await browser.newPage();
  try {
    await peer.goto(room, { waitUntil: "domcontentloaded" });
    await expect
      .poll(() =>
        peer.locator(".cm-content").evaluate((element) => {
          const clone = element.cloneNode(true) as HTMLElement;
          clone.querySelectorAll(".cm-remote-cursor-label").forEach((label) => label.remove());
          return [...clone.querySelectorAll(".cm-line")]
            .map((line) => line.textContent ?? "")
            .join("\n");
        }),
      )
      .toBe("const survives = 42;\nconsole.log(survives);\n// collaboration remains available");
    await expect(page).toHaveTitle(/Tsugite/i);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.screenshot({ path: testInfo.outputPath("language-fallback-desktop.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(content).toBeVisible();
    await expect(content).toContainText("// collaboration remains available");
    await expect(page.getByText("Using local language services", { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("language-fallback-narrow.png") });
    await expect(page.locator("vite-error-overlay")).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await peer.close();
  }
});

test("reuses one language worker across file switches in a room", async ({ page }) => {
  const workers: string[] = [];
  await page.route("**/src/lib/typescript-intelligence.ts*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: `${await response.text()}\nif (typeof document !== "undefined") window.mainThreadCompilerEvaluated = true;`,
    });
  });
  page.on("worker", (worker) => {
    if (worker.url().includes("typescript.worker")) workers.push(worker.url());
  });
  await page.goto(`/room/language-switch-${crypto.randomUUID()}`);
  await expect(page.locator(".cm-content")).toBeFocused();
  await waitForHighlighting(page);
  await expect
    .poll(() => page.workers().some((worker) => worker.url().includes("typescript.worker")))
    .toBe(true);
  await page.getByRole("treeitem", { name: "index.html", exact: true }).click();
  await expect(page.locator(".cm-content")).toBeFocused();
  await page.getByRole("tab", { name: "src/App.tsx", exact: true }).click();
  await expect(page.locator(".cm-content")).toBeFocused();
  expect(workers).toHaveLength(1);
  expect(
    await page.evaluate(
      () =>
        (window as Window & { mainThreadCompilerEvaluated?: boolean }).mainThreadCompilerEvaluated,
    ),
  ).toBeUndefined();
});

test("serves completion and diagnostics from the room worker", async ({ page }) => {
  await page.goto(`/room/language-providers-${crypto.randomUUID()}`);
  const content = page.locator(".cm-content");
  await expect(content).toBeFocused();
  await waitForHighlighting(page);
  await expect
    .poll(() => page.workers().some((worker) => worker.url().includes("typescript.worker")))
    .toBe(true);

  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText("con");
  await page.keyboard.press("ControlOrMeta+Space");
  await expect(page.locator(".cm-tooltip-autocomplete")).toContainText("console");
  await page.getByRole("option", { name: "console", exact: true }).click();
  await expect(page.locator(".cm-line")).toHaveText("console");

  await page.keyboard.press("Escape");
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText('const count: number = "wrong";');
  await expect(page.locator(".cm-lintRange-error")).toHaveCount(1, { timeout: 15_000 });
});

test("shows signature help for a function argument through the room worker", async ({ page }) => {
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    window.Worker = class extends OriginalWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener("message", (event: MessageEvent) => {
          const replies = ((window as Window & { workerReplies?: unknown[] }).workerReplies ??= []);
          replies.push(event.data);
        });
      }
      postMessage(
        message: unknown,
        transferOrOptions?: Transferable[] | StructuredSerializeOptions,
      ) {
        const requests = ((window as Window & { workerRequests?: unknown[] }).workerRequests ??=
          []);
        requests.push(message);
        if (Array.isArray(transferOrOptions)) super.postMessage(message, transferOrOptions);
        else super.postMessage(message, transferOrOptions);
      }
    };
  });
  await page.goto(`/room/language-signature-${crypto.randomUUID()}`);
  await expect(page.getByText("Waiting for the room snapshot…")).toBeHidden();
  const content = page.locator(".cm-content");
  await expect(content).toBeFocused();
  await waitForHighlighting(page);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText(
    "function add(a: number, b: number) { return a + b; }\nadd(1, 2);",
  );
  await expect(page.locator(".cm-tooltip-autocomplete")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as Window & { workerRequests?: { method?: string }[] }).workerRequests?.some(
          (request) => request.method === "diagnostics",
        ),
      ),
    )
    .toBe(true);
  await expect(page.locator(".cm-line").last().locator(".cm-shiki").first()).toBeVisible();
  await hoverToken(page, "add(1, 2)", "1");
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as Window & {
            workerRequests?: {
              kind: string;
              method?: string;
              query?: { position?: number };
            }[];
          }
        ).workerRequests?.some(
          (request) => request.kind === "query" && request.method === "signatureHelp",
        ),
      ),
    )
    .toBe(true);
  const expectedPosition =
    "function add(a: number, b: number) { return a + b; }\nadd(1, 2);".indexOf("add(1, 2)") + 4;
  await expect
    .poll(() =>
      page.evaluate((position) => {
        const state = window as Window & {
          workerRequests?: {
            kind: string;
            method?: string;
            requestId: string;
            query?: { position?: number };
          }[];
          workerReplies?: { requestId: string; result?: { status?: string } }[];
        };
        const request = state.workerRequests?.find(
          (item) =>
            item.kind === "query" &&
            item.method === "signatureHelp" &&
            item.query?.position === position,
        );
        if (!request) return "not-requested";
        return (
          state.workerReplies?.find((reply) => reply.requestId === request.requestId)?.result
            ?.status ?? "pending"
        );
      }, expectedPosition),
    )
    .toBe("ok");
  const signature = page.locator(".iris-ts-signature");
  await expect(signature).toBeVisible({ timeout: 15_000 });
  await expect(signature).toContainText("add");
});
