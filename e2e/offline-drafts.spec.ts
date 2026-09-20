import { expect, test, type BrowserContext, type Page } from "playwright/test";

async function interruptConnection(context: BrowserContext | Page) {
  let online = true;
  let disconnect: (() => void) | undefined;
  await context.routeWebSocket("**/ws/**", (socket) => {
    if (!online) {
      socket.close();
      return;
    }
    const server = socket.connectToServer();
    socket.onMessage((message) => server.send(message));
    server.onMessage((message) => socket.send(message));
    disconnect = () => {
      server.close();
      socket.close();
    };
  });
  return {
    offline() {
      online = false;
      disconnect?.();
    },
    online() {
      online = true;
    },
  };
}

async function edit(page: Page, marker: string) {
  const editor = page.locator(".cm-content");
  await expect(editor).toBeVisible();
  await editor.click();
  await editor.press("ControlOrMeta+End");
  await page.keyboard.insertText(`\n// ${marker}`);
  await expect(page.locator('[data-draft-backup="saved"]')).toBeVisible();
}

test("reopens offline edits only after consent and merges them with a collaborator", async ({
  browser,
}) => {
  const writer = await browser.newContext();
  const reader = await browser.newContext();
  try {
    for (const context of [writer, reader]) {
      await context.addInitScript(() => localStorage.setItem("iris.language", "en"));
    }
    const network = await interruptConnection(writer);
    const page = await writer.newPage();
    const peer = await reader.newPage();
    const room = `/room/e2e-draft-merge-${crypto.randomUUID()}`;
    await page.goto(room);
    await peer.goto(room);
    await expect(page.locator(".cm-content")).toBeVisible();
    network.offline();
    await edit(page, "offline writer");
    await peer.locator(".cm-content").click();
    await peer.keyboard.press("ControlOrMeta+Home");
    await peer.keyboard.insertText("// remote reader\n");
    await page.close();

    const reopened = await writer.newPage();
    network.online();
    await reopened.goto(room);
    const recovery = reopened.getByRole("alertdialog", { name: "Recover local draft" });
    await expect(recovery).toBeVisible();
    await expect(reopened.locator(".cm-content")).not.toContainText("offline writer");
    await expect(peer.locator(".cm-content")).not.toContainText("offline writer");
    await recovery.getByRole("button", { name: "Restore draft", exact: true }).click();
    await expect(recovery).toHaveCount(0);
    await expect(reopened.locator(".cm-content")).toContainText("offline writer");
    await expect(peer.locator(".cm-content")).toContainText("offline writer");
    await expect(reopened.locator(".cm-content")).toContainText("remote reader");
    await expect(reopened.locator('[data-sync-pending="true"]')).toHaveCount(0);
    await reopened.reload();
    await expect(reopened.locator(".cm-content")).toContainText("offline writer");
    await expect(recovery).toHaveCount(0);
  } finally {
    await writer.close();
    await reader.close();
  }
});

test("discard does not publish the draft and another room cannot offer it", async ({ browser }) => {
  const context = await browser.newContext();
  try {
    await context.addInitScript(() => localStorage.setItem("iris.language", "en"));
    const network = await interruptConnection(context);
    const page = await context.newPage();
    const room = `/room/e2e-draft-discard-${crypto.randomUUID()}`;
    await page.goto(room);
    await expect(page.locator(".cm-content")).toBeVisible();
    network.offline();
    await edit(page, "discard marker");
    await page.close();
    network.online();
    const reopened = await context.newPage();
    await reopened.goto(`${room}-other`);
    await expect(reopened.locator(".cm-content")).toBeVisible();
    await expect(reopened.getByRole("alertdialog")).toHaveCount(0);
    await reopened.goto(room);
    const recovery = reopened.getByRole("alertdialog", { name: "Recover local draft" });
    await recovery.getByRole("button", { name: "Discard draft", exact: true }).click();
    await expect(recovery).toHaveCount(0);
    await expect(reopened.locator(".cm-content")).not.toContainText("discard marker");
    await reopened.reload();
    await expect(reopened.locator(".cm-content")).toBeVisible();
    await expect(recovery).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("an active tab keeps exclusive ownership of its unsynced draft", async ({ browser }) => {
  const context = await browser.newContext();
  try {
    await context.addInitScript(() => localStorage.setItem("iris.language", "en"));
    const page = await context.newPage();
    const network = await interruptConnection(page);
    const room = `/room/e2e-draft-active-${crypto.randomUUID()}`;
    await page.goto(room);
    await expect(page.locator(".cm-content")).toBeVisible();
    network.offline();
    await edit(page, "active tab");
    const sibling = await context.newPage();
    await sibling.goto(room);
    await expect(sibling.locator(".cm-content")).toBeVisible();
    await expect(sibling.getByRole("alertdialog")).toHaveCount(0);
    await expect(sibling.locator(".cm-content")).not.toContainText("active tab");
    await expect(page.locator(".cm-content")).toContainText("active tab");
  } finally {
    await context.close();
  }
});

test("reload while offline can restore the saved editor contents without a room snapshot", async ({
  browser,
}) => {
  const context = await browser.newContext();
  try {
    await context.addInitScript(() => localStorage.setItem("iris.language", "en"));
    const network = await interruptConnection(context);
    const page = await context.newPage();
    await page.goto(`/room/e2e-draft-offline-${crypto.randomUUID()}`);
    await expect(page.locator(".cm-content")).toBeVisible();
    network.offline();
    await edit(page, "offline reload");
    page.once("dialog", (dialog) => dialog.accept());
    await page.reload();
    const dialog = page.getByRole("alertdialog", { name: "Recover local draft" });
    await dialog.getByRole("button", { name: "Restore draft", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator(".cm-content")).toContainText("offline reload");
    await expect(page.locator('[data-draft-backup="saved"]')).toBeVisible();
  } finally {
    await context.close();
  }
});

test("failed recovery backup protects the source and allows retry without duplicate edits", async ({
  browser,
}) => {
  const context = await browser.newContext();
  try {
    await context.addInitScript(() => localStorage.setItem("iris.language", "en"));
    const network = await interruptConnection(context);
    const page = await context.newPage();
    const room = `/room/e2e-draft-retry-${crypto.randomUUID()}`;
    await page.goto(room);
    await expect(page.locator(".cm-content")).toBeVisible();
    network.offline();
    await edit(page, "retry backup marker");
    await page.close();
    const reopened = await context.newPage();
    await reopened.addInitScript(() => {
      const original = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        if (localStorage.getItem("test.backupWritable") !== "true") {
          throw new DOMException("full", "QuotaExceededError");
        }
        return original.apply(this, args);
      };
    });
    await reopened.goto(room);
    const recovery = reopened.getByRole("alertdialog");
    await recovery.getByRole("button", { name: "Restore draft", exact: true }).click();
    await expect(
      recovery.getByRole("button", { name: "Discard draft", exact: true }),
    ).toBeDisabled();
    await expect(recovery).toContainText("The changes have been restored");
    await reopened.evaluate(() => localStorage.setItem("test.backupWritable", "true"));
    await recovery.getByRole("button", { name: "Retry backup", exact: true }).click();
    await expect(recovery).toHaveCount(0);
    await expect(reopened.locator(".cm-content")).toBeFocused();
    await expect(reopened.locator('[data-draft-backup="saved"]')).toBeVisible();
    expect(
      (await reopened.locator(".cm-content").innerText()).split("retry backup marker"),
    ).toHaveLength(2);
  } finally {
    await context.close();
  }
});

test("storage failure is visible and keeps the unload guard for unsynced edits", async ({
  browser,
}) => {
  const context = await browser.newContext();
  try {
    await context.addInitScript(() => {
      localStorage.setItem("iris.language", "en");
      IDBFactory.prototype.open = () => {
        throw new DOMException("blocked", "SecurityError");
      };
    });
    const network = await interruptConnection(context);
    const page = await context.newPage();
    await page.goto(`/room/e2e-draft-unavailable-${crypto.randomUUID()}`);
    const editor = page.locator(".cm-content");
    await expect(editor).toBeVisible();
    network.offline();
    await editor.click();
    await editor.press("ControlOrMeta+End");
    await page.keyboard.insertText("\n// keep this tab open");
    await expect(page.locator('[data-draft-backup="error"]')).toContainText(
      "Local backup unavailable",
    );
    const beforeUnload = page.waitForEvent("dialog");
    await page.evaluate(() => {
      setTimeout(() => location.reload(), 0);
    });
    const dialog = await beforeUnload;
    expect(dialog.type()).toBe("beforeunload");
    await dialog.dismiss();
    await expect(editor).toContainText("keep this tab open");
  } finally {
    await context.close();
  }
});
