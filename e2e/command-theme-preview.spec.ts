import { expect, test } from "playwright/test";

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
    await page.keyboard.press("ControlOrMeta+K");
    await page.getByRole("button", { name: "Choose theme", exact: true }).click();
    await page.getByRole("button", { name: "Dracula", exact: true }).hover();
    await expect(page.locator("main")).toHaveClass(/theme-dracula/);
    await expect(peer.locator("main")).toHaveClass(/theme-paper/);
    await page.getByRole("button", { name: "Dracula", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
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
    await expect(current).toHaveClass(/accent/);
    await expect(checkedOptions).toHaveCount(1);
    await expect(checkedOptions).toHaveText("Kanagawa");
    await expect(main).toHaveClass(/theme-kanagawa-wave/);

    await page.keyboard.press("ArrowUp");
    await expect(previous).toHaveClass(/accent/);
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
    await expect(current).toHaveClass(/accent/);
    await expect(current).toBeInViewport({ ratio: 1 });

    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    await expect(main).toHaveClass(/theme-everforest-dark/);
    await openThemes();
    await expect(previous).toHaveClass(/accent/);
    await expect(previous).toBeInViewport({ ratio: 1 });
    await expect(checkedOptions).toHaveCount(1);
    await expect(checkedOptions).toHaveText("Everforest");
  });
}
