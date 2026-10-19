import { expect, test } from "playwright/test";

const themes = [
  { name: "Paper Light", id: "paper", accent: "#007aff", width: 1280 },
  { name: "Ink Dark", id: "ink", accent: "#ff9f0a", width: 1280 },
  { name: "Dracula", id: "dracula", accent: "#bd93f9", width: 1280 },
  { name: "Everforest", id: "everforest-dark", accent: "#a7c080", width: 1280 },
  { name: "Dracula", id: "dracula", accent: "#bd93f9", width: 390 },
];

for (const theme of themes) {
  test(`keeps selection and completion themed in ${theme.name} at ${theme.width}px`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.setViewportSize({ width: theme.width, height: 800 });
    await page.addInitScript(() => {
      if (window === window.top) localStorage.setItem("iris.language", "en");
    });
    await page.goto(`/room/selection-theme-${crypto.randomUUID()}`);
    await expect(page).toHaveTitle(/Tsugite/);
    const content = page.locator(".cm-content");
    const editor = page.locator(".cm-editor");
    await expect(content).toBeFocused();

    await page.keyboard.press("ControlOrMeta+K");
    await page.getByRole("button", { name: "Choose theme", exact: true }).click();
    await page.getByRole("button", { name: theme.name, exact: true }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.locator("main")).toHaveClass(new RegExp(`theme-${theme.id}`));
    await expect(content).toBeFocused();

    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.insertText('const greeting = "Tsugite";\nconsole.log(greeting);');
    const tokens = content.locator(".cm-shiki[style*='color:']").filter({ hasText: /\S{3}/ });
    await expect.poll(() => tokens.count()).toBeGreaterThan(2);
    const tokenColors = () =>
      tokens.evaluateAll((elements) => elements.map((element) => getComputedStyle(element).color));
    const originalColors = await tokenColors();
    expect(new Set(originalColors).size).toBeGreaterThan(1);
    const activeLine = content.locator(".cm-activeLine");
    await expect(activeLine).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

    await page.keyboard.press("Shift+ArrowLeft");
    await expect(activeLine).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await page.keyboard.press("ArrowRight");
    await expect(activeLine).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

    await page.keyboard.press("ControlOrMeta+A");
    await expect(editor).toHaveClass(/cm-focused/);
    await expect(activeLine).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    const selection = page.locator(".cm-selectionBackground");
    await expect(selection.first()).toBeVisible();
    const expectedBackground = await editor.evaluate((element, accent) => {
      const probe = document.createElement("span");
      probe.style.backgroundColor = `color-mix(in srgb, ${accent} 12%, transparent)`;
      element.append(probe);
      const color = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return color;
    }, theme.accent);
    await expect(selection.first()).toHaveCSS("background-color", expectedBackground);
    await expect(activeLine).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    expect(await tokenColors()).toEqual(originalColors);
    const nativeSelection = await tokens.evaluateAll((elements) =>
      elements.map((element) => getComputedStyle(element, "::selection").backgroundColor),
    );
    expect(nativeSelection.every((background) => background === "rgba(0, 0, 0, 0)")).toBe(true);
    const screenshot = await content.screenshot();
    const renderedColors = await page.evaluate(
      async ({ png, colors }) => {
        const image = new Image();
        image.src = `data:image/png;base64,${png}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        return colors.map((color) => {
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          const target = context.getImageData(0, 0, 1, 1).data;
          for (let i = 0; i < pixels.length; i += 4) {
            if (
              [0, 1, 2].every((channel) => Math.abs(pixels[i + channel]! - target[channel]!) < 12)
            )
              return true;
          }
          return false;
        });
      },
      { png: screenshot.toString("base64"), colors: [...new Set(originalColors)] },
    );
    expect(renderedColors.every(Boolean)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("selected.png") });

    await page.getByRole("tab", { name: "src/App.tsx", exact: true }).focus();
    await expect(editor).not.toHaveClass(/cm-focused/);
    await expect(selection.first()).toHaveCSS("background-color", expectedBackground);
    expect(await tokenColors()).toEqual(originalColors);

    await content.focus();
    await page.keyboard.insertText("con");
    await expect(activeLine).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await page.keyboard.press("Control+Space");
    const popup = page.locator(".cm-tooltip-autocomplete");
    await expect(popup).toBeVisible();
    const styles = await popup.evaluate((element) => {
      const editorElement = element.closest(".cm-editor")!;
      const selected = element.querySelector("li[aria-selected]")!;
      const matched = selected.querySelector(".cm-completionMatchedText")!;
      const probe = document.createElement("span");
      probe.style.color = "var(--accent-deep)";
      probe.style.backgroundColor = "var(--editor-surface)";
      editorElement.append(probe);
      const result = {
        color: getComputedStyle(element).color,
        ink: getComputedStyle(editorElement).color,
        background: getComputedStyle(element).backgroundColor,
        surface: getComputedStyle(probe).backgroundColor,
        selectedColor: getComputedStyle(selected).color,
        selectedBackground: getComputedStyle(selected).backgroundColor,
        matchedColor: getComputedStyle(matched).color,
        accent: getComputedStyle(probe).color,
      };
      probe.remove();
      return result;
    });
    expect(styles.color).toBe(styles.ink);
    expect(styles.background).toBe(styles.surface);
    expect(styles.selectedColor).toBe(styles.ink);
    expect(styles.selectedBackground).toBe(expectedBackground);
    expect(styles.matchedColor).toBe(styles.accent);
    await page.screenshot({ path: testInfo.outputPath("completion.png") });
    await page.keyboard.press("Enter");
    await expect(popup).toBeHidden();
    await expect(content).toBeFocused();
    await expect(page.locator("vite-error-overlay")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test("themes native selection when CodeMirror uses the iOS fallback", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperties(navigator, {
      vendor: { get: () => "Apple Computer, Inc." },
      maxTouchPoints: { get: () => 5 },
    });
    if (window === window.top) localStorage.setItem("iris.language", "en");
  });
  await page.goto(`/room/selection-native-${crypto.randomUUID()}`);
  const content = page.locator(".cm-content");
  await expect(content).toBeFocused();
  await page.keyboard.press("ControlOrMeta+K");
  await page.getByRole("button", { name: "Choose theme", exact: true }).click();
  await page.getByRole("button", { name: "Dracula", exact: true }).click();
  await expect(content).toBeFocused();
  await page.keyboard.press("Meta+A");
  await expect(page.locator(".cm-selectionBackground")).toHaveCount(0);
  const styles = await content.evaluate((element) => {
    const probe = document.createElement("span");
    probe.style.backgroundColor = "color-mix(in srgb, #bd93f9 12%, transparent)";
    element.append(probe);
    const expected = getComputedStyle(probe).backgroundColor;
    probe.remove();
    const line = element.querySelector(".cm-line")!;
    return { background: getComputedStyle(line, "::selection").backgroundColor, expected };
  });
  expect(styles.background).toBe(styles.expected);
});

for (const mode of ["v", "V", "Control+v"]) {
  test(`hides the active-line background in Vim ${mode} mode and restores it on escape`, async ({
    page,
  }, testInfo) => {
    await page.addInitScript(() => {
      if (window === window.top) localStorage.setItem("tsugite.vim-mode", "true");
    });
    await page.goto(`/room/selection-vim-${crypto.randomUUID()}`);
    const content = page.locator(".cm-content");
    await expect(content).toBeFocused();
    await page.keyboard.press("g");
    await page.keyboard.press("g");
    const activeLine = content.locator(".cm-activeLine");
    await expect(activeLine).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await page.keyboard.press(mode);
    await page.keyboard.press("l");
    await expect(page.locator(".cm-selectionBackground").first()).toBeVisible();
    await expect(activeLine).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await page.screenshot({ path: testInfo.outputPath("vim-selection.png") });
    await page.keyboard.press("Escape");
    await expect(activeLine).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  });
}
