import { expect, test } from "bun:test";
import { LoroDoc } from "loro-crdt";

import { createFile, listFiles } from "@iris/shared";

import { buildFileTree, folderAncestors } from "./file-tree-model";

test("builds nested folders and keeps files under their parent", () => {
  const doc = new LoroDoc();
  createFile(doc, "src/components/Button.tsx", "typescript");
  createFile(doc, "README.md", "typescript");
  const tree = buildFileTree(listFiles(doc), ["src", "src/components"]);
  expect(tree.map((node) => (node.kind === "folder" ? node.path : node.file.path))).toEqual([
    "src",
    "README.md",
  ]);

  const src = tree[0];
  if (src.kind !== "folder") throw new Error("Expected src folder");
  expect(src.children.map((node) => (node.kind === "folder" ? node.path : node.file.path))).toEqual(
    ["src/components"],
  );
  const components = src.children[0];
  if (components.kind !== "folder") throw new Error("Expected components folder");
  expect(
    components.children.map((node) => (node.kind === "folder" ? node.path : node.file.path)),
  ).toEqual(["src/components/Button.tsx"]);
});

test("returns folder ancestors for selected files", () => {
  expect(folderAncestors("src/components/Button.tsx")).toEqual(["src", "src/components"]);
  expect(folderAncestors("README.md")).toEqual([]);
});
