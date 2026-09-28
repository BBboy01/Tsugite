import { createProjectDoc, getFileByPath } from "@iris/shared";
import { expect, test, type WebSocketRoute } from "playwright/test";

for (const initiallyLive of [false, true]) {
  test(`recovers the editor after a corrupt ${initiallyLive ? "update" : "snapshot"}`, async ({
    page,
  }, testInfo) => {
    const remote = createProjectDoc();
    const file = getFileByPath(remote, "src/App.tsx")!;
    file.text.delete(0, file.text.length);
    file.text.insert(0, "export default function App() { return <div>Recovery</div>; }");
    remote.commit();
    const snapshot = Buffer.from(remote.export({ mode: "snapshot" }));
    const sockets: WebSocketRoute[] = [];
    const pending: Buffer[] = [];
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      if (window === window.top) localStorage.setItem("iris.language", "en");
    });
    await page.route("**/src/lib/webcontainer-runtime.ts*", (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: `export class WebContainerRuntime {
          async start(files, folders, listener) { listener({ type: "state", state: "paused" }); }
          async sync() { return { packageChanged: false }; }
          async syncChangedFiles() { return { packageChanged: false }; }
          dispose() {}
        }`,
      }),
    );
    await page.routeWebSocket("**/ws/**", (socket) => {
      socket.onMessage((message) => {
        if (typeof message !== "string") {
          pending.push(message);
        } else if (JSON.parse(message).type === "join") {
          sockets.push(socket);
          if (sockets.length === 1) {
            socket.send(initiallyLive ? snapshot : Buffer.from([1, 2, 3]));
          }
        }
      });
    });

    try {
      await page.goto(`/room/import-recovery-${crypto.randomUUID()}`);
      const editor = page.locator(".cm-content");
      const header = page.locator("header");
      if (initiallyLive) {
        await expect(editor).toBeFocused();
        await page.keyboard.press("ControlOrMeta+End");
        await page.keyboard.insertText(" // local edit");
        await expect(header.locator('[data-sync-pending="true"]')).toBeVisible();
        sockets[0]!.send(Buffer.from([1, 2, 3]));
      }

      await expect(header.getByRole("alert")).toBeVisible();
      await expect(header.locator('[data-status="live"]')).toHaveCount(0);
      await expect.poll(() => sockets.length).toBe(2);
      await expect(header.getByRole("alert")).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath("recovering.png") });
      if (initiallyLive) await expect(editor).toContainText("// local edit");

      // The unchanged snapshot produces no document event in the already-live case.
      sockets[1]!.send(snapshot);
      await expect(header.getByRole("alert")).toHaveCount(0);
      await expect(editor).toContainText("Recovery");
      if (initiallyLive) {
        await expect(editor).toContainText("// local edit");
        for (const update of pending) remote.import(new Uint8Array(update));
        sockets[1]!.send(JSON.stringify({ type: "update:ack" }));
        await expect(header.locator('[data-sync-pending="true"]')).toHaveCount(0);
        expect(file.text.toString()).toContain("// local edit");
      }
      await expect(header.locator('.live-dot[data-status="live"]')).toBeVisible();
      await expect(page.locator("vite-error-overlay")).toHaveCount(0);
      expect(errors).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath("recovered.png") });
    } finally {
      remote.free();
    }
  });
}
