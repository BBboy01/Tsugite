import { expect, test } from "playwright/test";

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() => localStorage.setItem("iris.language", "en"));
  await page.goto(`/room/panel-motion-${crypto.randomUUID()}`);
  await expect(page.locator(".cm-content")).toBeVisible();
});

for (const side of ["files", "preview"] as const) {
  test(`Keyboard resizing keeps the ${side} boundary aligned on every frame`, async ({ page }) => {
    const separator = page.getByRole("separator", {
      name: side === "files" ? "Resize files and editor" : "Resize editor and preview",
      exact: true,
    });
    const initialWidth = Number(await separator.getAttribute("aria-valuenow"));
    await separator.focus();

    for (const key of ["ArrowRight", "ArrowLeft"] as const) {
      const expectedWidth =
        initialWidth + (key === "ArrowRight" ? (side === "files" ? 16 : -16) : 0);
      await page.keyboard.down(key);
      const frames = await page.evaluate(async (panel) => {
        const header = document.querySelector<HTMLElement>("[data-header-files-region]")!;
        const files = document.querySelector<HTMLElement>('[data-panel="files"]')!;
        const content = document.querySelector<HTMLElement>(".workspace-files-content")!;
        const preview = document.querySelector<HTMLElement>('[data-panel="preview"]')!;
        const editor = document.querySelector<HTMLElement>('[data-panel="editor"]')!;
        const handle = document.querySelector<HTMLElement>(`[data-resize-side="${panel}"]`)!;
        const samples: Array<{
          panelWidth: number;
          headerWidth: number;
          filesWidth: number;
          contentWidth: number;
          boundaryError: number;
        }> = [];
        for (let frame = 0; frame < 6; frame += 1) {
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          const filesBox = files.getBoundingClientRect();
          const previewBox = preview.getBoundingClientRect();
          const handleBox = handle.getBoundingClientRect();
          const boundary = panel === "files" ? filesBox.right : previewBox.left;
          const editorBoundary =
            panel === "files"
              ? editor.getBoundingClientRect().left
              : editor.getBoundingClientRect().right;
          samples.push({
            panelWidth: panel === "files" ? filesBox.width : previewBox.width,
            headerWidth: header.getBoundingClientRect().width,
            filesWidth: filesBox.width,
            contentWidth: content.getBoundingClientRect().width,
            boundaryError: Math.max(
              Math.abs(handleBox.left + handleBox.width / 2 - boundary),
              Math.abs(editorBoundary - boundary),
            ),
          });
        }
        return samples;
      }, side);
      await page.keyboard.up(key);

      expect(frames).toHaveLength(6);
      for (const frame of frames) {
        expect(frame.panelWidth).toBeCloseTo(expectedWidth, 0);
        expect(Math.abs(frame.headerWidth - frame.filesWidth)).toBeLessThan(1);
        expect(Math.abs(frame.contentWidth - frame.filesWidth)).toBeLessThan(1);
        expect(frame.boundaryError).toBeLessThan(1);
      }
      await expect(separator).toHaveAttribute("aria-valuenow", String(expectedWidth));
    }

    await page.getByRole("button", { name: "Collapse files panel", exact: true }).click();
    const collapseFrames = await page.evaluate(async () => {
      const files = document.querySelector<HTMLElement>('[data-panel="files"]')!;
      const content = document.querySelector<HTMLElement>(".workspace-files-content")!;
      const width = content.getBoundingClientRect().width;
      const frames: number[] = [];
      const start = performance.now();
      while (performance.now() - start < 320) {
        frames.push(files.getBoundingClientRect().width / width);
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
      return frames;
    });
    expect(collapseFrames.some((ratio) => ratio > 0.05 && ratio < 0.95)).toBe(true);
    await expect
      .poll(() =>
        page.locator('[data-panel="files"]').evaluate((el) => el.getBoundingClientRect().width),
      )
      .toBeLessThan(1);
  });
}

for (const finalState of ["expanded", "collapsed"] as const) {
  test(`Reversing an active transition preserves tree state and ends ${finalState}`, async ({
    page,
  }) => {
    const toggle = page.locator('button[aria-controls="workspace-files-panel"]');
    const files = page.locator('[data-panel="files"]');
    const folder = page.getByRole("treeitem", { name: "src folder", exact: true });
    const selectedFile = page.getByRole("treeitem", { name: "index.css", exact: true });
    const initialWidth = (await files.boundingBox())!.width;
    await selectedFile.click();
    await expect(folder).toHaveAttribute("aria-expanded", "true");
    await expect(selectedFile).toHaveAttribute("aria-selected", "true");
    const initialRowCount = await files.locator('[role="treeitem"]').count();

    if (finalState === "collapsed") {
      await toggle.click();
      await expect
        .poll(() => files.evaluate((el) => el.getBoundingClientRect().width))
        .toBeLessThan(1);
    }

    await toggle.click();
    const interrupted = await page.evaluate(async (width) => {
      const panel = document.querySelector<HTMLElement>('[data-panel="files"]')!;
      const button = document.querySelector<HTMLButtonElement>(
        'button[aria-controls="workspace-files-panel"]',
      )!;
      const start = performance.now();
      while (performance.now() - start < 1000) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const currentWidth = panel.getBoundingClientRect().width;
        if (currentWidth > width * 0.1 && currentWidth < width * 0.9) {
          const rows = panel.querySelectorAll('[role="treeitem"]').length;
          button.click();
          return { width: currentWidth, rows };
        }
      }
      return null;
    }, initialWidth);
    expect(interrupted).not.toBeNull();
    expect(interrupted!.width).toBeGreaterThan(0);
    expect(interrupted!.width).toBeLessThan(initialWidth);
    expect(interrupted!.rows).toBe(initialRowCount);

    const expanded = finalState === "expanded";
    await expect(toggle).toHaveAttribute("aria-expanded", String(expanded));
    await expect(files).toHaveAttribute("aria-hidden", String(!expanded));
    if (expanded) await expect(files).not.toHaveAttribute("inert");
    else await expect(files).toHaveAttribute("inert");
    await expect
      .poll(() =>
        page.evaluate(() => {
          const panel = document.querySelector<HTMLElement>('[data-panel="files"]')!;
          const content = document.querySelector<HTMLElement>(".workspace-files-content")!;
          const header = document.querySelector<HTMLElement>("[data-header-files-region]")!;
          return {
            width: panel.getBoundingClientRect().width,
            left: content.getBoundingClientRect().left,
            headerScale: new DOMMatrixReadOnly(getComputedStyle(header, "::before").transform).a,
          };
        }),
      )
      .toEqual({
        width: expanded ? initialWidth : 0,
        left: expanded ? 0 : -initialWidth,
        headerScale: expanded ? 1 : 0,
      });
    await expect(files.locator('[role="treeitem"]')).toHaveCount(initialRowCount);
    await expect(files.locator('[role="treeitem"][aria-selected="true"]')).toContainText(
      "index.css",
    );
    await expect(files.locator('[role="treeitem"][aria-expanded="true"]')).toContainText("src");
  });
}
