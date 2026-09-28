import { expect, test, type Page } from "playwright/test";

async function literalColor(page: Page, expression: string) {
  return page.evaluate((color) => {
    const probe = document.createElement("span");
    probe.style.color = color;
    document.body.append(probe);
    const result = getComputedStyle(probe).color;
    probe.remove();
    return result;
  }, expression);
}

test("theme-derived colors follow nested boundaries and portal dialogs", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("iris.language", "en"));
  await page.goto(`/room/theme-tokens-${crypto.randomUUID()}`);

  const folderLabel = page
    .getByRole("treeitem", { name: "src folder", exact: true })
    .locator("span.truncate");
  const gutter = page.locator(".cm-gutters");
  await expect(folderLabel).toHaveCSS(
    "color",
    await literalColor(page, "color-mix(in srgb, #6e6e73 45%, transparent)"),
  );
  await expect(gutter).toHaveCSS(
    "color",
    await literalColor(page, "color-mix(in srgb, #6e6e73 45%, transparent)"),
  );

  const nestedColors = await folderLabel.evaluate((label) => {
    const dark = document.createElement("div");
    dark.className = "theme-dracula";
    const light = document.createElement("div");
    light.className = "theme-github-light";
    const darkLabel = label.cloneNode(true) as HTMLElement;
    const lightLabel = label.cloneNode(true) as HTMLElement;
    dark.append(darkLabel, light);
    light.append(lightLabel);
    document.querySelector("main")?.append(dark);
    const result = [getComputedStyle(darkLabel).color, getComputedStyle(lightLabel).color];
    dark.remove();
    return result;
  });
  expect(nestedColors).toEqual([
    await literalColor(page, "color-mix(in srgb, #a7a9b5 45%, transparent)"),
    await literalColor(page, "color-mix(in srgb, #59636e 45%, transparent)"),
  ]);

  await page.locator(".cm-content").focus();
  await page.keyboard.press("ControlOrMeta+K");
  const dialog = page.getByRole("dialog");
  const paletteSearch = dialog.locator("input").first();
  await expect
    .poll(() => paletteSearch.evaluate((input) => getComputedStyle(input, "::placeholder").color))
    .toBe(await literalColor(page, "color-mix(in srgb, #6e6e73 45%, #343438)"));
  await page.getByRole("button", { name: "Choose theme", exact: true }).click();
  await page.getByRole("button", { name: "Dracula", exact: true }).hover();
  await expect
    .poll(() => paletteSearch.evaluate((input) => getComputedStyle(input, "::placeholder").color))
    .toBe(await literalColor(page, "color-mix(in srgb, #a7a9b5 45%, #e6e6dc)"));
  await page.getByRole("button", { name: "Dracula", exact: true }).click();

  await expect(folderLabel).toHaveCSS(
    "color",
    await literalColor(page, "color-mix(in srgb, #a7a9b5 45%, transparent)"),
  );
  await expect(gutter).toHaveCSS(
    "color",
    await literalColor(page, "color-mix(in srgb, #a7a9b5 45%, transparent)"),
  );

  await page.getByRole("button", { name: "Open settings" }).click();
  const language = page.getByLabel("Language");
  await language.focus();
  await expect(language).toHaveCSS(
    "outline-color",
    await literalColor(page, "color-mix(in srgb, #bd93f9 72%, white)"),
  );
  await expect(language).toHaveCSS("outline-width", "2px");
});
