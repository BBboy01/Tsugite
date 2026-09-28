import { expect, test } from "playwright/test";

for (const outcome of ["exit", "rejection"] as const) {
  test(`reports preview process ${outcome} and restarts without interrupting editing`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.addInitScript(() => {
      if (window === window.top) localStorage.setItem("iris.language", "en");
    });
    await page.route("**/__preview-process-fixture", (route) =>
      route.fulfill({
        contentType: "text/html",
        headers: {
          "Cross-Origin-Embedder-Policy": "require-corp",
          "Cross-Origin-Resource-Policy": "cross-origin",
        },
        body: "<main>Preview process running</main>",
      }),
    );
    await page.route("**/@webcontainer_api.js*", (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: `export class WebContainer {
        static async boot() {
          const listeners = new Map();
          return {
            fs: { mkdir: async () => "", writeFile: async () => {}, rm: async () => {} },
            mount: async () => {},
            on(event, listener) {
              listeners.set(event, listener);
              return () => listeners.delete(event);
            },
            async spawn(command, args) {
              const output = new ReadableStream({ start(controller) { controller.close(); } });
              if (args[0] === "install") return { output, exit: Promise.resolve(0), kill() {} };
              const exit = Promise.withResolvers();
              window.stopPreviewProcess = () => ${outcome === "rejection" ? 'exit.reject(new Error("process connection lost"))' : "exit.resolve(1)"};
              queueMicrotask(() => listeners.get("server-ready")?.(
                4173, "http://preview.test/__preview-process-fixture"
              ));
              return { output, exit: exit.promise, kill: () => exit.resolve(143) };
            },
            teardown() { listeners.clear(); }
          };
        }
      }`,
      }),
    );

    await page.goto(`/room/preview-process-${outcome}-${crypto.randomUUID()}`);
    const preview = page.getByRole("region", { name: "Live preview" });
    const iframe = page.frameLocator('iframe[title^="Preview of "]');
    await expect(iframe.locator("body")).toContainText("Preview process running");
    await expect(preview.getByRole("alert")).toHaveCount(0);
    await expect(preview.getByRole("status")).toHaveCount(0);
    await page.evaluate(() => {
      (window as typeof window & { stopPreviewProcess: () => void }).stopPreviewProcess();
    });
    const alert = preview.getByRole("alert");
    await expect(alert).toContainText(
      outcome === "rejection"
        ? "WebContainer is unavailable in this browser."
        : "The preview server stopped. Restart it to continue.",
    );
    await expect(page.locator('iframe[title^="Preview of "]')).not.toHaveAttribute(
      "src",
      "http://preview.test/__preview-process-fixture",
    );
    await page.screenshot({ path: testInfo.outputPath("preview-process-stopped.png") });
    const editor = page.locator(".cm-content");
    await editor.focus();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.insertText("\n// Editing remains available after process exit\n");
    await expect(editor).toContainText("Editing remains available after process exit");
    await alert.getByRole("button", { name: "Restart preview runtime", exact: true }).click();
    await expect(alert).toHaveCount(0);
    await expect(iframe.locator("body")).toContainText("Preview process running");
    await expect(preview.getByRole("status")).toHaveCount(0);
    await expect(page.locator("vite-error-overlay")).toHaveCount(0);
    await expect(page).toHaveTitle("Tsugite multiplayer editor");
    await page.screenshot({ path: testInfo.outputPath("preview-process-restarted.png") });
    expect(errors).toEqual([]);
  });
}
