import { expect, test } from "bun:test";
import type { FileSystemTree } from "@webcontainer/api";

import type { ProjectFile } from "@iris/shared";

import { buildFileSystemTree, selectPreviewScript } from "./webcontainer-files";

function projectFile(path: string, contents: string): ProjectFile {
  return {
    id: path,
    path,
    language: "javascript",
    kind: "file",
    text: { toString: () => contents } as ProjectFile["text"],
  };
}

test("builds a nested WebContainer file tree from project files and folders", () => {
  const tree = buildFileSystemTree(
    [
      projectFile("package.json", '{"scripts":{"dev":"vite"}}'),
      projectFile("src/main.ts", "export {}"),
    ],
    ["src", "empty"],
  );

  expect(tree).toEqual<FileSystemTree>({
    "package.json": { file: { contents: '{"scripts":{"dev":"vite"}}' } },
    src: { directory: { "main.ts": { file: { contents: "export {}" } } } },
    empty: { directory: {} },
  });
});

test("prefers the dev script and falls back to start", () => {
  expect(selectPreviewScript('{"scripts":{"start":"vite preview","dev":"vite"}}')).toEqual({
    command: "pnpm",
    args: ["run", "dev"],
    script: "dev",
  });
  expect(selectPreviewScript('{"scripts":{"start":"vite preview"}}')).toEqual({
    command: "pnpm",
    args: ["run", "start"],
    script: "start",
  });
});

test("returns stable errors for invalid package metadata or missing scripts", () => {
  expect(selectPreviewScript("not json")).toEqual({ error: "invalid-package-json" });
  expect(selectPreviewScript('{"name":"iris-room"}')).toEqual({ error: "missing-preview-script" });
});

test("rejects dot path segments while preserving dotted filenames", () => {
  expect(() => buildFileSystemTree([projectFile("src/./main.ts", "")], [])).toThrow(
    "File path must be a relative non-empty path",
  );
  expect(buildFileSystemTree([projectFile("src/version..ts", "")], [])).toEqual({
    src: { directory: { "version..ts": { file: { contents: "" } } } },
  });
});
