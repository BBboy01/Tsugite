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

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("iris.language", "en"));
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

test("navigates open tabs with arrows, Home and End while keeping the focused tab visible", async ({
  page,
}) => {
  for (const name of ["index.html", "package.json", "main.tsx", "index.css", "tsconfig.json"]) {
    await page.getByRole("button", { name, exact: true }).click();
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
    await page.getByRole("button", { name, exact: true }).click();
  }
  await page.getByRole("button", { name: "App.tsx", exact: true }).click();
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
