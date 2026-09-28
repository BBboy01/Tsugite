import { expect, test, type Locator, type Page } from "playwright/test";

async function openSearch(page: Page) {
  await page.locator(".cm-content").focus();
  await page.keyboard.press("ControlOrMeta+p");
  await expect(page.getByPlaceholder("Search files...")).toBeVisible();
}

async function isWithinScrollport(item: Locator) {
  return item.evaluate((element) => {
    const container =
      element.closest('[role="listbox"], [role="tablist"]') ?? element.parentElement;
    if (!container) return false;
    const bounds = element.getBoundingClientRect();
    const viewport = container.getBoundingClientRect();
    return (
      bounds.top >= viewport.top &&
      bounds.bottom <= viewport.bottom &&
      bounds.left >= viewport.left &&
      bounds.right <= viewport.right
    );
  });
}

async function getTextContrast(element: Locator, pseudoElement?: string) {
  return element.evaluate((node, pseudo) => {
    const dialog = node.closest<HTMLElement>('[role="dialog"]');
    const context = document.createElement("canvas").getContext("2d");
    if (!dialog || !context) return 0;

    const readColor = (color: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data);
    };
    const foreground = readColor(getComputedStyle(node, pseudo).color);
    const background = readColor(getComputedStyle(dialog).backgroundColor);
    const alpha = foreground[3]! / 255;
    const composite = foreground
      .slice(0, 3)
      .map((channel, index) => channel! * alpha + background[index]! * (1 - alpha));
    const coefficients = [0.2126, 0.7152, 0.0722];
    const luminance = (channels: number[]) =>
      channels
        .map((channel) => {
          const normalized = channel / 255;
          return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
        })
        .reduce((sum, channel, index) => sum + channel * coefficients[index]!, 0);
    const foregroundLuminance = luminance(composite);
    const backgroundLuminance = luminance(background.slice(0, 3));
    return (
      (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
      (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
    );
  }, pseudoElement ?? null);
}

async function getFontSize(element: Locator) {
  return element.evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (window.top === window) localStorage.setItem("iris.language", "en");
  });
  await page.goto(`/room/e2e-ux-navigation-${crypto.randomUUID()}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
});

test("keeps keyboard-selected file results visible and wraps both navigation bindings", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1000, height: 300 });
  await openSearch(page);
  const input = page.getByPlaceholder("Search files...");
  const results = page.getByRole("dialog").locator("button");
  const count = await results.count();
  expect(count).toBeGreaterThan(1);
  for (let index = 1; index < count; index++) await input.press("ArrowDown");
  await expect(results.last()).toHaveClass(/text-iris-strong/);
  await expect.poll(() => isWithinScrollport(results.last())).toBe(true);
  await input.press("ArrowDown");
  await expect(results.first()).toHaveAttribute("aria-selected", "true");
  await input.press("ArrowUp");
  await expect(results.last()).toHaveAttribute("aria-selected", "true");
  await input.press("Control+n");
  await expect(results.first()).toHaveAttribute("aria-selected", "true");
  await input.press("Control+p");
  await expect(results.last()).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => isWithinScrollport(results.last())).toBe(true);
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute("role", "combobox");
  await expect(input).toHaveAttribute(
    "aria-activedescendant",
    (await results.last().getAttribute("id")) ?? "",
  );
});

test("recovers file selection after navigating an empty result list", async ({ page }) => {
  await openSearch(page);
  const input = page.getByPlaceholder("Search files...");
  await input.fill("no-such-project-file-xyz");
  await input.press("ArrowDown");
  await input.press("Control+p");
  await input.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(input).not.toHaveAttribute("aria-activedescendant");
  await input.fill("src/main.tsx");
  const result = page.getByRole("option", { name: "src/main.tsx" });
  await expect(result).toHaveAttribute("aria-selected", "true");
  await input.press("Enter");
  await expect(page.getByRole("region", { name: "Editing src/main.tsx" })).toBeVisible();
});

test("replaces the command palette when opening settings or file search", async ({ page }) => {
  const editor = page.locator(".cm-content");
  await editor.focus();
  await page.keyboard.press("ControlOrMeta+k");

  let dialog = page.getByRole("dialog");
  await expect(dialog).toHaveCount(1);
  await dialog.getByRole("button", { name: /^Open settings/ }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog).toHaveCount(1);
  await expect(dialog.getByPlaceholder("Search settings...")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await editor.focus();
  await page.keyboard.press("ControlOrMeta+k");
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /^Open file/ }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(page.getByPlaceholder("Search files...")).toBeVisible();
});

test("names the command palette search input for assistive technology", async ({ page }) => {
  await page.locator(".cm-content").focus();
  await page.keyboard.press("ControlOrMeta+k");

  const search = page.getByPlaceholder("Search commands...");
  await expect(search).toHaveAttribute("aria-label", "Search commands...");
  await expect(
    page.getByRole("textbox", { name: "Search commands...", exact: true }),
  ).toBeFocused();
});

test("keeps inactive search text and placeholders at 4.5:1 contrast", async ({
  page,
}, testInfo) => {
  const editor = page.locator(".cm-content");
  await editor.focus();
  await page.keyboard.press("ControlOrMeta+k");
  await page.mouse.move(0, 0);

  const palette = page.getByRole("dialog");
  const paletteSearch = page.getByPlaceholder("Search commands...");
  expect(await getTextContrast(palette.getByRole("button").nth(1))).toBeGreaterThanOrEqual(4.5);
  expect(
    await getTextContrast(
      palette.getByRole("button", { name: "Open settings" }).locator("span").last(),
    ),
  ).toBeGreaterThanOrEqual(4.5);
  expect(await getTextContrast(paletteSearch, "::placeholder")).toBeGreaterThanOrEqual(4.5);

  await page.keyboard.press("Escape");
  await openSearch(page);
  await page.mouse.move(0, 0);

  const fileDialog = page.getByRole("dialog");
  const fileSearch = page.getByPlaceholder("Search files...");
  const lightFile = fileDialog.getByRole("option", { name: "src/index.css", exact: true });
  await expect(lightFile).toHaveAttribute("aria-selected", "false");
  await page.screenshot({ path: testInfo.outputPath("file-search-light.png") });
  expect
    .soft(await getTextContrast(lightFile.locator("[data-file-name]")))
    .toBeGreaterThanOrEqual(4.5);
  expect
    .soft(await getTextContrast(lightFile.locator("[data-file-directory]")))
    .toBeGreaterThanOrEqual(4.5);
  expect(await getTextContrast(fileSearch, "::placeholder")).toBeGreaterThanOrEqual(4.5);

  await page.keyboard.press("Escape");
  await editor.focus();
  await page.keyboard.press("ControlOrMeta+k");
  const commandSearch = page.getByPlaceholder("Search commands...");
  await commandSearch.fill("Choose theme");
  await commandSearch.press("Enter");
  const themeSearch = page.getByPlaceholder("Choose theme: Search commands...");
  await themeSearch.fill("Ink Dark");
  await themeSearch.press("Enter");
  await expect(page.getByRole("dialog")).toBeHidden();

  await editor.focus();
  await page.keyboard.press("ControlOrMeta+k");
  await page.mouse.move(0, 0);
  const darkPalette = page.getByRole("dialog");
  const darkPaletteSearch = page.getByPlaceholder("Search commands...");
  expect(await getTextContrast(darkPalette.getByRole("button").nth(1))).toBeGreaterThanOrEqual(4.5);
  expect(
    await getTextContrast(
      darkPalette.getByRole("button", { name: "Open settings" }).locator("span").last(),
    ),
  ).toBeGreaterThanOrEqual(4.5);
  expect(await getTextContrast(darkPaletteSearch, "::placeholder")).toBeGreaterThanOrEqual(4.5);
  await darkPaletteSearch.fill("Open file");
  await darkPaletteSearch.press("Enter");
  const darkFileDialog = page.getByRole("dialog");
  const darkFileSearch = page.getByPlaceholder("Search files...");
  await expect(darkFileSearch).toBeVisible();
  const darkFile = darkFileDialog.getByRole("option", { name: "src/index.css", exact: true });
  await expect(darkFile).toHaveAttribute("aria-selected", "false");
  await page.screenshot({ path: testInfo.outputPath("file-search-dark.png") });
  expect
    .soft(await getTextContrast(darkFile.locator("[data-file-name]")))
    .toBeGreaterThanOrEqual(4.5);
  expect
    .soft(await getTextContrast(darkFile.locator("[data-file-directory]")))
    .toBeGreaterThanOrEqual(4.5);
  expect(await getTextContrast(darkFileSearch, "::placeholder")).toBeGreaterThanOrEqual(4.5);
});

test("uses mobile-friendly font sizes in workspace search inputs", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const editor = page.locator(".cm-content");

  await editor.focus();
  await page.keyboard.press("ControlOrMeta+k");
  await expect(
    getFontSize(page.getByPlaceholder("Search commands...")),
  ).resolves.toBeGreaterThanOrEqual(16);

  await page.keyboard.press("Escape");
  await openSearch(page);
  await expect(
    getFontSize(page.getByPlaceholder("Search files...")),
  ).resolves.toBeGreaterThanOrEqual(16);

  await page.keyboard.press("Escape");
  await editor.focus();
  await page.keyboard.press("ControlOrMeta+k");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Open settings/ })
    .click();
  await expect(
    getFontSize(page.getByRole("textbox", { name: "Search settings" })),
  ).resolves.toBeGreaterThanOrEqual(16);
});

test("keeps workspace dialogs inside a 320px viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  const editor = page.locator(".cm-content");
  const assertDialogFits = async () => {
    const bounds = await page.getByRole("dialog").evaluate((element) => {
      const { left, right } = element.getBoundingClientRect();
      return { left, right };
    });
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(320);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
  };

  await editor.focus();
  await page.keyboard.press("ControlOrMeta+k");
  await assertDialogFits();
  const paletteSearch = page.getByPlaceholder("Search commands...");
  await paletteSearch.fill("Open file");
  await paletteSearch.press("Enter");
  await assertDialogFits();
  await page.keyboard.press("Escape");

  await editor.focus();
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByPlaceholder("Search commands...").fill("Open settings");
  await page.getByPlaceholder("Search commands...").press("Enter");
  await assertDialogFits();
});

test("navigates open tabs with arrows, Home and End while keeping the focused tab visible", async ({
  page,
}) => {
  for (const name of ["index.html", "package.json", "main.tsx", "index.css", "tsconfig.json"]) {
    await page.getByRole("treeitem", { name, exact: true }).click();
  }
  const tabs = page.getByRole("tab");
  const first = tabs.first();
  const last = tabs.last();
  await last.focus();
  await last.press("Home");
  await expect(first).toBeFocused();
  await first.press("ArrowLeft");
  await expect(last).toBeFocused();
  await last.press("ArrowRight");
  await expect(first).toBeFocused();
  await first.press("End");
  await expect(last).toBeFocused();
  await expect(page.getByRole("tablist").locator('[role="tab"][tabindex="0"]')).toHaveCount(1);
  await expect.poll(() => isWithinScrollport(last)).toBe(true);
  await last.press("Home");
  await expect(first).toHaveAttribute("aria-selected", "false");
  await first.press("Enter");
  await expect(first).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".cm-content")).toBeFocused();
  await first.focus();
  await first.press("End");
  await last.press("Space");
  await expect(last).toHaveAttribute("aria-selected", "true");
});

test("reveals the active tab after selecting an offscreen file from search", async ({ page }) => {
  for (const name of ["index.html", "package.json", "main.tsx", "index.css", "tsconfig.json"]) {
    await page.getByRole("treeitem", { name, exact: true }).click();
  }
  await page.getByRole("treeitem", { name: "App.tsx", exact: true }).click();
  const tablist = page.getByRole("tablist");
  await expect
    .poll(() => tablist.evaluate((element) => element.scrollWidth > element.clientWidth))
    .toBe(true);
  await tablist.evaluate((element) => {
    element.scrollLeft = 0;
  });
  await openSearch(page);
  await page.getByPlaceholder("Search files...").fill("tsconfig.json");
  await page.keyboard.press("Enter");
  const active = page.getByRole("tab", { name: "tsconfig.json", exact: true });
  await expect(active).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => isWithinScrollport(active)).toBe(true);
});
