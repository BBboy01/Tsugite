import { expect, test } from "playwright/test";

test("follows the leader's replacement tab and empty selection after closing tabs", async ({
  browser,
}) => {
  const leaderContext = await browser.newContext();
  const followerContext = await browser.newContext();
  try {
    for (const [context, userId] of [
      [leaderContext, "leader"],
      [followerContext, "follower"],
    ] as const) {
      await context.addInitScript((id) => {
        localStorage.setItem("iris.language", "en");
        localStorage.setItem(
          "iris.identity.v1",
          JSON.stringify({ userId: id, displayName: id, color: "#7389b7" }),
        );
      }, userId);
    }
    const leader = await leaderContext.newPage();
    const follower = await followerContext.newPage();
    const room = `/room/e2e-follow-close-${crypto.randomUUID()}`;
    await leader.goto(room);
    await follower.goto(room);
    await expect(leader.locator(".cm-content")).toBeVisible();
    await expect(follower.locator(".cm-content")).toBeVisible();
    await leader.getByRole("button", { name: "index.html", exact: true }).click();
    await leader.getByRole("button", { name: "main.tsx", exact: true }).click();
    await leader.locator(".cm-content").press("ArrowDown");
    await follower.getByRole("button", { name: "2 online", exact: true }).click();
    await follower.getByRole("button", { name: "leader", exact: true }).click();
    await expect(follower.getByRole("region", { name: "Editing src/main.tsx" })).toBeVisible();

    await leader.getByRole("button", { name: "Close index.html", exact: true }).click();
    await expect(follower.getByRole("region", { name: "Editing src/main.tsx" })).toBeVisible();
    await leader.getByRole("button", { name: "Close src/main.tsx", exact: true }).click();
    await expect(leader.getByRole("region", { name: "Editing src/App.tsx" })).toBeVisible();
    await expect(follower.getByRole("region", { name: "Editing src/App.tsx" })).toBeVisible();
    await expect(follower.locator("[data-editor-following='true']")).toBeVisible();

    await leader.getByRole("button", { name: "Close src/App.tsx", exact: true }).click();
    await expect(leader.getByText("No open files", { exact: true })).toBeVisible();
    await expect(follower.getByText("No open files", { exact: true })).toBeVisible();
    await leader.getByRole("button", { name: "main.tsx", exact: true }).click();
    await expect(follower.getByRole("region", { name: "Editing src/main.tsx" })).toBeVisible();
    await expect(follower.locator("[data-editor-following='true']")).toBeVisible();
  } finally {
    await leaderContext.close();
    await followerContext.close();
  }
});
