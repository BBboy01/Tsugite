import { expect, test } from "playwright/test";

test("opening a file does not recolor code after worker highlighting arrives", async ({ page }) => {
  await page.addInitScript(() => {
    if (window === window.top) localStorage.setItem("iris.language", "en");
    const OriginalWorker = window.Worker;
    window.Worker = class extends OriginalWorker {
      private readonly isHighlights: boolean;

      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.isHighlights = String(url).includes("highlights.worker");
      }

      override set onmessage(listener: ((event: MessageEvent) => void) | null) {
        super.onmessage =
          this.isHighlights && listener
            ? (event) => setTimeout(() => listener(event), 800)
            : listener;
      }

      override get onmessage() {
        return super.onmessage;
      }
    };
  });

  await page.goto(`/room/editor-color-${crypto.randomUUID()}`);
  await expect(page.locator('[data-editor-content-ready="true"]')).toBeVisible();
  await page.getByRole("treeitem", { name: "main.tsx", exact: true }).click();

  const editorScroller = page.locator(".cm-scroller");
  const keyword = page.locator(".cm-line").first().getByText("import", { exact: true });
  const editorColor = await page
    .locator(".cm-content")
    .evaluate((element) => getComputedStyle(element).color);
  await expect(editorScroller).toHaveCSS("opacity", "1");
  await expect(keyword).toBeVisible();
  await expect(page.locator('[data-editor-content-ready="true"]')).toBeVisible();
  await expect(editorScroller).toHaveCSS("opacity", "1");
  await expect(keyword).not.toHaveCSS("color", editorColor);
});
