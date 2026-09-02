import { expect, test } from "bun:test";

import { closeEditorTab, getEditorTabLabels, openEditorTab } from "./editor-tabs";

test("shows bare file names when every open tab has a unique name", () => {
  expect(getEditorTabLabels(["src/main.ts", "src/notes.js", "package.json"])).toEqual([
    "main.ts",
    "notes.js",
    "package.json",
  ]);
});

test("adds only the directory levels needed to disambiguate matching file names", () => {
  expect(
    getEditorTabLabels([
      "src/index.ts",
      "packages/core/src/index.ts",
      "packages/ui/src/index.ts",
      "src/utils.ts",
    ]),
  ).toEqual(["src/index.ts", "core/src/index.ts", "ui/src/index.ts", "utils.ts"]);
});

test("opens a file once and keeps the existing tab order", () => {
  expect(openEditorTab(["src/main.ts"], "src/notes.js")).toEqual(["src/main.ts", "src/notes.js"]);
  expect(openEditorTab(["src/main.ts", "src/notes.js"], "src/main.ts")).toEqual([
    "src/main.ts",
    "src/notes.js",
  ]);
});

test("closes the active tab and selects the right neighbor first", () => {
  expect(closeEditorTab(["a.ts", "b.ts", "c.ts"], "b.ts", "b.ts")).toEqual({
    paths: ["a.ts", "c.ts"],
    nextPath: "c.ts",
  });
  expect(closeEditorTab(["a.ts", "b.ts"], "b.ts", "b.ts")).toEqual({
    paths: ["a.ts"],
    nextPath: "a.ts",
  });
});

test("closing an inactive tab keeps the active file", () => {
  expect(closeEditorTab(["a.ts", "b.ts", "c.ts"], "a.ts", "c.ts")).toEqual({
    paths: ["b.ts", "c.ts"],
    nextPath: "c.ts",
  });
});
