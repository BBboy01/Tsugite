import { expect, test, type Page } from "playwright/test";

async function keys(page: Page, sequence: string) {
  for (const key of sequence) await page.keyboard.press(key);
}

function getActiveLineIndex(page: Page) {
  return page
    .locator(".cm-line")
    .evaluateAll((lines) => lines.findIndex((line) => line.classList.contains("cm-activeLine")));
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("tsugite.vim-mode", "true");
    localStorage.setItem("iris.language", "en");
  });
  await page.goto(`/room/e2e-vim-keyboard-${crypto.randomUUID()}`);
  await expect(page.locator(".cm-editor")).toBeVisible();
  await page.locator(".cm-content").focus();
  await keys(page, "ggVGc");
  await page.keyboard.insertText("abcdef\nx\n\nxyz");
  await page.keyboard.press("Escape");
  await keys(page, "gg0");
  await expect(page.locator(".cm-line")).toHaveText(["abcdef", "x", "", "xyz"]);
});

for (const style of ["block", "line", "underline"]) {
  test(`repeated l reaches the last character with ${style} cursor`, async ({ page }) => {
    await page.getByRole("button", { name: "Open shared settings" }).click();
    await page.getByRole("button", { name: "Editor", exact: true }).click();
    await page.getByLabel("Normal mode cursor").selectOption(style);
    await page.getByRole("button", { name: "Close settings" }).click();
    await expect(page.getByRole("button", { name: "Open shared settings" })).toBeFocused();
    await page.locator(".cm-content").focus();
    await keys(page, "gg0");
    for (let i = 0; i < 20; i++) await page.keyboard.down("l");
    await page.keyboard.up("l");
    const cursor = page.locator(".cm-vimCursorLayer .cm-fat-cursor");
    await expect(cursor).toHaveText("f");
    await expect(cursor).toBeVisible();
    await page.keyboard.press("x");
    await expect(page.locator(".cm-line")).toHaveText(["abcde", "x", "", "xyz"]);
    await keys(page, "G0" + "l".repeat(20) + "x");
    await expect(page.locator(".cm-line").last()).toHaveText("xy");
  });
}

test("l respects counts", async ({ page }) => {
  await keys(page, "3lx");
  await expect(page.locator(".cm-line").first()).toHaveText("abcef");
});

test("l completes a pending delete operator", async ({ page }) => {
  await keys(page, "dl");
  await expect(page.locator(".cm-line").first()).toHaveText("bcdef");
});

test("l extends the Visual selection", async ({ page }) => {
  await keys(page, "vllx");
  await expect(page.locator(".cm-line").first()).toHaveText("def");
});

test("l stays on single-character and empty lines", async ({ page }) => {
  await keys(page, "j0" + "l".repeat(10));
  await expect(page.locator(".cm-fat-cursor")).toHaveText("x");
  await keys(page, "jx");
  await expect(page.locator(".cm-line")).toHaveText(["abcdef", "x", "", "xyz"]);
  await keys(page, "l".repeat(10) + "ix");
  await page.keyboard.press("Escape");
  await expect(page.locator(".cm-line")).toHaveText(["abcdef", "x", "x", "xyz"]);
});

test("yank operators accept word and paragraph text objects", async ({ page }) => {
  await keys(page, "gg0y");
  await page.waitForTimeout(300);
  await keys(page, "iw$p");
  await expect(page.locator(".cm-line").first()).toHaveText("abcdefabcdef");

  await keys(page, "gg0yipGp");
  await expect(page.locator(".cm-line")).toHaveCount(6);
});

test("system clipboard preserves yank motions and linewise paste", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate(() => localStorage.setItem("tsugite.system-clipboard", "true"));
  await page.reload();
  await expect(page.locator(".cm-editor")).toBeVisible();
  await page.locator(".cm-content").focus();
  await keys(page, "ggVGc");
  await page.keyboard.insertText("alpha beta\nsecond");
  await page.keyboard.press("Escape");

  await keys(page, "gg0y");
  await page.waitForTimeout(300);
  await keys(page, "iw");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("alpha");
  await keys(page, "$p");
  await expect(page.locator(".cm-line").first()).toHaveText("alpha betaalpha");

  await keys(page, "gg0yyjp");
  await expect(page.locator(".cm-line")).toHaveText([
    "alpha betaalpha",
    "second",
    "alpha betaalpha",
  ]);
});

test("yank operators accept b and B block aliases", async ({ page }) => {
  await keys(page, "ggVGc");
  await page.keyboard.insertText("call(one + two)\n\nconst value = {alpha + beta}");
  await page.keyboard.press("Escape");

  await keys(page, "gg0wyib$p");
  await expect(page.locator(".cm-line").first()).toHaveText("call(one + two)one + two");

  await keys(page, "G0wyiB$p");
  await expect(page.locator(".cm-line").last()).toHaveText(
    "const value = {alpha + beta}alpha + beta",
  );
});

test("vim search keeps a styled status tag on the last matched line", async ({ page }) => {
  await keys(page, "ggVGc");
  await page.keyboard.insertText("abc\nmiddle\nabc\ntail\nabc");
  await page.keyboard.press("Escape");
  await keys(page, "gg0/");
  await page.keyboard.type("abc");
  await page.keyboard.press("Enter");

  const status = page.locator("[data-vim-search-status]");
  await expect(status.locator("[data-vim-search-query]")).toHaveText("abc");
  await expect(status.locator("[data-vim-search-count]")).toHaveText("2/3");

  await keys(page, "jj");
  await expect(status.locator("[data-vim-search-count]")).toHaveText("2/3");
  await expect
    .poll(() =>
      page
        .locator(".cm-line")
        .evaluateAll((lines) =>
          lines.findIndex((line) => line.querySelector("[data-vim-search-status]")),
        ),
    )
    .toBe(2);

  await page.keyboard.press("n");
  await expect(status.locator("[data-vim-search-count]")).toHaveText("1/3");
  await page.keyboard.press("Shift+N");
  await expect(status.locator("[data-vim-search-count]")).toHaveText("3/3");
  await expect
    .poll(() =>
      page
        .locator(".cm-line")
        .evaluateAll((lines) =>
          lines.findIndex((line) => line.querySelector("[data-vim-search-status]")),
        ),
    )
    .toBe(4);
  await expect
    .poll(() =>
      status.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          backgroundColor: style.backgroundColor,
          borderRadius: style.borderRadius,
        };
      }),
    )
    .toEqual({
      backgroundColor: expect.not.stringMatching(/rgba?\(0, 0, 0(?:, 0)?\)/),
      borderRadius: expect.not.stringMatching(/^0(?:px)?$/),
    });
});

test("word search hides Vim boundaries and separates the match count", async ({ page }) => {
  await keys(page, "ggVGc");
  await page.keyboard.insertText("alpha beta\nalpha gamma");
  await page.keyboard.press("Escape");
  await keys(page, "gg0*");

  const status = page.locator("[data-vim-search-status]");
  await expect(status.locator("[data-vim-search-query]")).toHaveText("alpha");
  await expect(status.locator("[data-vim-search-count]")).toHaveText("2/2");
  await expect
    .poll(() =>
      status.locator("[data-vim-search-count]").evaluate((element) => {
        const style = getComputedStyle(element);
        const probe = document.createElement("span");
        probe.textContent = "0";
        probe.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${style.font}`;
        document.body.append(probe);
        const characterWidth = probe.getBoundingClientRect().width;
        probe.remove();
        return Number.parseFloat(style.marginLeft) / characterWidth;
      }),
    )
    .toBeCloseTo(8, 1);
});

test("visual star replaces the active search used by n and N", async ({ page }) => {
  await keys(page, "ggVGc");
  await page.keyboard.insertText("alpha item\nalpha other\na+b gap\nmiddle\na+b end");
  await page.keyboard.press("Escape");
  await keys(page, "gg0*j0vll*");
  await expect(page.locator("[data-vim-search-query]")).toHaveText("a+b");
  await expect(page.locator("[data-vim-search-count]")).toHaveText("2/2");
  await expect(page.locator("[data-vim-mode]")).toHaveAttribute("data-vim-mode", "normal");

  await page.keyboard.press("Shift+N");
  await expect(page.locator("[data-vim-search-count]")).toHaveText("1/2");
  await expect.poll(() => getActiveLineIndex(page)).toBe(2);
  await page.keyboard.press("n");
  await expect(page.locator("[data-vim-search-count]")).toHaveText("2/2");
  await expect.poll(() => getActiveLineIndex(page)).toBe(4);
});

for (const mode of ["normal", "insert"]) {
  test(`Mod-comma opens settings from Vim ${mode}`, async ({ page }) => {
    if (mode === "insert") await page.keyboard.press("i");
    await page.keyboard.press("ControlOrMeta+,");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("button", { name: "Close settings" })).toBeVisible();
    await expect(page.locator(".cm-line")).toHaveText(["abcdef", "x", "", "xyz"]);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
}
