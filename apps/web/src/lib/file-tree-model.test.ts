import { expect, test } from "bun:test";
import { LoroDoc } from "loro-crdt";

import { createFile, listFiles } from "@iris/shared";

import { buildFileTree, flattenVisibleFileTree, folderAncestors } from "./file-tree-model";

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

test("flattens expanded folders and inserts a create row in its parent", () => {
  const doc = new LoroDoc();
  createFile(doc, "src/components/Button.tsx", "typescript");
  createFile(doc, "src/App.tsx", "typescript");
  const tree = buildFileTree(listFiles(doc), []);

  expect(
    flattenVisibleFileTree(tree, new Set(), "src").map((row) => [row.kind, row.key, row.depth]),
  ).toEqual([
    ["folder", "src", 0],
    ["create", "create:src", 1],
    ["folder", "src/components", 1],
    ["file", "src/components/Button.tsx", 2],
    ["file", "src/App.tsx", 1],
  ]);
});

test("does not flatten descendants of collapsed folders", () => {
  const doc = new LoroDoc();
  createFile(doc, "src/App.tsx", "typescript");
  const tree = buildFileTree(listFiles(doc), []);

  expect(flattenVisibleFileTree(tree, new Set(["src"])).map((row) => row.key)).toEqual(["src"]);
});

test("exposes visible tree items with their level and sibling positions", () => {
  const doc = new LoroDoc();
  createFile(doc, "src/components/Button.tsx", "typescript");
  createFile(doc, "src/App.tsx", "typescript");
  createFile(doc, "README.md", "typescript");
  const tree = buildFileTree(listFiles(doc), []);

  expect(
    flattenVisibleFileTree(tree, new Set())
      .filter((row) => row.kind !== "create")
      .map((row) => [row.key, row.depth + 1, row.positionInSet, row.setSize]),
  ).toEqual([
    ["src", 1, 1, 2],
    ["src/components", 2, 1, 2],
    ["src/components/Button.tsx", 3, 1, 1],
    ["src/App.tsx", 2, 2, 2],
    ["README.md", 1, 2, 2],
  ]);
});
