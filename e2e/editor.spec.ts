import { expect, test } from "playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("iris.language", "en"));
});

test("keeps the CodeMirror search panel aligned with the editor theme", async ({ page }) => {
  await page.goto("/room/e2e-search-theme", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });

  await page.locator(".cm-content").press("ControlOrMeta+f");
  const searchPanel = page.locator(".cm-panel.cm-search");
  await expect(searchPanel).toBeVisible();

  const styles = await searchPanel.evaluate((panel) => {
    const editor = panel.closest(".cm-editor");
    const input = panel.querySelector<HTMLInputElement>(".cm-textfield");
    const button = panel.querySelector<HTMLButtonElement>('button[name="next"]');
    const label = panel.querySelector<HTMLLabelElement>("label");
    const checkbox = label?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (!editor || !input || !button || !label || !checkbox) {
      throw new Error("Search panel did not mount its editor controls");
    }
    const accentProbe = document.createElement("span");
    accentProbe.style.color = "var(--accent-deep)";
    panel.append(accentProbe);
    const accentDeepColor = getComputedStyle(accentProbe).color;
    accentProbe.remove();
    const labelRect = label.getBoundingClientRect();
    const checkboxRect = checkbox.getBoundingClientRect();
    return {
      panelColor: getComputedStyle(panel).color,
      editorColor: getComputedStyle(editor).color,
      inputColor: getComputedStyle(input).color,
      inputBackground: getComputedStyle(input).backgroundColor,
      buttonColor: getComputedStyle(button).color,
      accentDeepColor,
      labelCenter: labelRect.top + labelRect.height / 2,
      checkboxCenter: checkboxRect.top + checkboxRect.height / 2,
    };
  });

  expect(styles.panelColor).toBe(styles.editorColor);
  expect(styles.inputColor).toBe(styles.editorColor);
  expect(styles.inputBackground).not.toBe("rgb(255, 255, 255)");
  expect(styles.buttonColor).toBe(styles.accentDeepColor);
  expect(Math.abs(styles.labelCenter - styles.checkboxCenter)).toBeLessThan(1);
});

test("keeps long editor content inside the editor scroller", async ({ page }) => {
  await page.goto(`/room/e2e-editor-scroll-${Date.now()}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });

  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText(
    Array.from({ length: 500 }, (_, index) => `const line${index} = ${index};`).join("\n"),
  );

  const dimensions = await page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>(".cm-editor");
    const scroller = document.querySelector<HTMLElement>(".cm-scroller");
    if (!editor || !scroller) throw new Error("CodeMirror scrolling elements did not mount");
    return {
      documentScrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
      editorHeight: editor.clientHeight,
      scrollerHeight: scroller.clientHeight,
      scrollerScrollHeight: scroller.scrollHeight,
    };
  });

  expect(dimensions.documentScrollHeight).toBe(dimensions.viewportHeight);
  expect(dimensions.scrollerScrollHeight).toBeGreaterThan(dimensions.scrollerHeight);
  expect(dimensions.editorHeight).toBeLessThan(dimensions.scrollerScrollHeight);
});

test("shows relative line numbers when enabled in editor settings", async ({ page }) => {
  await page.goto(`/room/e2e-relative-line-numbers-${Date.now()}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });

  const editor = page.locator(".cm-content");
  await editor.click();
  await page.keyboard.press("ControlOrMeta+Home");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");

  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "Editor", exact: true }).click();
  const relativeLineNumbers = page.getByRole("switch", { name: "Relative line numbers" });
  await expect(relativeLineNumbers).toBeVisible();
  if ((await relativeLineNumbers.getAttribute("aria-checked")) !== "true") {
    await relativeLineNumbers.click();
  }
  await page.getByRole("button", { name: "Close settings" }).click();

  const lineNumbers = page.locator(".cm-lineNumbers .cm-gutterElement");
  const readVisibleLineNumbers = () =>
    lineNumbers.evaluateAll((elements) =>
      elements
        .filter((element) => (element as HTMLElement).style.height !== "0px")
        .map((element) => element.textContent ?? "")
        .slice(0, 8),
    );

  await expect.poll(readVisibleLineNumbers).toEqual(["2", "1", "3", "1", "2", "3", "4", "5"]);

  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "Editor", exact: true }).click();
  const relativeLineNumbersAfterEnable = page.getByRole("switch", {
    name: "Relative line numbers",
  });
  await expect(relativeLineNumbersAfterEnable).toHaveAttribute("aria-checked", "true");
  await relativeLineNumbersAfterEnable.click();
  await page.getByRole("button", { name: "Close settings" }).click();
  await expect.poll(readVisibleLineNumbers).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);
});

test("applies the configured Vim normal cursor style", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("tsugite.vim-mode", "true"));
  await page.goto(`/room/e2e-cursor-style-${Date.now()}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "Editor", exact: true }).click();
  await page.getByLabel("Normal mode cursor").selectOption("block");
  await page.getByRole("button", { name: "Close settings" }).click();
  await expect(page.locator(".cm-editor")).toHaveAttribute("data-normal-cursor-style", "block");
  await expect(page.locator("[data-vim-mode='normal']")).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".cm-vimCursorLayer .cm-fat-cursor")
        .evaluate((e) => getComputedStyle(e).backgroundColor),
    )
    .toBe("rgb(0, 122, 255)");
});

test("uses the workspace accent for the insert cursor", async ({ page }) => {
  await page.goto(`/room/e2e-insert-cursor-${Date.now()}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
  await page.locator(".cm-content").focus();
  await page.keyboard.press("i");
  await expect
    .poll(() => page.locator(".cm-cursor").evaluate((e) => getComputedStyle(e).borderLeftColor))
    .toBe("rgb(0, 122, 255)");
});

test("keeps the line-number gutter opaque while scrolling long lines", async ({ page }) => {
  await page.goto("/room/e2e-gutter-background", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });

  const content = page.locator(".cm-content");
  await content.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText(`const longLine = "${"x".repeat(420)}";`);

  const styles = await page.locator(".cm-editor").evaluate((editor) => {
    const scroller = editor.querySelector<HTMLElement>(".cm-scroller");
    const gutters = editor.querySelector<HTMLElement>(".cm-gutters");
    if (!scroller || !gutters) {
      throw new Error("CodeMirror scrolling elements did not mount");
    }

    scroller.scrollLeft = Math.min(300, scroller.scrollWidth - scroller.clientWidth);
    scroller.dispatchEvent(new Event("scroll", { bubbles: true }));

    const scrollerRect = scroller.getBoundingClientRect();
    const gutterRect = gutters.getBoundingClientRect();
    return {
      scrollWidth: scroller.scrollWidth,
      clientWidth: scroller.clientWidth,
      gutterBackground: getComputedStyle(gutters).backgroundColor,
      scrollerLeft: scrollerRect.left,
      gutterLeft: gutterRect.left,
    };
  });

  expect(styles.scrollWidth).toBeGreaterThan(styles.clientWidth);
  expect(styles.gutterBackground).not.toMatch(/transparent|rgba\(0, 0, 0, 0\)/);
  expect(Math.abs(styles.gutterLeft - styles.scrollerLeft)).toBeLessThan(1);
});

test("does not publish a cursor when selecting a file before focusing its editor", async ({
  browser,
}) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  await firstContext.addInitScript(
    (identity) => {
      window.localStorage.setItem("iris.identity.v1", JSON.stringify(identity));
    },
    { userId: "e2e-file-switch-first", displayName: "Maya", color: "#d88961" },
  );
  await secondContext.addInitScript(
    (identity) => {
      window.localStorage.setItem("iris.identity.v1", JSON.stringify(identity));
    },
    { userId: "e2e-file-switch-second", displayName: "Jun", color: "#7389b7" },
  );

  const firstPage = await firstContext.newPage();
  const secondPage = await secondContext.newPage();
  await Promise.all([
    firstPage.goto("/room/e2e-presence-file-switch", { waitUntil: "domcontentloaded" }),
    secondPage.goto("/room/e2e-presence-file-switch", { waitUntil: "domcontentloaded" }),
  ]);
  await expect(firstPage.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
  await expect(secondPage.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });

  await firstPage.getByRole("button", { name: "index.html", exact: true }).click();
  await secondPage.getByRole("button", { name: "index.html", exact: true }).click();

  await expect(firstPage.locator("[data-collaborator-badge='index.html']")).toHaveText("+1", {
    timeout: 15_000,
  });
  await expect(
    firstPage.getByRole("tab", { name: "index.html, 1 collaborators in this file" }),
  ).toBeVisible();
  await expect(secondPage.locator("[data-collaborator-badge='index.html']")).toHaveText("+1", {
    timeout: 15_000,
  });

  await secondPage.getByRole("button", { name: "main.tsx", exact: true }).click();
  await expect(firstPage.locator("[data-collaborator-badge='index.html']")).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect(secondPage.locator("[data-collaborator-badge='index.html']")).toHaveText("+1", {
    timeout: 15_000,
  });

  await expect(secondPage.locator(".cm-remote-cursor-label")).toHaveCount(0, {
    timeout: 2_000,
  });

  await firstContext.close();
  await secondContext.close();
});

test("undoes repeated local edits without corrupting the file", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/room/e2e-undo", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });

  const editor = page.locator(".cm-content");
  const readText = () =>
    editor.evaluate((element) =>
      Array.from(element.querySelectorAll(".cm-line"))
        .map((line) => line.textContent ?? "")
        .join("\n"),
    );
  const initial = await readText();

  await editor.click();
  await expect(page.locator(".cm-editor")).toHaveClass(/cm-focused/, { timeout: 15_000 });
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("\n// undo-first");
  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForTimeout(250);
  await expect.poll(readText, { timeout: 15_000 }).toBe(initial);

  await page.keyboard.type("\n// undo-second");
  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForTimeout(250);
  await expect.poll(readText, { timeout: 15_000 }).toBe(initial);
});

test("shows an existing focused cursor to a late joiner without requiring a click", async ({
  browser,
}) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  await firstContext.addInitScript(
    (identity) => {
      window.localStorage.setItem("iris.identity.v1", JSON.stringify(identity));
    },
    { userId: "e2e-initial-observer", displayName: "Maya", color: "#d88961" },
  );
  await secondContext.addInitScript(
    (identity) => {
      window.localStorage.setItem("iris.identity.v1", JSON.stringify(identity));
    },
    { userId: "e2e-initial-joiner", displayName: "Jun", color: "#7389b7" },
  );

  const secondPage = await secondContext.newPage();
  await secondPage.goto("/room/e2e-presence-initial", { waitUntil: "domcontentloaded" });
  await expect(secondPage.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
  await secondPage.locator(".cm-content").click({ position: { x: 28, y: 12 } });

  const firstPage = await firstContext.newPage();
  await firstPage.goto("/room/e2e-presence-initial", { waitUntil: "domcontentloaded" });
  await expect(firstPage.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });

  await expect(firstPage.locator(".cm-remote-cursor-label").filter({ hasText: "Jun" })).toBeVisible(
    {
      timeout: 15_000,
    },
  );

  await firstContext.close();
  await secondContext.close();
});
