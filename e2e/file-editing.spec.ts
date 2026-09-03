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

test.describe("file and editor actions", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("iris.language", "en");
    });
  });

  test("keeps the initial room socket open through development remounts", async ({
    page,
  }, testInfo) => {
    const socketWarnings: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "warning" && message.text().includes("WebSocket connection")) {
        socketWarnings.push(message.text());
      }
    });

    await page.goto("/room/e2e-connection-" + process.pid + "-" + testInfo.repeatEachIndex, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('iframe[title^="Preview of "]')).toHaveAttribute(
      "sandbox",
      "allow-scripts allow-same-origin",
    );
    await page.waitForTimeout(1_000);

    expect(socketWarnings).toEqual([]);
  });

  test("keeps local undo history when renaming the active file", async ({ page }, testInfo) => {
    await page.goto("/room/e2e-undo-rename-" + process.pid + "-" + testInfo.repeatEachIndex, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });

    const editor = page.locator(".cm-content");
    const readText = () => readEditorText(page);
    const initial = await readText();

    await editor.click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("\n// before-rename");
    await expect.poll(readText, { timeout: 15_000 }).not.toBe(initial);

    await page.getByRole("button", { name: "main.tsx", exact: true }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
    const pathInput = page.locator("#file-tree-path");
    await pathInput.fill("src/renamed.tsx");
    await page.getByRole("button", { name: "Rename", exact: true }).click();

    await expect(page.getByRole("tab").filter({ hasText: "renamed.tsx" })).toBeVisible({
      timeout: 15_000,
    });
    await editor.click();
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(readText, { timeout: 15_000 }).toBe(initial);
  });

  test("keeps local undo history when switching files", async ({ page }, testInfo) => {
    await page.goto("/room/e2e-undo-switch-" + process.pid + "-" + testInfo.repeatEachIndex, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });

    const editor = page.locator(".cm-content");
    const readText = () => readEditorText(page);
    const initial = await readText();

    await editor.click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("\n// before-switch");
    await expect.poll(readText, { timeout: 15_000 }).not.toBe(initial);

    await page.getByRole("button", { name: "index.html", exact: true }).click();
    await page.getByRole("button", { name: "main.tsx", exact: true }).click();
    await editor.click();
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(readText, { timeout: 15_000 }).toBe(initial);
  });

  test("keeps the active editor tab after a remote file rename", async ({ browser }, testInfo) => {
    const firstContext = await browser.newContext();
    const secondContext = await browser.newContext();
    await firstContext.addInitScript(
      (identity) => {
        window.localStorage.setItem("iris.identity.v1", JSON.stringify(identity));
      },
      { userId: "e2e-remote-rename-first", displayName: "Maya", color: "#d88961" },
    );
    await secondContext.addInitScript(
      (identity) => {
        window.localStorage.setItem("iris.identity.v1", JSON.stringify(identity));
      },
      { userId: "e2e-remote-rename-second", displayName: "Jun", color: "#7389b7" },
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
    await expect(firstPage.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
    await expect(secondPage.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });

    await secondPage
      .getByRole("button", { name: "main.tsx", exact: true })
      .click({ button: "right" });
    await secondPage.getByRole("menuitem", { name: "Rename", exact: true }).click();
    await secondPage.locator("#file-tree-path").fill("src/remote-renamed.tsx");
    await secondPage.getByRole("button", { name: "Rename", exact: true }).click();

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
    await page.goto("/room/e2e-files-" + process.pid + "-" + testInfo.repeatEachIndex, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });

    const pathInput = page.locator("#file-tree-path");
    const sourceFolder = page.getByRole("button", { name: "src folder", exact: true });

    await sourceFolder.click({ button: "right" });
    await page.getByRole("menuitem", { name: "New file", exact: true }).click();
    await pathInput.fill("nested/example.ts");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "src/nested folder", exact: true }),
    ).toBeVisible();

    const createdFile = page.getByRole("button", { name: "example.ts", exact: true });
    await expect(createdFile).toBeVisible();
    await createdFile.click();
    await expect(page.getByRole("tab").filter({ hasText: "example.ts" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await createdFile.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
    await pathInput.fill("src/nested/renamed.ts");
    await page.getByRole("button", { name: "Rename", exact: true }).click();
    const renamedFile = page.getByRole("button", { name: "renamed.ts", exact: true });
    await expect(renamedFile).toBeVisible();

    const nestedFolder = page.getByRole("button", { name: "src/nested folder", exact: true });
    await nestedFolder.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
    await pathInput.fill("src/renamed");
    await page.getByRole("button", { name: "Rename", exact: true }).click();
    const renamedFolder = page.getByRole("button", { name: "src/renamed folder", exact: true });
    await expect(renamedFolder).toBeVisible();
    await expect(renamedFile).toBeVisible();

    await sourceFolder.click({ button: "right" });
    await page.getByRole("menuitem", { name: "New folder", exact: true }).click();
    await pathInput.fill("components");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "src/components folder", exact: true }),
    ).toBeVisible();

    await renamedFile.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Copy", exact: true }).click();
    const copiedFile = page.getByRole("button", { name: "renamed copy.ts", exact: true });
    await expect(copiedFile).toBeVisible();

    const closeCopy = page.getByRole("button", {
      name: "Close src/renamed/renamed copy.ts",
      exact: true,
    });
    await closeCopy.click();
    await expect(closeCopy).toHaveCount(0);

    page.once("dialog", (dialog) => dialog.accept());
    await renamedFolder.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
    await expect(renamedFile).toHaveCount(0);
    await expect(page.locator(".cm-editor")).toBeVisible();
  });
});
