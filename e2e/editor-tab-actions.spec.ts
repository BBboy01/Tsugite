import { expect, test, type Page } from "playwright/test";

const tabPaths = (page: Page) => page.getByRole("tablist", { name: "Open files" }).getByRole("tab");
const tabLabels = (page: Page) =>
  page.getByRole("tablist", { name: "Open files" }).locator('[role="tab"] span.truncate');
const tab = (page: Page, label: string) =>
  page.getByRole("tablist", { name: "Open files" }).getByRole("tab").filter({ hasText: label });

async function openTabs(page: Page) {
  await expect(page.locator(".cm-content")).toBeVisible();
  await page.getByRole("treeitem", { name: "index.html", exact: true }).click();
  await page.getByRole("treeitem", { name: "main.tsx", exact: true }).click();
}

async function dragTab(page: Page, from: string, to: string) {
  const source = await tab(page, from).boundingBox();
  const target = await tab(page, to).boundingBox();
  if (!source || !target) throw new Error("Tab is outside the viewport");
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, {
    steps: 20,
  });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("iris.language", "en"));
});

test("tab menu targets the clicked tab and persists closing all tabs", async ({ page }) => {
  const room = `/room/tab-menu-${crypto.randomUUID()}`;
  await page.goto(room);
  await openTabs(page);
  const target = tab(page, "index.html");
  await target.click({ button: "right" });
  await expect(page.getByRole("region", { name: "Editing src/main.tsx" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Close tabs to the right", exact: true }).click();
  await expect(tabLabels(page)).toHaveText(["App.tsx", "index.html"]);
  await expect(target).toHaveAttribute("aria-selected", "true");

  await target.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Close other tabs", exact: true }).click();
  await expect(tabLabels(page)).toHaveText(["index.html"]);
  await target.click({ button: "right" });
  await expect(
    page.getByRole("menuitem", { name: "Close other tabs", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("menuitem", { name: "Close tabs to the right", exact: true }),
  ).toBeDisabled();
  await page.getByRole("menuitem", { name: "Close all tabs", exact: true }).click();
  await expect(page.getByText("No open files", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("No open files", { exact: true })).toBeVisible();
  await expect(tabPaths(page)).toHaveCount(0);
});

test("dragging preserves activation and restores each room's own order", async ({ page }) => {
  const room = `/room/tab-order-${crypto.randomUUID()}`;
  await page.goto(room);
  await openTabs(page);
  await dragTab(page, "App.tsx", "main.tsx");
  await expect(tabLabels(page)).toHaveText(["index.html", "main.tsx", "App.tsx"]);
  await expect(tab(page, "main.tsx")).toHaveAttribute("aria-selected", "true");
  await page.reload();
  await expect(tabLabels(page)).toHaveText(["index.html", "main.tsx", "App.tsx"]);
  await expect(tab(page, "main.tsx")).toHaveAttribute("aria-selected", "true");
  await page.goto(`/room/tab-other-room-${crypto.randomUUID()}`);
  await expect(tabLabels(page)).toHaveText(["App.tsx"]);
  await page.goto(room);
  await expect(tabLabels(page)).toHaveText(["index.html", "main.tsx", "App.tsx"]);
});

test("restoring filters remotely deleted files and falls back to the first surviving tab", async ({
  page,
  browser,
}) => {
  const room = `/room/tab-remote-delete-${crypto.randomUUID()}`;
  await page.goto(room);
  await openTabs(page);
  await page.goto("about:blank");
  const collaborator = await browser.newPage();
  try {
    await collaborator.addInitScript(() => localStorage.setItem("iris.language", "en"));
    await collaborator.goto(room);
    await expect(collaborator.locator(".cm-content")).toBeVisible();
    for (const name of ["main.tsx", "App.tsx", "index.html"]) {
      await collaborator.getByRole("treeitem", { name, exact: true }).click({ button: "right" });
      await collaborator.getByRole("menuitem", { name: "Delete", exact: true }).click();
      await collaborator
        .getByRole("alertdialog")
        .getByRole("button", { name: "Delete", exact: true })
        .click();
      await expect(collaborator.getByRole("treeitem", { name, exact: true })).toHaveCount(0);
      await page.goto(room);
      if (name === "main.tsx") {
        await expect(tabLabels(page)).toHaveText(["App.tsx", "index.html"]);
        await expect(tab(page, "App.tsx")).toHaveAttribute("aria-selected", "true");
      } else if (name === "App.tsx") {
        await expect(tabLabels(page)).toHaveText(["index.html"]);
        await expect(tab(page, "index.html")).toHaveAttribute("aria-selected", "true");
      } else {
        await expect(page.getByText("No open files", { exact: true })).toBeVisible();
      }
      await page.goto("about:blank");
    }
  } finally {
    await collaborator.close();
  }
});
