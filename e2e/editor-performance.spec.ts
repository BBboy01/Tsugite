import { createProjectDoc, getFileByPath } from "@iris/shared";
import { expect, test } from "playwright/test";
import type { WorkspaceProfile } from "./workspace-profile-harness";

for (const lineCount of [500, 10_000]) {
  test(`records editing cost and bounds rendered rows for ${lineCount} lines`, async ({
    page,
  }, testInfo) => {
    const doc = createProjectDoc();
    const file = getFileByPath(doc, "src/App.tsx")!;
    file.text.delete(0, file.text.length);
    file.text.insert(
      0,
      Array.from(
        { length: lineCount },
        (_, index) => `export const value${index} = ${index}; // benchmark line ${index + 1}`,
      ).join("\n"),
    );
    doc.commit();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      if (window === window.top) localStorage.setItem("iris.language", "en");
    });
    await page.route(/\/src\/main\.tsx(?:\?.*)?$/, (route) =>
      route.fulfill({
        contentType: "application/javascript",
        // Exercise Vite's cache-busted entry path even when this run starts cold.
        body: new URL(route.request().url()).search
          ? `import ${JSON.stringify(`/@fs/${import.meta.dirname}/workspace-profile-harness.tsx`)};`
          : 'import "/src/main.tsx?workspace-profile";',
      }),
    );
    await page.route("**/src/lib/webcontainer-runtime.ts*", (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: `export class WebContainerRuntime {
        async start(files, folders, listener) { listener({ type: "state", state: "paused" }); }
        async restart(...args) { return this.start(...args); }
        async sync() { return { packageChanged: false }; }
        async syncChangedFiles() { return { packageChanged: false }; }
        dispose() {}
      }`,
      }),
    );
    await page.routeWebSocket("**/ws/**", (socket) =>
      socket.onMessage((message) => {
        if (typeof message !== "string") {
          doc.import(new Uint8Array(message));
          socket.send(JSON.stringify({ type: "update:ack" }));
          return;
        }
        const payload = JSON.parse(message) as { type: string; roomId?: string };
        if (payload.type === "join") {
          socket.send(JSON.stringify({ type: "ready", roomId: payload.roomId }));
          socket.send(Buffer.from(doc.export({ mode: "snapshot" })));
          socket.send(JSON.stringify({ type: "presence:list", members: [] }));
        }
      }),
    );
    try {
      await page.goto(`/room/editor-benchmark-${lineCount}-${crypto.randomUUID()}`, {
        waitUntil: "domcontentloaded",
      });
      await expect
        .poll(() => page.evaluate(() => window.workspaceProfile?.commits.length ?? 0))
        .toBeGreaterThan(0);
      const editor = page.locator(".cm-content");
      await expect(editor).toBeFocused();
      await expect(editor).toContainText("benchmark line 1");
      await expect(
        page.getByRole("region", { name: "Live preview" }).getByText("paused", { exact: true }),
      ).toBeVisible();
      await page.keyboard.press("Shift+F10");
      await expect(
        page.getByRole("menuitem", { name: "Go to definition", exact: true }),
      ).toBeEnabled();
      await page.keyboard.press("Escape");
      await expect(editor).toBeFocused();
      await page.keyboard.press("ControlOrMeta+End");
      await expect(editor).toContainText(`benchmark line ${lineCount}`);
      await expect(editor.locator(".cm-activeLine span[style*='color:']").first()).toBeVisible();
      await page.evaluate(() => {
        window.workspaceProfile = { commits: [], inputFrames: [] };
      });
      const profiler = await page.context().newCDPSession(page);
      await profiler.send("Profiler.enable");
      await profiler.send("Profiler.start");
      const marker = " measured typing";
      await editor.pressSequentially(marker, { delay: 20 });
      await expect(editor).toContainText(`benchmark line ${lineCount}${marker}`);
      await expect
        .poll(() => getFileByPath(doc, "src/App.tsx")!.text.toString().endsWith(marker))
        .toBe(true);
      await expect
        .poll(() => page.evaluate(() => window.workspaceProfile.inputFrames.length))
        .toBe(marker.length);
      const { profile: cpuProfile } = await profiler.send("Profiler.stop");
      await profiler.detach();
      await testInfo.attach("editor-typing.cpuprofile", {
        body: JSON.stringify(cpuProfile),
        contentType: "application/json",
      });
      const hotspots = cpuProfile.nodes
        .filter((node) => (node.hitCount ?? 0) > 0)
        .toSorted((a, b) => (b.hitCount ?? 0) - (a.hitCount ?? 0))
        .slice(0, 10)
        .map(({ callFrame, hitCount }) => ({
          functionName: callFrame.functionName,
          url: callFrame.url,
          hitCount,
        }));
      console.info("EDITOR_HOTSPOTS", JSON.stringify({ lineCount, hotspots }));
      const metrics = await page.evaluate(() => {
        const profile: WorkspaceProfile = window.workspaceProfile;
        const latencies = profile.inputFrames.toSorted((a, b) => a - b);
        const scroller = document.querySelector<HTMLElement>(".cm-scroller")!;
        return {
          inputCount: latencies.length,
          inputFrameP50Ms: latencies[Math.floor(latencies.length * 0.5)],
          inputFrameP95Ms: latencies[Math.floor(latencies.length * 0.95)],
          reactCommits: profile.commits.length,
          reactRenderTotalMs: profile.commits.reduce(
            (total, commit) => total + commit.actualDuration,
            0,
          ),
          reactRenderMaxMs: Math.max(0, ...profile.commits.map((commit) => commit.actualDuration)),
          renderedLines: document.querySelectorAll(".cm-line").length,
          pageHeight: document.documentElement.scrollHeight,
          viewportHeight: innerHeight,
          editorHeight: scroller.clientHeight,
          editorScrollHeight: scroller.scrollHeight,
        };
      });
      expect(metrics.reactCommits).toBeGreaterThan(0);
      expect(metrics.renderedLines).toBeGreaterThan(0);
      expect(metrics.renderedLines).toBeLessThan(200);
      expect(metrics.pageHeight).toBe(metrics.viewportHeight);
      expect(metrics.editorScrollHeight).toBeGreaterThan(metrics.editorHeight);
      await expect(page).toHaveTitle("Tsugite multiplayer editor");
      await expect(page.locator("vite-error-overlay")).toHaveCount(0);
      expect(errors).toEqual([]);
      console.info("EDITOR_BENCHMARK", JSON.stringify({ lineCount, ...metrics }));
      await testInfo.attach("editor-benchmark.json", {
        body: JSON.stringify({ lineCount, ...metrics }, null, 2),
        contentType: "application/json",
      });
      const symbol = `value${lineCount - 1}`;
      await editor
        .locator(".cm-activeLine")
        .getByText(symbol, { exact: true })
        .click({ button: "right" });
      const queryStarted = performance.now();
      await page.getByRole("menuitem", { name: "Go to definition", exact: true }).click();
      await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe(symbol);
      const firstDefinitionMs = performance.now() - queryStarted;
      console.info("EDITOR_FIRST_DEFINITION", JSON.stringify({ lineCount, firstDefinitionMs }));
      await testInfo.attach("editor-first-definition.json", {
        body: JSON.stringify({ lineCount, firstDefinitionMs }, null, 2),
        contentType: "application/json",
      });
      await page.screenshot({ path: testInfo.outputPath("long-editor.png") });
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(editor).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight)).toBe(844);
      await expect.poll(() => page.locator(".cm-line").count()).toBeLessThan(200);
      await expect(editor.locator(".cm-activeLine span[style*='color:']").first()).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath("long-editor-narrow.png") });
    } finally {
      await page.close();
      doc.free();
    }
  });
}
