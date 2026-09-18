import { expect, test } from "bun:test";
import type { FileSystemTree } from "@webcontainer/api";

import type { ProjectFile } from "@iris/shared";

import {
  buildFileSystemTree,
  buildPreviewFileSystemTree,
  selectPreviewScript,
} from "./webcontainer-files";

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

test("pins the WebContainer-compatible Rolldown release for pnpm Vite projects", () => {
  const packageJson = JSON.stringify({
    scripts: { dev: "vite" },
    devDependencies: { vite: "latest" },
  });
  const packageFile = projectFile("package.json", packageJson);

  const tree = buildPreviewFileSystemTree([packageFile], [], "pnpm");

  expect(
    JSON.parse((tree["package.json"] as { file: { contents: string } }).file.contents),
  ).toEqual({
    scripts: { dev: "vite" },
    devDependencies: { vite: "latest" },
    pnpm: { overrides: { "rolldown@1.2.9": "1.2.8" } },
  });
  expect(tree["pnpm-workspace.yaml"]).toEqual({
    file: { contents: "packages:\n  - .\noverrides:\n  rolldown@1.2.9: 1.2.8\n" },
  });
  expect(packageFile.text.toString()).toBe(packageJson);
});

test("keeps compatibility metadata inside the runtime file tree", () => {
  const packageJson = JSON.stringify({
    scripts: { dev: "vite" },
    devDependencies: { vite: "latest" },
  });
  const packageFile = projectFile("package.json", packageJson);

  const npmTree = buildPreviewFileSystemTree([packageFile], [], "npm");
  const yarnTree = buildPreviewFileSystemTree([packageFile], [], "yarn");

  expect(
    JSON.parse((npmTree["package.json"] as { file: { contents: string } }).file.contents),
  ).toMatchObject({ overrides: { "rolldown@1.2.9": "1.2.8" } });
  expect(
    JSON.parse((yarnTree["package.json"] as { file: { contents: string } }).file.contents),
  ).toMatchObject({ resolutions: { rolldown: "1.2.8" } });
  expect(packageFile.text.toString()).toBe(packageJson);
});

test("does not override dependency resolution for non-Vite or user-managed Rolldown projects", () => {
  const plainPackageJson = JSON.stringify({ scripts: { dev: "astro dev" } });
  const managedPackageJson = JSON.stringify({
    scripts: { dev: "vite" },
    devDependencies: { vite: "latest", rolldown: "1.2.9" },
  });
  const vitePackageJson = JSON.stringify({
    scripts: { dev: "vite" },
    devDependencies: { vite: "latest" },
  });
  const workspace = projectFile("pnpm-workspace.yaml", "packages:\n  - .\n");

  expect(
    buildPreviewFileSystemTree([projectFile("package.json", plainPackageJson)], [], "pnpm"),
  ).toEqual({ "package.json": { file: { contents: plainPackageJson } } });
  expect(
    buildPreviewFileSystemTree([projectFile("package.json", managedPackageJson)], [], "npm"),
  ).toEqual({ "package.json": { file: { contents: managedPackageJson } } });
  expect(
    buildPreviewFileSystemTree(
      [projectFile("package.json", vitePackageJson), workspace],
      [],
      "pnpm",
    ),
  ).toEqual({
    "package.json": { file: { contents: vitePackageJson } },
    "pnpm-workspace.yaml": { file: { contents: workspace.text.toString() } },
  });
});
