import { expect, test, type WebSocketRoute } from "playwright/test";

test("warns before leaving with unacknowledged edits and clears the warning after acknowledgement", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("iris.language", "en"));
  let holdAcknowledgements = false;
  let clientSocket: WebSocketRoute | undefined;
  const acknowledgements: (string | Buffer)[] = [];
  await page.routeWebSocket("**/ws/**", (socket) => {
    clientSocket = socket;
    const server = socket.connectToServer();
    socket.onMessage((message) => server.send(message));
    server.onMessage((message) => {
      if (holdAcknowledgements && typeof message === "string" && message.includes('"update:ack"')) {
        acknowledgements.push(message);
      } else socket.send(message);
    });
  });
  await page.goto(`/room/e2e-pending-${crypto.randomUUID()}`);
  const editor = page.locator(".cm-content");
  await expect(editor).toBeVisible();
  await editor.click();
  holdAcknowledgements = true;
  await editor.press("ControlOrMeta+End");
  await page.keyboard.insertText("\n// unacknowledged edit");
  await expect.poll(() => acknowledgements.length).toBeGreaterThan(0);
  await expect(page.locator("[data-sync-pending='true']")).toContainText("Unsynced changes");
  const dialogPromise = page.waitForEvent("dialog");
  await page.evaluate(() => {
    setTimeout(() => location.reload(), 0);
  });
  const dialog = await dialogPromise;
  expect(dialog.type()).toBe("beforeunload");
  await dialog.dismiss();
  await expect(editor).toContainText("unacknowledged edit");

  holdAcknowledgements = false;
  for (const acknowledgement of acknowledgements) clientSocket!.send(acknowledgement);
  await expect(page.locator("[data-sync-pending='true']")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const event = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      }),
    )
    .toBe(false);
});

test("protects offline edits until reconnect sends them to another room member", async ({
  browser,
}) => {
  const writerContext = await browser.newContext();
  const readerContext = await browser.newContext();
  try {
    for (const context of [writerContext, readerContext]) {
      await context.addInitScript(() => localStorage.setItem("iris.language", "en"));
    }
    let allowConnections = true;
    let dropConnection: (() => void) | undefined;
    await writerContext.routeWebSocket("**/ws/**", (socket) => {
      if (!allowConnections) {
        socket.close();
        return;
      }
      const server = socket.connectToServer();
      socket.onMessage((message) => server.send(message));
      server.onMessage((message) => socket.send(message));
      dropConnection = () => {
        server.close();
        socket.close();
      };
    });
    const writer = await writerContext.newPage();
    const reader = await readerContext.newPage();
    const room = `/room/e2e-offline-${crypto.randomUUID()}`;
    await writer.goto(room);
    await reader.goto(room);
    const editor = writer.locator(".cm-content");
    await expect(editor).toBeVisible();
    await expect(reader.locator(".cm-content")).toBeVisible();
    allowConnections = false;
    dropConnection!();
    await expect(writer.locator(".status-label")).toHaveText("reconnecting");
    await expect(writer.locator("[data-sync-pending='true']")).toHaveCount(0);
    await editor.click();
    await editor.press("ControlOrMeta+End");
    await writer.keyboard.insertText("\n// offline recovery marker");
    await expect(writer.locator("[data-sync-pending='true']")).toBeVisible();
    await expect(reader.locator(".cm-content")).not.toContainText("offline recovery marker");
    allowConnections = true;
    await expect(reader.locator(".cm-content")).toContainText("offline recovery marker");
    await expect(writer.locator("[data-sync-pending='true']")).toHaveCount(0);
  } finally {
    await writerContext.close();
    await readerContext.close();
  }
});
