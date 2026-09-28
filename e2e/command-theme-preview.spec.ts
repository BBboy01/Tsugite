import { expect, test } from "playwright/test";
import { selectedBackground } from "./theme-selection-style";

for (const shortcut of ["ControlOrMeta+,", "ControlOrMeta+p"]) {
  test(`replacing the theme palette with ${shortcut} discards the unconfirmed preview`, async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem("iris.language", "en"));
    await page.goto(`/room/theme-replaced-${crypto.randomUUID()}`);
    await expect(page.locator(".cm-content")).toBeFocused();
    await page.keyboard.press("ControlOrMeta+k");
    await page.getByRole("button", { name: "Choose theme", exact: true }).click();
    const theme = page.getByRole("button", { name: "Dracula", exact: true });
    await theme.hover();
    await expect(page.locator("main")).toHaveClass(/theme-dracula/);
    await theme.focus();
    await page.keyboard.press(shortcut);
    await expect(page.getByPlaceholder("Choose theme: Search commands...")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator("main")).toHaveClass(/theme-paper/);
    await expect(page.locator(".cm-content")).toBeFocused();
  });
}

test("discarded theme loading cannot overwrite the restored editor colors", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("iris.language", "en"));
  const pendingTheme = Promise.withResolvers<void>();
  const themeRequested = Promise.withResolvers<void>();
  await page.route("**/@shikijs_themes_dracula.js*", async (route) => {
    themeRequested.resolve();
    await pendingTheme.promise;
    await route.continue();
  });
  try {
    await page.goto(`/room/theme-cancel-loading-${crypto.randomUUID()}`);
    const editor = page.locator(".cm-content");
    const coloredTokens = editor.locator("span[style*='color:']");
    await expect(coloredTokens.first()).toBeVisible();
    const colors = () =>
      coloredTokens.evaluateAll((tokens) => tokens.map((token) => token.getAttribute("style")));
    const originalColors = await colors();

    await editor.focus();
    await page.keyboard.press("ControlOrMeta+K");
    await page.getByRole("button", { name: "Choose theme", exact: true }).click();
    await page.getByRole("button", { name: "Dracula", exact: true }).hover();
    await themeRequested.promise;
    await expect(page.locator("main")).toHaveClass(/theme-dracula/);
    await page.keyboard.press("Escape");
    await expect(page.locator("main")).toHaveClass(/theme-paper/);
    await expect.poll(colors).toEqual(originalColors);

    pendingTheme.resolve();
    await page.evaluate(async () => {
      const modulePath = "/src/lib/shiki-engine.ts";
      const { highlightShikiTokens } = await import(/* @vite-ignore */ modulePath);
      await highlightShikiTokens("const value = 1", "tsx", "dracula");
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await expect.poll(colors).toEqual(originalColors);
  } finally {
    pendingTheme.resolve();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("preview stays local and a closed palette follows later committed theme changes", async ({
  page,
  browser,
}) => {
  const peer = await browser.newPage();
  try {
    const room = `/room/theme-sharing-${crypto.randomUUID()}`;
    for (const participant of [page, peer]) {
      await participant.addInitScript(() => localStorage.setItem("iris.language", "en"));
      await participant.goto(room);
      await expect(participant.locator(".cm-content")).toBeVisible();
      await expect(participant.locator('[data-status="live"]').first()).toBeVisible();
    }
    await page.locator(".cm-content").focus();
    const editorElement = await page.locator(".cm-editor").elementHandle();
    if (!editorElement) throw new Error("Editor did not mount");
    await page.keyboard.press("ControlOrMeta+K");
    await page.getByRole("button", { name: "Choose theme", exact: true }).click();
    await page.getByRole("button", { name: "Dracula", exact: true }).hover();
    await expect(page.locator("main")).toHaveClass(/theme-dracula/);
    await expect(peer.locator("main")).toHaveClass(/theme-paper/);
    await page.getByRole("button", { name: "Dracula", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect.poll(() => editorElement.evaluate((element) => element.isConnected)).toBe(true);
    await expect(peer.locator("main")).toHaveClass(/theme-dracula/);

    await peer.locator(".cm-content").focus();
    await peer.keyboard.press("ControlOrMeta+K");
    await peer.getByRole("button", { name: "Choose theme", exact: true }).click();
    await peer.getByRole("button", { name: "GitHub Light", exact: true }).click();
    await expect(peer.getByRole("dialog")).toBeHidden();
    await expect(page.locator("main")).toHaveClass(/theme-github-light/);
  } finally {
    await peer.close();
  }
});

for (const width of [1280, 390]) {
  test(`theme preview keeps the committed checkmark and opens at the current theme at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 720 });
    await page.addInitScript(() => localStorage.setItem("iris.language", "en"));
    await page.goto(`/room/theme-selection-${crypto.randomUUID()}`);
    const editor = page.locator(".cm-content");
    await expect(editor).toBeVisible();
    const main = page.locator("main");
    const dialog = page.getByRole("dialog");
    const checkedOptions = dialog
      .getByRole("button")
      .filter({ has: page.locator("svg.lucide-check") });
    const openThemes = async () => {
      await editor.focus();
      await page.keyboard.press("ControlOrMeta+K");
      await page.getByRole("button", { name: "Choose theme", exact: true }).click();
    };

    await openThemes();
    await page.getByRole("button", { name: "Kanagawa", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(main).toHaveClass(/theme-kanagawa-wave/);

    await openThemes();
    const current = dialog.getByRole("button", { name: "Kanagawa", exact: true });
    const previous = dialog.getByRole("button", { name: "Everforest", exact: true });
    await expect(current).toBeInViewport({ ratio: 1 });
    await expect(current).toHaveCSS("background-color", await selectedBackground(page, "#7e9cd8"));
    await expect(previous).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(checkedOptions).toHaveCount(1);
    await expect(checkedOptions).toHaveText("Kanagawa");
    await expect(main).toHaveClass(/theme-kanagawa-wave/);

    await page.keyboard.press("ArrowUp");
    await expect(previous).toHaveCSS("background-color", await selectedBackground(page, "#a7c080"));
    await expect(current).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(main).toHaveClass(/theme-everforest-dark/);
    await expect(checkedOptions).toHaveCount(1);
    await expect(checkedOptions).toHaveText("Kanagawa");
    await expect(previous.locator("svg.lucide-check")).toHaveCount(0);
    await page.screenshot({ path: `/tmp/iris-theme-current-${width}.png` });

    await dialog.getByRole("button", { name: "One Dark Pro", exact: true }).hover();
    await expect(main).toHaveClass(/theme-one-dark-pro/);
    await expect(checkedOptions).toHaveText("Kanagawa");
    await page.keyboard.press("Escape");
    await expect(main).toHaveClass(/theme-kanagawa-wave/);
    await page.getByRole("button", { name: "Choose theme", exact: true }).click();
    await expect(current).toHaveCSS("background-color", await selectedBackground(page, "#7e9cd8"));
    await expect(previous).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(current).toBeInViewport({ ratio: 1 });

    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    await expect(main).toHaveClass(/theme-everforest-dark/);
    await openThemes();
    await expect(previous).toHaveCSS("background-color", await selectedBackground(page, "#a7c080"));
    await expect(current).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(previous).toBeInViewport({ ratio: 1 });
    await expect(checkedOptions).toHaveCount(1);
    await expect(checkedOptions).toHaveText("Everforest");
  });
}
