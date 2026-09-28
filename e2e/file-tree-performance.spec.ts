import { createFile, createProjectDoc, listFiles } from "@iris/shared";
import { expect, test } from "playwright/test";

const GENERATED_FILE_COUNT = 5_000;
const MAX_RENDERED_ROWS = 100;

function createProjectSnapshot(generatedFileCount: number): {
  bytes: Uint8Array;
  fileCount: number;
} {
  const doc = createProjectDoc();
  for (let index = 0; index < generatedFileCount; index += 1) {
    createFile(doc, `src/generated/file-${index}.tsx`, "typescript");
  }
  doc.commit();
  const snapshot = { bytes: doc.export({ mode: "snapshot" }), fileCount: listFiles(doc).length };
  doc.free();
  return snapshot;
}

test("records file tree mount cost for a large room snapshot", async ({ page }, testInfo) => {
  const projects = [createProjectSnapshot(0), createProjectSnapshot(GENERATED_FILE_COUNT)];
  let currentProject = projects[0];
  await page.addInitScript(() => {
    localStorage.setItem("iris.language", "en");
    performance.clearMarks("file-tree-benchmark-start");
    performance.mark("file-tree-benchmark-start");
  });
  await page.routeWebSocket("**/ws/**", (socket) => {
    socket.onMessage((message) => {
      if (typeof message !== "string") return;
      const payload = JSON.parse(message) as { type?: string; roomId?: string };
      if (payload.type === "join") {
        socket.send(JSON.stringify({ type: "ready", roomId: payload.roomId }));
        socket.send(Buffer.from(currentProject.bytes));
        socket.send(JSON.stringify({ type: "presence:list", members: [] }));
      } else if (payload.type === "presence") {
        socket.send(JSON.stringify({ type: "presence:list", members: [payload] }));
      }
    });
  });

  const measurements = [];
  for (const [index, project] of projects.entries()) {
    currentProject = project;
    await page.goto(`/room/e2e-file-tree-benchmark-${index}-${Date.now()}`, {
      waitUntil: "domcontentloaded",
    });
    const tree = page.locator('aside[aria-label="Project files"]');
    const scroller = tree.locator("[data-total-rows]");
    const files = tree.locator('[data-context-kind="file"]');
    const renderedRows = tree.locator('[data-context-kind="file"], [data-context-kind="folder"]');
    await expect(scroller).toHaveAttribute("data-total-rows", /\d+/, { timeout: 30_000 });
    await expect(files.first()).toBeVisible();
    if (index === 1) {
      await expect
        .poll(async () => Number(await scroller.getAttribute("data-total-rows")))
        .toBeGreaterThan(GENERATED_FILE_COUNT);
      await expect.poll(() => renderedRows.count()).toBeLessThan(MAX_RENDERED_ROWS);
    }
    const metrics = await page.evaluate(() => ({
      startupMs:
        performance.now() - performance.getEntriesByName("file-tree-benchmark-start")[0].startTime,
      fileNodes: document.querySelectorAll(
        'aside[aria-label="Project files"] [data-context-kind="file"]',
      ).length,
      folderNodes: document.querySelectorAll(
        'aside[aria-label="Project files"] [data-context-kind="folder"]',
      ).length,
      totalRows: Number(
        document.querySelector("[data-total-rows]")?.getAttribute("data-total-rows"),
      ),
    }));
    measurements.push({ generatedFiles: index === 0 ? 0 : GENERATED_FILE_COUNT, ...metrics });
    if (index === 1) {
      await scroller.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await expect(
        tree.locator('[data-context-path="src/generated/file-999.tsx"]'),
      ).toBeInViewport();
      await expect.poll(() => renderedRows.count()).toBeLessThan(MAX_RENDERED_ROWS);
    }
  }
  console.info("FILE_TREE_BENCHMARK", JSON.stringify(measurements));
  await testInfo.attach("file-tree-benchmark.json", {
    body: JSON.stringify(measurements, null, 2),
    contentType: "application/json",
  });
});
