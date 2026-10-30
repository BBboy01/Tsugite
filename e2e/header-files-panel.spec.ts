import { expect, test } from "playwright/test";

test.use({ video: "on" });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("iris.language", "en"));
  await page.goto(`/room/tree-ui-${crypto.randomUUID()}`);
  await expect(page.locator(".cm-content")).toBeVisible();
});

test("Header file control keeps width, appearance, and tree state across collapse", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const header = page.locator("header.glass-header");
  const headerFiles = page.locator("[data-header-files-region]");
  const filesPanel = page.locator('[data-panel="files"]');
  const editorPanel = page.locator('[data-panel="editor"]');
  const workspaceGrid = page.locator(".workspace-layout-grid");
  const tree = page.locator('[role="tree"][aria-label="Project files"]');
  const toggle = page.getByRole("button", { name: "Collapse files panel", exact: true });

  await expect(page.locator('button[aria-controls="workspace-files-panel"]')).toHaveCount(1);
  await expect(toggle).toBeVisible();
  await expect(toggle).not.toHaveAttribute("title");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect
    .poll(() => toggle.evaluate((element) => getComputedStyle(element).backgroundColor))
    .not.toBe("rgba(0, 0, 0, 0)");
  const activeBackground = await toggle.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  await toggle.hover();
  await expect
    .poll(() => toggle.evaluate((element) => getComputedStyle(element).backgroundColor))
    .not.toBe(activeBackground);
  await headerFiles.hover({ position: { x: 10, y: 10 } });
  await expect(page.getByRole("heading", { name: "Tsugite", exact: true })).toBeVisible();
  await expect(page.getByText("v0.1.0", { exact: true })).toBeVisible();
  const identity = page.getByRole("heading", { name: "Tsugite", exact: true });
  const initialRegionBox = await headerFiles.boundingBox();
  const initialToggleBox = await toggle.boundingBox();
  const initialRightInset = await headerFiles.evaluate((region) => {
    const regionStyle = getComputedStyle(region);
    const button = region.querySelector("button[aria-controls='workspace-files-panel']");
    if (!button) return Number.POSITIVE_INFINITY;
    const buttonStyle = getComputedStyle(button);
    return (
      Number.parseFloat(regionStyle.paddingRight) +
      Number.parseFloat(regionStyle.borderRightWidth) +
      Number.parseFloat(buttonStyle.marginRight)
    );
  });
  expect(initialRegionBox).not.toBeNull();
  expect(initialToggleBox).not.toBeNull();
  expect((await identity.boundingBox())!.x).toBeLessThan(initialToggleBox!.x);
  expect(
    Math.abs(
      initialToggleBox!.x +
        initialToggleBox!.width -
        (initialRegionBox!.x + initialRegionBox!.width - initialRightInset),
    ),
  ).toBeLessThan(1);
  await expect
    .poll(async () => {
      const headerWidth = (await headerFiles.boundingBox())?.width;
      const panelWidth = (await filesPanel.boundingBox())?.width;
      return headerWidth !== undefined && panelWidth !== undefined
        ? Math.abs(headerWidth - panelWidth)
        : Number.POSITIVE_INFINITY;
    })
    .toBeLessThan(1);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const files = document.querySelector<HTMLElement>('[data-panel="files"]');
        const editor = document.querySelector<HTMLElement>('[data-panel="editor"] > div');
        if (!files || !editor) return false;
        const filesBackground = getComputedStyle(files).backgroundColor;
        return (
          filesBackground !== "rgba(0, 0, 0, 0)" &&
          filesBackground === getComputedStyle(editor).backgroundColor
        );
      }),
    )
    .toBe(true);
  const dividerAlignment = () =>
    page.evaluate(() => {
      const region = document.querySelector<HTMLElement>("[data-header-files-region]");
      const panel = document.querySelector<HTMLElement>("#workspace-files-panel");
      if (!region || !panel) return Number.POSITIVE_INFINITY;
      const regionBox = region.getBoundingClientRect();
      const panelBox = panel.getBoundingClientRect();
      const surfaceStyle = getComputedStyle(region, "::before");
      const transform = new DOMMatrixReadOnly(surfaceStyle.transform);
      const surfaceRight =
        regionBox.left +
        Number.parseFloat(surfaceStyle.left) +
        Number.parseFloat(surfaceStyle.width) * transform.a;
      return Math.abs(surfaceRight - panelBox.right);
    });
  await expect.poll(dividerAlignment).toBeLessThan(0.1);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const region = document.querySelector<HTMLElement>("[data-header-files-region]");
        const files = document.querySelector<HTMLElement>(
          '[data-panel="files"] > .workspace-files-content > div',
        );
        const sidebarElement = document.querySelector<HTMLElement>(
          '[aria-label="Project files"].glass-panel',
        );
        if (!region || !files || !sidebarElement) return false;
        const regionStyle = getComputedStyle(region);
        const surfaceStyle = getComputedStyle(region, "::before");
        const dividerStyle = getComputedStyle(region, "::after");
        const dividerColor = regionStyle.getPropertyValue("--divider").trim();
        return (
          regionStyle.backgroundColor === getComputedStyle(region.parentElement!).backgroundColor &&
          surfaceStyle.content !== "none" &&
          surfaceStyle.backgroundColor === getComputedStyle(files).backgroundColor &&
          surfaceStyle.backgroundImage ===
            `linear-gradient(${getComputedStyle(sidebarElement).backgroundColor}, ${getComputedStyle(sidebarElement).backgroundColor})` &&
          surfaceStyle.opacity === "1" &&
          new DOMMatrixReadOnly(surfaceStyle.transform).a === 1 &&
          surfaceStyle.transformOrigin.startsWith("0px") &&
          surfaceStyle.transitionProperty.includes("transform") &&
          surfaceStyle.transitionDuration === "0.26s" &&
          surfaceStyle.borderRightWidth === "1px" &&
          surfaceStyle.borderRightColor === dividerColor &&
          dividerStyle.content === "none"
        );
      }),
    )
    .toBe(true);
  await expect(workspaceGrid).toHaveCSS("transition-property", "grid-template-columns");
  await expect(workspaceGrid).toHaveCSS("transition-duration", "0.26s");
  await expect(workspaceGrid).toHaveCSS("transition-delay", "0s");
  await expect
    .poll(() =>
      headerFiles.evaluate((element) => getComputedStyle(element, "::before").transitionDelay),
    )
    .toBe("0s");

  const splitter = page.getByRole("separator", { name: "Resize files and editor", exact: true });
  const splitterBox = await splitter.boundingBox();
  expect(splitterBox).not.toBeNull();
  await page.mouse.move(splitterBox!.x + splitterBox!.width / 2, splitterBox!.y + 40);
  await page.mouse.down();
  await page.mouse.move(splitterBox!.x + splitterBox!.width / 2 + 48, splitterBox!.y + 40);
  await expect(workspaceGrid).toHaveCSS("transition-property", "none");
  await page.mouse.up();

  const expandedWidth = (await filesPanel.boundingBox())!.width;
  expect(expandedWidth).toBeGreaterThan(240);
  await expect
    .poll(async () => Math.abs((await headerFiles.boundingBox())!.width - expandedWidth))
    .toBeLessThan(1);

  const folder = page.getByRole("treeitem", { name: "src folder", exact: true });
  const stylesheet = page.getByRole("treeitem", { name: "index.css", exact: true });
  await stylesheet.click();
  await expect(folder).toHaveAttribute("aria-expanded", "true");
  await tree.evaluate((element) => {
    Object.assign((element as HTMLElement).style, { height: "96px", flex: "none" });
  });
  await tree.hover();
  await page.mouse.wheel(0, 64);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  const treeScrollTop = await tree.evaluate((element) => (element as HTMLElement).scrollTop);
  const toggleBox = await toggle.boundingBox();
  expect(toggleBox).not.toBeNull();
  const editorWidthBeforeCollapse = (await editorPanel.boundingBox())!.width;
  const headerSurfaceScale = () =>
    headerFiles.evaluate(
      (element) => new DOMMatrixReadOnly(getComputedStyle(element, "::before").transform).a,
    );
  const watchGridTransition = async () => {
    await workspaceGrid.evaluate((element) => {
      element.dataset.gridTransitionStarted = "false";
      const listener = (event: Event) => {
        if ((event as TransitionEvent).propertyName !== "grid-template-columns") return;
        element.dataset.gridTransitionStarted = "true";
        element.removeEventListener("transitionrun", listener);
      };
      element.addEventListener("transitionrun", listener);
    });
  };
  const watchHeaderTransitions = async () => {
    await headerFiles.evaluate((element) => {
      element.dataset.headerBackgroundTransitionStarted = "false";
      const listener = (event: Event) => {
        const transition = event as TransitionEvent;
        if (transition.propertyName === "transform" && transition.pseudoElement === "::before") {
          element.dataset.headerBackgroundTransitionStarted = "true";
        }
        if (element.dataset.headerBackgroundTransitionStarted === "true") {
          element.removeEventListener("transitionrun", listener);
        }
      };
      element.addEventListener("transitionrun", listener);
    });
  };

  await watchGridTransition();
  await watchHeaderTransitions();
  await toggle.focus();
  await page.keyboard.press("Enter");
  const expand = page.getByRole("button", { name: "Expand files panel", exact: true });
  await expect(expand).toBeFocused();
  await expect(expand).toHaveAttribute("aria-expanded", "false");
  await expect
    .poll(() => expand.evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe("rgba(0, 0, 0, 0)");
  await expect(filesPanel).toHaveAttribute("aria-hidden", "true");
  await expect(filesPanel).toHaveAttribute("inert");
  await expect(tree).toBeAttached();
  await expect(workspaceGrid).toHaveAttribute("data-grid-transition-started", "true");
  await expect(headerFiles).toHaveAttribute("data-header-background-transition-started", "true");
  await expect.poll(headerSurfaceScale).toBe(0);
  await expect.poll(dividerAlignment).toBeLessThan(1);
  await expect
    .poll(async () =>
      Math.abs(
        (await editorPanel.boundingBox())!.width - (editorWidthBeforeCollapse + expandedWidth),
      ),
    )
    .toBeLessThan(1);
  await expect.poll(async () => (await filesPanel.boundingBox())!.width).toBeLessThan(1);
  await expect(page.getByRole("heading", { name: "Tsugite", exact: true })).toBeVisible();
  await expect(page.getByText("v0.1.0", { exact: true })).toBeVisible();
  await expect
    .poll(async () => Math.abs((await headerFiles.boundingBox())!.width - expandedWidth))
    .toBeLessThan(1);
  await expect
    .poll(async () => headerFiles.evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe(await header.evaluate((element) => getComputedStyle(element).backgroundColor));
  expect((await expand.boundingBox())!.x).toBeCloseTo(toggleBox!.x, 0);

  await watchGridTransition();
  await watchHeaderTransitions();
  await expand.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toBeVisible();
  await expect(filesPanel).toBeVisible();
  await expect
    .poll(() => toggle.evaluate((element) => getComputedStyle(element).backgroundColor))
    .not.toBe("rgba(0, 0, 0, 0)");
  await expect(workspaceGrid).toHaveAttribute("data-grid-transition-started", "true");
  await expect(headerFiles).toHaveAttribute("data-header-background-transition-started", "true");
  await expect.poll(headerSurfaceScale).toBe(1);
  await expect(folder).toHaveAttribute("aria-expanded", "true");
  await expect(stylesheet).toHaveAttribute("aria-selected", "true");
  await expect
    .poll(() => tree.evaluate((element) => (element as HTMLElement).scrollTop))
    .toBe(treeScrollTop);
  await expect
    .poll(async () => Math.abs((await headerFiles.boundingBox())!.width - expandedWidth))
    .toBeLessThan(1);
  await expect
    .poll(async () =>
      Math.abs((await editorPanel.boundingBox())!.width - editorWidthBeforeCollapse),
    )
    .toBeLessThan(1);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const region = document.querySelector<HTMLElement>("[data-header-files-region]");
        const sidebarElement = document.querySelector<HTMLElement>(
          '[aria-label="Project files"].glass-panel',
        );
        const glassStyle = region ? getComputedStyle(region, "::before") : null;
        return Boolean(
          region &&
          sidebarElement &&
          glassStyle?.backgroundImage ===
            `linear-gradient(${getComputedStyle(sidebarElement).backgroundColor}, ${getComputedStyle(sidebarElement).backgroundColor})` &&
          glassStyle.opacity === "1" &&
          new DOMMatrixReadOnly(glassStyle.transform).a === 1,
        );
      }),
    )
    .toBe(true);
});

test("File panel contents slide out in sync without an overshoot", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const filesSlot = page.locator('[data-panel="files"]');
  const contents = filesSlot.locator(":scope > div");
  const initialBox = await contents.boundingBox();
  const initialEditorWidth = (await page.locator('[data-panel="editor"]').boundingBox())!.width;
  expect(initialBox).not.toBeNull();

  await page.getByRole("button", { name: "Collapse files panel", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const grid = document.querySelector<HTMLElement>(".workspace-layout-grid");
        const surface = document.querySelector<HTMLElement>(".workspace-files-content");
        const region = document.querySelector<HTMLElement>("[data-header-files-region]");
        if (!grid || !surface || !region) return null;
        const gridStyle = getComputedStyle(grid);
        const surfaceStyle = getComputedStyle(surface);
        const headerStyle = getComputedStyle(region, "::before");
        return [
          gridStyle.transitionDuration,
          gridStyle.transitionTimingFunction,
          surfaceStyle.transitionDuration,
          surfaceStyle.transitionTimingFunction,
          headerStyle.transitionDuration,
          headerStyle.transitionTimingFunction,
        ];
      }),
    )
    .toEqual([
      "0.26s",
      "cubic-bezier(0.4, 0, 1, 1)",
      "0.26s",
      "cubic-bezier(0.4, 0, 1, 1)",
      "0.26s",
      "cubic-bezier(0.4, 0, 1, 1)",
    ]);
  const samples = await page.evaluate(async () => {
    const slot = document.querySelector<HTMLElement>('[data-panel="files"]');
    const surface = slot?.firstElementChild as HTMLElement | null;
    if (!slot || !surface) return [];

    const frames: Array<{
      elapsed: number;
      left: number;
      width: number;
      rows: number;
      visibleRatio: number;
      slotWidth: number;
      editorWidth: number;
      headerScale: number;
    }> = [];
    const start = performance.now();
    while (performance.now() - start < 440) {
      const { left, width } = surface.getBoundingClientRect();
      const row = slot.querySelector<HTMLElement>("[role='treeitem']");
      const grid = slot.closest<HTMLElement>(".workspace-layout-grid");
      const editor = grid?.querySelector<HTMLElement>('[data-panel="editor"]');
      const region = document.querySelector<HTMLElement>("[data-header-files-region]");
      const rowBox = row?.getBoundingClientRect();
      const gridBox = grid?.getBoundingClientRect();
      const regionStyle = region ? getComputedStyle(region, "::before") : null;
      const leftEdge = Math.max(rowBox?.left ?? 0, gridBox?.left ?? 0);
      const rightEdge = Math.min(rowBox?.right ?? 0, gridBox?.right ?? 0);
      frames.push({
        elapsed: performance.now() - start,
        left,
        width,
        rows: slot.querySelectorAll<HTMLElement>("[role='treeitem']").length,
        visibleRatio: rowBox ? Math.max(0, rightEdge - leftEdge) / rowBox.width : 0,
        slotWidth: slot.getBoundingClientRect().width,
        editorWidth: editor?.getBoundingClientRect().width ?? 0,
        headerScale: regionStyle ? new DOMMatrixReadOnly(regionStyle.transform).a : 0,
      });
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    return frames;
  });

  expect(samples.length).toBeGreaterThan(0);
  expect(samples.some(({ rows }) => rows > 0)).toBe(true);
  expect(
    samples.some(
      (sample) =>
        sample.elapsed >= 50 &&
        sample.elapsed <= 120 &&
        sample.visibleRatio > 0.5 &&
        sample.slotWidth < initialBox!.width - 1 &&
        sample.editorWidth > initialEditorWidth + 1 &&
        sample.headerScale < 1,
    ),
  ).toBe(true);
  expect(
    samples.some(({ left, width }) => Math.abs(width - initialBox!.width) < 1 && left < -1),
  ).toBe(true);
  expect(Math.min(...samples.map(({ left }) => left))).toBeGreaterThanOrEqual(
    -initialBox!.width - 1,
  );
  const finalSample = samples.at(-1)!;
  expect(finalSample.width).toBeCloseTo(initialBox!.width, 0);
  expect(finalSample.left).toBeCloseTo(-initialBox!.width, 0);
  await expect(filesSlot).toHaveAttribute("aria-hidden", "true");
});
