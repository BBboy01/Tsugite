import { expect, test } from "bun:test";

import {
  getInlineEditDefaultValue,
  getInlineEditDirectory,
  resolveInlineEdit,
} from "./file-tree-edit-model";

test("creates an empty inline value with the current directory defaults", () => {
  expect(getInlineEditDefaultValue("create-file", { type: "folder", path: "src" }, 4)).toBe(
    "new-5.ts",
  );
  expect(getInlineEditDefaultValue("create-folder", null, 4)).toBe("new-folder");
  expect(getInlineEditDirectory({ type: "file", path: "src/App.tsx" })).toBe("src");
});

test("an empty create value cancels without producing a path", () => {
  expect(resolveInlineEdit("create-file", "src", "   ")).toEqual({ status: "cancel" });
  expect(resolveInlineEdit("create-folder", "", "")).toEqual({ status: "cancel" });
});

test("an empty rename value remains invalid while a basename resolves in place", () => {
  expect(resolveInlineEdit("rename-file", "src", "   ")).toEqual({ status: "invalid" });
  expect(resolveInlineEdit("rename-file", "src", "main.tsx")).toEqual({
    status: "submit",
    path: "src/main.tsx",
  });
  expect(resolveInlineEdit("rename-folder", "", "packages")).toEqual({
    status: "submit",
    path: "packages",
  });
});

test("renames a nested folder beside its current siblings", () => {
  expect(getInlineEditDirectory({ type: "folder", path: "src/components" }, "rename-folder")).toBe(
    "src",
  );
});

test("a basename matching its parent remains a child path", () => {
  for (const mode of ["rename-file", "rename-folder", "create-file", "create-folder"] as const) {
    expect(resolveInlineEdit(mode, "src", "src")).toEqual({
      status: "submit",
      path: "src/src",
    });
  }
  expect(resolveInlineEdit("rename-file", "src", "src/App.tsx")).toEqual({
    status: "submit",
    path: "src/App.tsx",
  });
});
