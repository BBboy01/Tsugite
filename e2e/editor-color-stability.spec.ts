import { expect, test } from "playwright/test";

test("opening a file does not recolor code after worker highlighting arrives", async ({ page }) => {
  await page.addInitScript(() => {
    if (window === window.top) localStorage.setItem("iris.language", "en");
    const OriginalWorker = window.Worker;
    window.Worker = class extends OriginalWorker {
      private readonly isShiki: boolean;

      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.isShiki = String(url).includes("shiki.worker");
      }

      override set onmessage(listener: ((event: MessageEvent) => void) | null) {
        super.onmessage =
          this.isShiki && listener ? (event) => setTimeout(() => listener(event), 800) : listener;
      }

      override get onmessage() {
        return super.onmessage;
      }
    };
  });

  await page.goto(`/room/editor-color-${crypto.randomUUID()}`);
  await expect(page.locator(".cm-shiki").first()).toBeVisible();
  await page.getByRole("treeitem", { name: "main.tsx", exact: true }).click();

  const editorHost = page.locator(".cm-editor").locator("..");
  const keyword = page.locator(".cm-line").first().getByText("import", { exact: true });
  await expect(editorHost).toHaveCSS("opacity", "0");
  await expect(page.locator(".cm-shiki")).toHaveCount(0);
  await expect(page.locator(".cm-shiki").first()).toBeVisible();
  await expect(editorHost).toHaveCSS("opacity", "1");
  await expect(keyword).toHaveCSS("color", "rgb(30, 117, 79)");
});
