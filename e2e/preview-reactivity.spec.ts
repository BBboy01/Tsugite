import { expect, test } from "playwright/test";

test("standalone preview cannot read application storage or parent DOM", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("iris.language", "en"));
  await page.goto(`/room/e2e-preview-isolation-${crypto.randomUUID()}`);
  await expect(page.locator(".cm-content")).toBeVisible();
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("preview-isolation-fixture", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("drafts");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction("drafts", "readwrite");
        transaction.objectStore("drafts").put("private draft", "other-room");
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
      };
    });
  });
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText(`
    let dom = "allowed";
    try { parent.document.title; } catch { dom = "blocked"; }
    try {
      const request = indexedDB.open("preview-isolation-fixture", 1);
      request.onsuccess = () => {
        document.getElementById("app").textContent = "storage allowed; parent " + dom;
        request.result.close();
      };
    } catch { document.getElementById("app").textContent = "storage blocked; parent " + dom; }
  `);
  await page.getByRole("button", { name: "package.json", exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.frameLocator('iframe[title^="Preview of "]').locator("#app")).toHaveText(
    "storage blocked; parent blocked",
    { timeout: 15_000 },
  );
});

test("text-only local and remote edits refresh the standalone preview", async ({ browser }) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  try {
    await firstContext.addInitScript(() => localStorage.setItem("iris.language", "en"));
    await secondContext.addInitScript(() => localStorage.setItem("iris.language", "en"));
    const first = await firstContext.newPage();
    const room = `/room/e2e-preview-reactivity-${Date.now()}`;
    await first.goto(room);
    const editor = first.locator(".cm-content");
    await expect(editor).toBeVisible();
    await editor.click();
    await first.keyboard.press("ControlOrMeta+A");
    await first.keyboard.insertText('document.getElementById("app").textContent = "Before edit";');
    await first
      .getByRole("button", { name: "package.json", exact: true })
      .click({ button: "right" });
    await first.getByRole("menuitem", { name: "Delete", exact: true }).click();
    await first
      .getByRole("alertdialog")
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    const firstPreview = first.frameLocator('iframe[title^="Preview of "]');
    await expect(firstPreview.locator("#app")).toHaveText("Before edit", { timeout: 15_000 });

    const second = await secondContext.newPage();
    await second.goto(room);
    const secondPreview = second.frameLocator('iframe[title^="Preview of "]');
    await expect(secondPreview.locator("#app")).toHaveText("Before edit", { timeout: 15_000 });
    await editor.click();
    await first.keyboard.press("ControlOrMeta+A");
    await first.keyboard.insertText('document.getElementById("app").textContent = "After edit";');
    await expect(firstPreview.locator("#app")).toHaveText("After edit");
    await expect(secondPreview.locator("#app")).toHaveText("After edit");
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});
