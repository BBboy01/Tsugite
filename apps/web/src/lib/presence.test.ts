import { expect, test } from "bun:test";

import { isPresenceCurrentUser, prioritizeCurrentUser } from "./presence";

test("marks a collaborator as current user by user id", () => {
  expect(isPresenceCurrentUser("user-1", "user-1")).toBe(true);
  expect(isPresenceCurrentUser("user-1", "user-2")).toBe(false);
});

test("keeps the current user first without changing the other member order", () => {
  const members = [{ userId: "user-2" }, { userId: "user-3" }, { userId: "user-1" }];

  expect(prioritizeCurrentUser(members, "user-1")).toEqual([
    { userId: "user-1" },
    { userId: "user-2" },
    { userId: "user-3" },
  ]);
  expect(members).toEqual([{ userId: "user-2" }, { userId: "user-3" }, { userId: "user-1" }]);
});
