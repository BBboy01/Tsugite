import { expect, test, type Page } from "playwright/test";

type WorkerRequestRecord = {
  workerIndex: number;
  data: {
    kind?: string;
    requestId?: string;
    files?: { text: string }[];
    changes?: { text: string }[];
  };
};

async function observeTypeScriptWorkers(page: Page) {
  await page.addInitScript(() => {
    const state = window as Window & {
      typeScriptWorkers?: Worker[];
      typeScriptWorkerRequests?: WorkerRequestRecord[];
      typeScriptWorkerReplies?: {
        workerIndex: number;
        data: { requestId?: string; result?: { status?: string } };
      }[];
    };
    state.typeScriptWorkers = [];
    state.typeScriptWorkerRequests = [];
    state.typeScriptWorkerReplies = [];
    const workerIndexes = new WeakMap<Worker, number>();
    const OriginalWorker = window.Worker;
    window.Worker = class extends OriginalWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (!String(url).includes("typescript.worker")) return;
        const workerIndex = state.typeScriptWorkers!.push(this) - 1;
        workerIndexes.set(this, workerIndex);
        this.addEventListener("message", (event: MessageEvent) => {
          state.typeScriptWorkerReplies!.push({ workerIndex, data: event.data });
        });
      }
      postMessage(message: unknown, transfer?: Transferable[] | StructuredSerializeOptions) {
        const workerIndex = workerIndexes.get(this);
        if (workerIndex !== undefined)
          state.typeScriptWorkerRequests!.push({
            workerIndex,
            data: structuredClone(message) as WorkerRequestRecord["data"],
          });
        if (Array.isArray(transfer)) super.postMessage(message, transfer);
        else super.postMessage(message, transfer);
      }
    };
  });
}

async function expectTypeScriptWorkerReady(page: Page, workerIndex: number) {
  await expect
    .poll(() =>
      page.evaluate((index) => {
        const state = window as Window & {
          typeScriptWorkerRequests?: WorkerRequestRecord[];
          typeScriptWorkerReplies?: {
            workerIndex: number;
            data: { requestId?: string; result?: { status?: string } };
          }[];
        };
        const initialize = state.typeScriptWorkerRequests?.find(
          ({ workerIndex: recordWorkerIndex, data }) =>
            recordWorkerIndex === index && data.kind === "initialize",
        );
        return state.typeScriptWorkerReplies?.some(
          ({ workerIndex: recordWorkerIndex, data }) =>
            recordWorkerIndex === index &&
            data.requestId === initialize?.data.requestId &&
            data.result?.status === "ok",
        );
      }, workerIndex),
    )
    .toBe(true);
}

async function expectWorkerRequest(page: Page, expectedText: string) {
  await expect
    .poll(() =>
      page.evaluate((expected) => {
        const state = window as Window & { typeScriptWorkerRequests?: WorkerRequestRecord[] };
        return state.typeScriptWorkerRequests?.some(
          ({ workerIndex: recordWorkerIndex, data }) =>
            recordWorkerIndex === 0 &&
            data.kind === "update" &&
            data.changes?.some(({ text: changeText }) => changeText.includes(expected)) === true,
        );
      }, expectedText),
    )
    .toBe(true);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (window === window.top) localStorage.setItem("iris.language", "en");
  });
});

test("rebuilds a crashed worker from the latest edit and then disables language services", async ({
  page,
}) => {
  await observeTypeScriptWorkers(page);
  const retryRequested = Promise.withResolvers<void>();
  const releaseRetry = Promise.withResolvers<void>();
  let workerEntries = 0;
  await page.route("**/src/lib/typescript.worker.ts*", async (route) => {
    workerEntries++;
    const response = await route.fetch();
    const source = await response.text();
    if (workerEntries === 2) {
      retryRequested.resolve();
      await releaseRetry.promise;
    }
    await route.fulfill({
      response,
      body: `${source}
const testHandler = self.onmessage;
self.onmessage = (event) => {
  if (event.data?.kind === "test-crash") {
    setTimeout(() => { throw new Error("forced worker failure"); });
    return;
  }
  testHandler?.call(self, event);
};`,
    });
  });

  try {
    await page.goto(`/room/language-worker-restart-${crypto.randomUUID()}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByText("Waiting for the room snapshot…")).toBeHidden();
    const content = page.locator(".cm-content");
    await expect(content).toBeFocused();
    await expectTypeScriptWorkerReady(page, 0);

    const latestSource = 'const latest = { marker: "recovered" };\nlatest.';
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.insertText(latestSource);
    await expectWorkerRequest(page, 'marker: "recovered"');

    await page.evaluate(() => {
      const state = window as Window & { typeScriptWorkers?: Worker[] };
      state.typeScriptWorkers?.[0]?.postMessage({ kind: "test-crash" });
    });
    await retryRequested.promise;
    releaseRetry.resolve();
    await expectTypeScriptWorkerReady(page, 1);
    expect(
      await page.evaluate(() => {
        const state = window as Window & { typeScriptWorkerRequests?: WorkerRequestRecord[] };
        return state.typeScriptWorkerRequests?.some(
          ({ workerIndex, data }) =>
            workerIndex === 1 &&
            data.kind === "initialize" &&
            data.files?.some(({ text }) => text.includes('marker: "recovered"')) === true,
        );
      }),
    ).toBe(true);

    await page.keyboard.press("Control+Space");
    await expect(page.getByRole("option", { name: "marker", exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        () => (window as Window & { typeScriptWorkers?: Worker[] }).typeScriptWorkers?.length,
      ),
    ).toBe(2);

    await page.keyboard.press("Escape");
    await expect(content).toBeFocused();
    await page.evaluate(() => {
      const state = window as Window & { typeScriptWorkers?: Worker[] };
      state.typeScriptWorkers?.[1]?.postMessage({ kind: "test-crash" });
    });
    await expect(page.locator('[data-typescript-service-state="unavailable"]')).toHaveCount(1, {
      timeout: 15_000,
    });
    await expect(content).toBeFocused();
    await page.keyboard.insertText(" marker");
    await expect(content).toContainText("latest. marker");
  } finally {
    releaseRetry.resolve();
    await page.unrouteAll({ behavior: "wait" });
  }
});
