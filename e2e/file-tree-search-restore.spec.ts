import { expect, test } from "playwright/test";

test("closing tree search cancels an earlier result-click restore", async ({
  page,
}) => {
  await page.clock.install();
  await page.addInitScript(() => localStorage.setItem("iris.language", "en"));
  await page.goto(`/room/tree-search-restore-${crypto.randomUUID()}`);
  await expect(page.locator(".cm-content")).toBeFocused();
  const toggle = page
    .getByRole("toolbar")
    .getByRole("button", { name: "Search", exact: true });
  await toggle.click();
  const search = page.getByPlaceholder("Search...");
  await search.fill("index.css");
  await expect(
    page.getByRole("treeitem", { name: "App.tsx", exact: true }),
  ).toHaveCount(0);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 60_000));
  const result = page.getByRole("treeitem", { name: "index.css", exact: true });
  // Keep both commands in one task, before the deferred restore frames.
  await result.evaluate(
    (row, toggle) => {
      const root = row.getRootNode() as ShadowRoot;
      const pointerDown = () =>
        new PointerEvent("pointerdown", {
          button: 0,
          buttons: 1,
          pointerType: "mouse",
          isPrimary: true,
          bubbles: true,
          composed: true,
        });
      row.dispatchEvent(pointerDown());
      root
        .querySelector<HTMLElement>(
          '[role="treeitem"][aria-label="index.css"]',
        )!
        .click();
      toggle!.dispatchEvent(pointerDown());
      (toggle as HTMLButtonElement).click();
    },
    await toggle.elementHandle(),
  );
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await page.clock.runFor(50);
  await page.clock.resume();
  await expect(search).toBeHidden();
});

test("Enter on the selected tree search result closes search and focuses the editor", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("iris.language", "en"));
  await page.goto(`/room/tree-search-commit-${crypto.randomUUID()}`);
  const editor = page.locator(".cm-content");
  await expect(editor).toBeFocused();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const search = page.getByPlaceholder("Search...");
  await search.fill("App.tsx");
  await search.press("Enter");
  await expect(search).toBeHidden();
  await expect(editor).toBeFocused();
  await page.keyboard.insertText("// tree-search-commit\n");
  await expect(editor).toContainText("tree-search-commit");
});
