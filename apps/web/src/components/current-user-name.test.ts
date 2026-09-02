import { expect, test } from "bun:test";

import { getDisplayNameCommitValue } from "./current-user-name";

test("normalizes a changed display name before committing", () => {
  expect(getDisplayNameCommitValue("  Maya  ", "Guest 1234")).toBe("Maya");
});

test("rejects empty, unchanged, and overlong display names", () => {
  expect(getDisplayNameCommitValue("   ", "Maya")).toBeUndefined();
  expect(getDisplayNameCommitValue("Maya", "Maya")).toBeUndefined();
  expect(getDisplayNameCommitValue("a".repeat(33), "Maya")).toBeUndefined();
});
