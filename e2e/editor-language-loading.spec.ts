import { expect, test } from "playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (window === window.top) localStorage.setItem("iris.language", "en");
  });
});

test("keeps editing while language services load and enables an already open menu", async ({
  page,
}) => {
  const release = Promise.withResolvers<void>();
  const requested = Promise.withResolvers<void>();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/src/lib/typescript-environment.ts*", async (route) => {
    requested.resolve();
    await release.promise;
    await route.continue();
  });
  try {
    await page.goto(`/room/language-delay-${crypto.randomUUID()}`, {
      waitUntil: "domcontentloaded",
    });
    await requested.promise;
    const content = page.locator(".cm-content");
    await expect(content).toBeFocused();
    await page.locator(".cm-editor").evaluate((element) => {
      element.setAttribute("data-test-editor-instance", "original");
    });
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.insertText("const answer = 42;\nconsole.log(answer);");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Shift+F10");
    const definition = page.getByRole("menuitem", { name: "Go to definition", exact: true });
    await expect(definition).toBeDisabled();

    release.resolve();
    await expect(definition).toBeEnabled({ timeout: 15_000 });
    await definition.click();
    await expect(page.locator(".cm-activeLine")).toHaveText("const answer = 42;");
    await expect(content).toBeFocused();
    await expect(page.locator(".cm-editor")).toHaveAttribute(
      "data-test-editor-instance",
      "original",
    );
    await expect(page.locator("vite-error-overlay")).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    release.resolve();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("keeps editing and collaboration available when language services fail to load", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/src/lib/typescript-environment.ts*", (route) => route.abort("failed"));
  const room = `/room/language-failure-${crypto.randomUUID()}`;
  await page.goto(room, { waitUntil: "domcontentloaded" });
  const content = page.locator(".cm-content");
  await expect(content).toBeFocused();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText("const survives = 42;");
  await page.keyboard.press("Shift+F10");
  await expect(
    page.getByRole("menuitem", { name: "Go to definition", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("menuitem", { name: "Select all", exact: true })).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(content).toBeFocused();

  const peer = await browser.newPage();
  try {
    await peer.goto(room, { waitUntil: "domcontentloaded" });
    await expect
      .poll(() =>
        peer.locator(".cm-content").evaluate((element) => {
          const clone = element.cloneNode(true) as HTMLElement;
          clone.querySelectorAll(".cm-remote-cursor-label").forEach((label) => label.remove());
          return clone.textContent;
        }),
      )
      .toBe("const survives = 42;");
    await expect(page).toHaveTitle(/Tsugite/i);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.screenshot({ path: "/tmp/iris-language-fallback-desktop.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(content).toBeVisible();
    await page.screenshot({ path: "/tmp/iris-language-fallback-narrow.png" });
    await expect(page.locator("vite-error-overlay")).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await peer.close();
  }
});

test("discards pending language services after switching to a non-TypeScript file", async ({
  page,
}) => {
  const release = Promise.withResolvers<void>();
  const requested = Promise.withResolvers<void>();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/src/lib/typescript-environment.ts*", async (route) => {
    requested.resolve();
    await release.promise;
    await route.continue();
  });
  try {
    await page.goto(`/room/language-switch-${crypto.randomUUID()}`, {
      waitUntil: "domcontentloaded",
    });
    await requested.promise;
    await expect(page.locator(".cm-content")).toBeFocused();
    await page.getByRole("treeitem", { name: "index.html", exact: true }).click();
    await expect(page.locator(".cm-content")).toBeFocused();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.insertText("<p>still editing HTML</p>");
    release.resolve();
    await page.evaluate(async () => {
      const modulePath = "/src/lib/typescript-environment.ts";
      await import(/* @vite-ignore */ modulePath);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await expect(page.locator(".cm-content")).toHaveText("<p>still editing HTML</p>");
    await page.keyboard.press("Shift+F10");
    const definition = page.getByRole("menuitem", { name: "Go to definition", exact: true });
    await expect(definition).toBeDisabled();
    await page.keyboard.press("Escape");
    await page.getByRole("tab", { name: "src/App.tsx", exact: true }).click();
    await expect(page.locator(".cm-content")).toBeFocused();
    await page.keyboard.press("Shift+F10");
    await expect(definition).toBeEnabled();
    await page.keyboard.press("Escape");
    await expect(page.locator(".cm-editor")).toHaveCount(1);
    expect(errors).toEqual([]);
  } finally {
    release.resolve();
    await page.unrouteAll({ behavior: "wait" });
  }
});
