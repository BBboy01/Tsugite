import type { BrowserContext, Page } from "playwright/test";

export async function usePausedPreview(target: BrowserContext | Page) {
  await target.route("**/src/lib/webcontainer-runtime.ts*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `export class WebContainerRuntime {
        async start(files, folders, onEvent) { onEvent({ type: "state", state: "paused" }); }
        async restart(...args) { return this.start(...args); }
        async sync() { return { packageChanged: false }; }
        async syncChangedFiles() { return this.sync(); }
        dispose() {}
      }`,
    }),
  );
}
