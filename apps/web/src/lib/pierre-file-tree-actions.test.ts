import { expect, test } from "bun:test";
import type { ProjectFile } from "@iris/shared";
import { LoroText } from "loro-crdt";
import {
  canMovePierrePaths,
  createPierreDraft,
  getPierreCreationDirectory,
  getPierreExpandedPaths,
  getPierreTarget,
  resolvePierreDraftEdit,
} from "./pierre-file-tree-actions";

test("moves reject package manifests, the source itself and its descendants", () => {
  expect(canMovePierrePaths(["package.json"], "src/")).toBe(false);
  expect(canMovePierrePaths(["src/"], "src/")).toBe(false);
  expect(canMovePierrePaths(["src/"], "src/nested/")).toBe(false);
  expect(canMovePierrePaths(["src/index.css", "src/App.tsx"], "lib/")).toBe(
    true,
  );
  expect(canMovePierrePaths(["src/index.css"], undefined)).toBe(true);
  expect(canMovePierrePaths(["src/index.css"], null)).toBe(true);
});

test("targets resolve folders and live files without retaining removed files", () => {
  const file: ProjectFile = {
    id: "file-1",
    path: "src/index.css",
    language: "typescript",
    kind: "file",
    text: new LoroText(),
  };
  expect(getPierreTarget("src/", [file])).toEqual({
    type: "folder",
    path: "src",
  });
  expect(getPierreTarget("src/index.css", [file])).toEqual({
    type: "file",
    file,
  });
  expect(getPierreTarget("removed.ts", [file])).toBeNull();
});

test("creation from files uses their parent while directories keep their own path", () => {
  expect(getPierreCreationDirectory(null)).toBe("");
  expect(
    getPierreCreationDirectory({ path: "src/nested/", kind: "directory" }),
  ).toBe("src/nested");
  expect(
    getPierreCreationDirectory({ path: "src/main.ts", kind: "file" }),
  ).toBe("src");
});

test("draft names avoid files, inferred directories and model-only pending items", () => {
  expect(
    createPierreDraft(
      "new-file",
      "src",
      ["src/untitled", "src/untitled 2/nested.ts"],
      (path) => path === "src/untitled 3",
    ),
  ).toEqual({
    path: "src/untitled 4",
    kind: "file",
    defaultName: "untitled 4",
  });
  expect(createPierreDraft("new-folder", "", ["new-folder/"])).toEqual({
    path: "new-folder 2/",
    kind: "folder",
    defaultName: "new-folder 2",
  });
});

test("draft commits normalize folder keys and keep nested names under their parent", () => {
  const drafts = new Map([
    ["src/new-folder/", { kind: "folder" as const, defaultName: "new-folder" }],
  ]);
  expect(
    resolvePierreDraftEdit(drafts, "src/new-folder", " /nested/child/ "),
  ).toEqual({
    draftKey: "src/new-folder/",
    kind: "folder",
    destinationPath: "src/nested/child",
  });
  expect(
    resolvePierreDraftEdit(drafts, "src/new-folder/", "src/child"),
  ).toEqual({
    draftKey: "src/new-folder/",
    kind: "folder",
    destinationPath: "src/child",
  });
});

test("blank draft values commit the unique default but missing drafts do nothing", () => {
  const drafts = new Map([
    ["src/untitled 2", { kind: "file" as const, defaultName: "untitled 2" }],
  ]);
  expect(resolvePierreDraftEdit(drafts, "src/untitled 2", "  ")).toEqual({
    draftKey: "src/untitled 2",
    kind: "file",
    destinationPath: "src/untitled 2",
  });
  expect(resolvePierreDraftEdit(drafts, "src/missing", "name.ts")).toBeNull();
});

test("tree resets keep surviving expansion and expand new folders only", () => {
  expect(
    getPierreExpandedPaths(
      ["src/", "closed/", "deleted/", "src/main.ts"],
      ["src/", "closed/", "new/", "src/main.ts"],
      (path) => path === "src/" || path === "deleted/",
    ),
  ).toEqual(["src/", "new/"]);
});
