import { expect, test } from "bun:test";

import { getDialogDirectory } from "./file-tree";

test("uses the project root when the context menu has no target", () => {
  expect(getDialogDirectory(null)).toBe("");
});

test("uses the selected folder as the create directory", () => {
  expect(getDialogDirectory({ type: "folder", path: "src" })).toBe("src");
});
