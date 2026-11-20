import { expect, test, type Page } from "playwright/test";

function readEditorText(page: Page) {
  return page.locator(".cm-content").evaluate((element) => {
    const clone = element.cloneNode(true) as HTMLElement;
    clone
      .querySelectorAll(".cm-remote-cursor-label")
      .forEach((label) => label.remove());
    return Array.from(clone.querySelectorAll(".cm-line"))
      .map((line) => line.textContent ?? "")
      .join("\n");
  });
}

test.describe("file and editor actions", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("iris.language", "en");
    });
  });

  test("keeps the unique default name when an empty creation is submitted", async ({
    page,
  }, testInfo) => {
    await page.goto(
      "/room/e2e-empty-inline-create-" +
        process.pid +
        "-" +
        testInfo.repeatEachIndex,
      {
        waitUntil: "domcontentloaded",
      },
    );
    await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });

    await page
      .getByRole("treeitem", { name: "src folder", exact: true })
      .click({ button: "right" });
    await page.getByRole("menuitem", { name: "New file", exact: true }).click();
    const pathInput = page.locator("[data-item-rename-input]");
    await expect(pathInput).toBeFocused();
    const defaultName = await pathInput.inputValue();
    await expect
      .poll(() =>
        pathInput.evaluate((input) => {
          const element = input as HTMLInputElement;
          return [element.selectionStart, element.selectionEnd];
        }),
      )
      .toEqual([0, (await pathInput.inputValue()).length]);
    await pathInput.fill("");
    await pathInput.press("Enter");
    await expect(pathInput).toHaveCount(0);
    await expect(
      page.getByRole("treeitem", { name: defaultName, exact: true }),
    ).toBeVisible();
  });

  test("keeps local undo history when renaming the active file", async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    await page.goto(
      "/room/e2e-undo-rename-" + process.pid + "-" + testInfo.repeatEachIndex,
      {
        waitUntil: "domcontentloaded",
      },
    );
    await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });

    const editor = page.locator(".cm-content");
    const readText = () => readEditorText(page);
    const initial = await readText();

    await editor.click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.insertText("\n// before-rename");
    await expect.poll(readText, { timeout: 15_000 }).not.toBe(initial);

    await page
      .getByRole("treeitem", { name: "App.tsx", exact: true })
      .click({ button: "right" });
    await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
    const pathInput = page.locator("[data-item-rename-input]");
    await expect(pathInput).toBeFocused();
    await expect
      .poll(() =>
        pathInput.evaluate((input) => {
          const element = input as HTMLInputElement;
          return [element.selectionStart, element.selectionEnd];
        }),
      )
      .toEqual([0, (await pathInput.inputValue()).length]);
    await pathInput.fill("src/renamed.tsx");
    await pathInput.press("Enter");

    await expect(
      page.getByRole("tab").filter({ hasText: "renamed.tsx" }),
    ).toBeVisible({
      timeout: 15_000,
    });
    await editor.click();
    await expect(page.locator(".cm-editor")).toHaveClass(/cm-focused/, {
      timeout: 15_000,
    });
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(readText, { timeout: 30_000 }).toBe(initial);
  });

  test("keeps local undo history when switching files", async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    await page.goto(
      "/room/e2e-undo-switch-" + process.pid + "-" + testInfo.repeatEachIndex,
      {
        waitUntil: "domcontentloaded",
      },
    );
    await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });

    const editor = page.locator(".cm-content");
    const readText = () => readEditorText(page);
    const initial = await readText();

    await editor.click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.insertText("\n// before-switch");
    await expect.poll(readText, { timeout: 15_000 }).not.toBe(initial);
    const edited = await readText();

    await page
      .getByRole("treeitem", { name: "index.html", exact: true })
      .click();
    await expect(
      page.locator('section[aria-label="Editing index.html"]'),
    ).toBeVisible();
    await expect.poll(readText, { timeout: 15_000 }).not.toBe(edited);

    await page.getByRole("treeitem", { name: "App.tsx", exact: true }).click();
    await expect(
      page.locator('section[aria-label="Editing src/App.tsx"]'),
    ).toBeVisible();
    await expect.poll(readText, { timeout: 15_000 }).toBe(edited);
    await editor.click();
    await expect(page.locator(".cm-editor")).toHaveClass(/cm-focused/, {
      timeout: 15_000,
    });
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(readText, { timeout: 30_000 }).toBe(initial);
  });

  test("keeps the active editor tab after a remote file rename", async ({
    browser,
  }, testInfo) => {
    const firstContext = await browser.newContext();
    const secondContext = await browser.newContext();
    await firstContext.addInitScript(
      (identity) => {
        window.localStorage.setItem(
          "iris.identity.v1",
          JSON.stringify(identity),
        );
      },
      {
        userId: "e2e-remote-rename-first",
        displayName: "Maya",
        color: "#d88961",
      },
    );
    await secondContext.addInitScript(
      (identity) => {
        window.localStorage.setItem(
          "iris.identity.v1",
          JSON.stringify(identity),
        );
      },
      {
        userId: "e2e-remote-rename-second",
        displayName: "Jun",
        color: "#7389b7",
      },
    );

    const firstPage = await firstContext.newPage();
    const secondPage = await secondContext.newPage();
    const roomPath =
      "/room/e2e-remote-rename-" +
      process.pid +
      "-" +
      testInfo.workerIndex +
      "-" +
      testInfo.repeatEachIndex;
    await Promise.all([
      firstPage.goto(roomPath, { waitUntil: "domcontentloaded" }),
      secondPage.goto(roomPath, { waitUntil: "domcontentloaded" }),
    ]);
    await expect(firstPage.locator(".cm-editor")).toBeVisible({
      timeout: 15_000,
    });
    await expect(secondPage.locator(".cm-editor")).toBeVisible({
      timeout: 15_000,
    });

    await secondPage
      .getByRole("treeitem", { name: "App.tsx", exact: true })
      .click({ button: "right" });
    await secondPage
      .getByRole("menuitem", { name: "Rename", exact: true })
      .click();
    await secondPage
      .locator("[data-item-rename-input]")
      .fill("src/remote-renamed.tsx");
    await secondPage.locator("[data-item-rename-input]").press("Enter");

    await expect(
      firstPage.getByRole("tab").filter({ hasText: "remote-renamed.tsx" }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(firstPage.locator(".cm-editor")).toBeVisible();

    await firstContext.close();
    await secondContext.close();
  });

  test("manages nested files and editor tabs through the file actions", async ({
    page,
  }, testInfo) => {
    await page.goto(
      "/room/e2e-files-" + process.pid + "-" + testInfo.repeatEachIndex,
      {
        waitUntil: "domcontentloaded",
      },
    );
    await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });

    const pathInput = page.locator("[data-item-rename-input]");
    const sourceFolder = page.getByRole("treeitem", {
      name: "src folder",
      exact: true,
    });

    await sourceFolder.click({ button: "right" });
    await page.getByRole("menuitem", { name: "New file", exact: true }).click();
    const createInput = page.locator("[data-item-rename-input]");
    await createInput.fill("nested/example.ts");
    await createInput.press("Enter");
    await expect(
      page.getByRole("treeitem", { name: "src/nested folder", exact: true }),
    ).toBeVisible();

    const createdFile = page.getByRole("treeitem", {
      name: "example.ts",
      exact: true,
    });
    await expect(createdFile).toBeVisible();
    await createdFile.click();
    await expect(
      page.getByRole("tab").filter({ hasText: "example.ts" }),
    ).toHaveAttribute("aria-selected", "true");

    await createdFile.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
    await pathInput.fill("src/nested/renamed.ts");
    await pathInput.press("Enter");
    const renamedFile = page.getByRole("treeitem", {
      name: "renamed.ts",
      exact: true,
    });
    await expect(renamedFile).toBeVisible();

    const nestedFolder = page.getByRole("treeitem", {
      name: "src/nested folder",
      exact: true,
    });
    await nestedFolder.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
    await pathInput.fill("src/renamed");
    await pathInput.press("Enter");
    const renamedFolder = page.getByRole("treeitem", {
      name: "src/renamed folder",
      exact: true,
    });
    await expect(renamedFolder).toBeVisible();
    await expect(renamedFile).toBeVisible();

    await sourceFolder.click({ button: "right" });
    await page
      .getByRole("menuitem", { name: "New folder", exact: true })
      .click();
    const createFolderInput = page.locator("[data-item-rename-input]");
    await expect(createFolderInput).toBeFocused();
    await expect
      .poll(() =>
        createFolderInput.evaluate((input) => {
          const element = input as HTMLInputElement;
          return [element.selectionStart, element.selectionEnd];
        }),
      )
      .toEqual([0, (await createFolderInput.inputValue()).length]);
    await createFolderInput.fill("components");
    await createFolderInput.press("Enter");
    await expect(
      page.getByRole("treeitem", {
        name: "src/components folder",
        exact: true,
      }),
    ).toBeVisible();

    await renamedFolder.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
    const deletePopover = page.getByRole("alertdialog");
    const viewport = page.viewportSize();
    const popoverBox = await deletePopover.boundingBox();
    expect(viewport).not.toBeNull();
    expect(popoverBox).not.toBeNull();
    expect(popoverBox?.x).toBeGreaterThanOrEqual(0);
    expect((popoverBox?.x ?? 0) + (popoverBox?.width ?? 0)).toBeLessThanOrEqual(
      viewport?.width ?? 0,
    );
    await deletePopover
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await expect(renamedFile).toHaveCount(0);
    await expect(page.locator(".cm-editor")).toBeVisible();
  });
});
