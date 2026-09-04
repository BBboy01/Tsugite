import { expect, test, type Page } from "playwright/test";

function readEditorText(page: Page) {
  return page.locator(".cm-content").evaluate((element) => {
    const clone = element.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(".cm-remote-cursor-label").forEach((label) => label.remove());
    return Array.from(clone.querySelectorAll(".cm-line"))
      .map((line) => line.textContent ?? "")
      .join("\n");
  });
}

test.describe("room shell", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("iris.language", "en");
    });
  });

  test("loads the editor and supports collapsing the source tree", async ({ page }) => {
    await page.goto("/room/e2e", { waitUntil: "domcontentloaded" });

    await expect(page.locator("header.glass-header")).toBeVisible();
    await expect(page.getByText("Tsugite", { exact: true })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Project files" })).toBeVisible();
    await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });

    const sourceFolder = page.getByRole("button", { name: "src folder" });
    await expect(sourceFolder).toHaveAttribute("aria-expanded", "true");
    await sourceFolder.click();
    await expect(sourceFolder).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("button", { name: "main.tsx", exact: true })).toBeHidden();
    await sourceFolder.click();
    await expect(page.getByRole("button", { name: "main.tsx", exact: true })).toBeVisible();
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

  test("renders a collaborator cursor, name, and selection", async ({ browser }) => {
    const firstContext = await browser.newContext();
    const secondContext = await browser.newContext();
    await firstContext.addInitScript(
      (identity) => {
        window.localStorage.setItem("iris.identity.v1", JSON.stringify(identity));
      },
      { userId: "e2e-first", displayName: "Maya", color: "#d88961" },
    );
    await secondContext.addInitScript(
      (identity) => {
        window.localStorage.setItem("iris.identity.v1", JSON.stringify(identity));
      },
      { userId: "e2e-second", displayName: "Jun", color: "#7389b7" },
    );

    const firstPage = await firstContext.newPage();
    const secondPage = await secondContext.newPage();
    await Promise.all([
      firstPage.goto("/room/e2e-presence", { waitUntil: "domcontentloaded" }),
      secondPage.goto("/room/e2e-presence", { waitUntil: "domcontentloaded" }),
    ]);
    await expect(firstPage.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
    await expect(secondPage.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });

    await secondPage.locator(".cm-content").click();
    await secondPage.keyboard.press("ControlOrMeta+A");

    await expect(firstPage.locator(".cm-remote-cursor-label")).toHaveText("Jun", {
      timeout: 15_000,
    });
    await expect(
      firstPage.locator(".cm-remote-selection[data-user-id='e2e-second']").first(),
    ).toBeVisible();

    await firstContext.close();
    await secondContext.close();
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

  test("undoes only the local edit after concurrent changes", async ({ browser }, testInfo) => {
    test.setTimeout(90_000);
    const firstContext = await browser.newContext();
    const secondContext = await browser.newContext();
    await firstContext.addInitScript(
      (identity) => {
        window.localStorage.setItem("iris.identity.v1", JSON.stringify(identity));
      },
      { userId: "e2e-undo-first", displayName: "Maya", color: "#d88961" },
    );
    await secondContext.addInitScript(
      (identity) => {
        window.localStorage.setItem("iris.identity.v1", JSON.stringify(identity));
      },
      { userId: "e2e-undo-second", displayName: "Jun", color: "#7389b7" },
    );

    const firstPage = await firstContext.newPage();
    const secondPage = await secondContext.newPage();
    const roomPath =
      "/room/e2e-undo-concurrent-" + testInfo.workerIndex + "-" + testInfo.repeatEachIndex;
    await Promise.all([
      firstPage.goto(roomPath, { waitUntil: "domcontentloaded" }),
      secondPage.goto(roomPath, { waitUntil: "domcontentloaded" }),
    ]);
    await expect(firstPage.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
    await expect(secondPage.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });

    const initial = await readEditorText(firstPage);

    await firstPage.locator(".cm-content").click();
    await firstPage.keyboard.press("ControlOrMeta+End");
    await firstPage.keyboard.type("\n// undo-maya");
    await expect
      .poll(() => readEditorText(secondPage), { timeout: 45_000 })
      .toContain("// undo-maya");

    await secondPage.locator(".cm-content").click();
    await secondPage.keyboard.press("ControlOrMeta+Home");
    await secondPage.keyboard.type("// undo-jun\n");
    await expect
      .poll(() => readEditorText(firstPage), { timeout: 45_000 })
      .toContain("// undo-jun");

    await firstPage.locator(".cm-content").click();
    await expect(firstPage.locator(".cm-editor")).toHaveClass(/cm-focused/, {
      timeout: 15_000,
    });
    await firstPage.keyboard.press("ControlOrMeta+z");
    const expected = "// undo-jun\n" + initial;
    await expect.poll(() => readEditorText(firstPage), { timeout: 45_000 }).toBe(expected);
    await expect.poll(() => readEditorText(secondPage), { timeout: 45_000 }).toBe(expected);

    await firstContext.close();
    await secondContext.close();
  });

  test("shows syntax errors in preview instead of a blank frame", async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.goto(
      "/room/e2e-preview-syntax-" + testInfo.workerIndex + "-" + testInfo.repeatEachIndex,
      { waitUntil: "domcontentloaded" },
    );
    await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('iframe[title^="Preview of "]')).toHaveAttribute(
      "src",
      /^https?:\/\//,
      { timeout: 90_000 },
    );

    const editor = page.locator(".cm-content");
    await editor.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("export const broken = ;");

    await expect(page.getByRole("alert")).toContainText(/Unexpected token|PARSE_ERROR/, {
      timeout: 60_000,
    });

    await editor.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("export const fixed = 1;");
    await expect(page.getByRole("alert")).toHaveCount(0, { timeout: 60_000 });
  });

  test("sends the existing cursor to a collaborator who joins later", async ({ browser }) => {
    const firstContext = await browser.newContext();
    const secondContext = await browser.newContext();
    await firstContext.addInitScript(
      (identity) => {
        window.localStorage.setItem("iris.identity.v1", JSON.stringify(identity));
      },
      { userId: "e2e-existing-cursor", displayName: "Maya", color: "#d88961" },
    );
    await secondContext.addInitScript(
      (identity) => {
        window.localStorage.setItem("iris.identity.v1", JSON.stringify(identity));
      },
      { userId: "e2e-late-joiner", displayName: "Jun", color: "#7389b7" },
    );

    const firstPage = await firstContext.newPage();
    await firstPage.goto("/room/e2e-presence-late", { waitUntil: "domcontentloaded" });
    await expect(firstPage.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
    await firstPage.locator(".cm-content").click({ position: { x: 28, y: 12 } });

    const secondPage = await secondContext.newPage();
    await secondPage.goto("/room/e2e-presence-late", { waitUntil: "domcontentloaded" });
    await expect(secondPage.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });

    await expect(
      secondPage.locator(".cm-remote-cursor-label").filter({ hasText: "Maya" }),
    ).toBeVisible({
      timeout: 15_000,
    });

    await firstContext.close();
    await secondContext.close();
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

    await expect(
      firstPage.locator(".cm-remote-cursor-label").filter({ hasText: "Jun" }),
    ).toBeVisible({
      timeout: 15_000,
    });

    await firstContext.close();
    await secondContext.close();
  });

  test("keeps remaining collaborator cursors when one member leaves", async ({ browser }) => {
    test.setTimeout(90_000);
    const identities = [
      { userId: "e2e-owner", displayName: "Maya", color: "#d88961" },
      { userId: "e2e-jun", displayName: "Jun", color: "#7389b7" },
      { userId: "e2e-sora", displayName: "Sora", color: "#5d9f8c" },
    ];
    const contexts = await Promise.all(
      identities.map(async (identity) => {
        const context = await browser.newContext();
        await context.addInitScript((value) => {
          window.localStorage.setItem("iris.identity.v1", JSON.stringify(value));
        }, identity);
        return context;
      }),
    );
    const pages = await Promise.all(contexts.map((context) => context.newPage()));

    await Promise.all(
      pages.map((page) => page.goto("/room/e2e-presence-leave", { waitUntil: "domcontentloaded" })),
    );
    await Promise.all(
      pages.map((page) => expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 })),
    );

    await pages[1].locator(".cm-content").click();
    await pages[1].keyboard.press("ControlOrMeta+A");
    await pages[2].locator(".cm-content").click();
    await pages[2].keyboard.press("ControlOrMeta+A");

    await Promise.all([
      expect(pages[0].locator(".cm-remote-cursor-label").filter({ hasText: "Jun" })).toBeVisible({
        timeout: 30_000,
      }),
      expect(pages[0].locator(".cm-remote-cursor-label").filter({ hasText: "Sora" })).toBeVisible({
        timeout: 30_000,
      }),
    ]);

    await contexts[2].close();

    await expect(
      pages[0].locator(".cm-remote-cursor-label").filter({ hasText: "Sora" }),
    ).toHaveCount(0);
    await expect(
      pages[0].locator(".cm-remote-cursor-label").filter({ hasText: "Jun" }),
    ).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      pages[0].locator(".cm-remote-selection[data-user-id='e2e-jun']").first(),
    ).toBeVisible();

    await contexts[0].close();
    await contexts[1].close();
  });

  test("keeps a collapsed cursor when a selected collaborator leaves", async ({ browser }) => {
    test.setTimeout(90_000);
    const identities = [
      { userId: "e2e-collapsed-observer", displayName: "Maya", color: "#d88961" },
      { userId: "e2e-collapsed-survivor", displayName: "Sora", color: "#5d9f8c" },
      { userId: "e2e-selected-leaver", displayName: "Jun", color: "#7389b7" },
    ];
    const contexts = await Promise.all(
      identities.map(async (identity) => {
        const context = await browser.newContext();
        await context.addInitScript((value) => {
          window.localStorage.setItem("iris.identity.v1", JSON.stringify(value));
        }, identity);
        return context;
      }),
    );
    const pages = await Promise.all(contexts.map((context) => context.newPage()));
    await Promise.all(
      pages.map((page) =>
        page.goto("/room/e2e-presence-collapsed", { waitUntil: "domcontentloaded" }),
      ),
    );
    await Promise.all(
      pages.map((page) => expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 })),
    );

    await pages[1].locator(".cm-content").click({ position: { x: 12, y: 12 } });
    await pages[2].locator(".cm-content").click();
    await pages[2].keyboard.press("ControlOrMeta+A");
    await Promise.all([
      expect(pages[0].locator(".cm-remote-cursor-label").filter({ hasText: "Sora" })).toBeVisible({
        timeout: 30_000,
      }),
      expect(pages[0].locator(".cm-remote-cursor-label").filter({ hasText: "Jun" })).toBeVisible({
        timeout: 30_000,
      }),
    ]);

    await contexts[2].close();
    await expect(
      pages[0].locator(".cm-remote-cursor-label").filter({ hasText: "Jun" }),
    ).toHaveCount(0);
    await expect(
      pages[0].locator(".cm-remote-cursor-label").filter({ hasText: "Sora" }),
    ).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      pages[0].locator(".cm-remote-cursor[data-user-id='e2e-collapsed-survivor']"),
    ).toBeVisible();

    await contexts[0].close();
    await contexts[1].close();
  });
});
