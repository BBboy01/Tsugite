import type { FileSystemTree } from "@webcontainer/api";

import type { PackageManager, ProjectFile } from "@iris/shared";

export type PreviewScript = {
  command: PackageManager;
  args: ["run", "dev" | "start"];
  script: "dev" | "start";
};

export type PreviewScriptResult =
  | PreviewScript
  | { error: "invalid-package-json" | "missing-preview-script" };

export function buildFileSystemTree(files: ProjectFile[], folders: string[]): FileSystemTree {
  const tree: FileSystemTree = {};

  for (const folder of folders) {
    ensureDirectory(tree, normalizeRelativePath(folder));
  }

  for (const file of files) {
    const path = normalizeRelativePath(file.path);
    const segments = path.split("/");
    const fileName = segments.pop();
    if (!fileName) throw new Error("File path must include a file name");
    const parent = ensureDirectory(tree, segments.join("/"));
    const existing = parent[fileName];
    if (existing && "directory" in existing) {
      throw new Error(`File path conflicts with directory: ${path}`);
    }
    parent[fileName] = { file: { contents: file.text.toString() } };
  }

  return tree;
}

export function selectPreviewScript(
  packageJson: string,
  packageManager: PackageManager = "pnpm",
): PreviewScriptResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(packageJson);
  } catch {
    return { error: "invalid-package-json" };
  }

  if (!parsed || typeof parsed !== "object") return { error: "invalid-package-json" };
  const scripts = (parsed as { scripts?: unknown }).scripts;
  if (!scripts || typeof scripts !== "object") return { error: "missing-preview-script" };

  if (isScript(scripts, "dev")) {
    return { command: packageManager, args: ["run", "dev"], script: "dev" };
  }
  if (isScript(scripts, "start")) {
    return { command: packageManager, args: ["run", "start"], script: "start" };
  }
  return { error: "missing-preview-script" };
}

function ensureDirectory(tree: FileSystemTree, path: string): FileSystemTree {
  if (!path) return tree;
  let current = tree;
  for (const segment of path.split("/")) {
    const existing = current[segment];
    if (existing && "file" in existing) {
      throw new Error(`Directory path conflicts with file: ${path}`);
    }
    if (!existing) current[segment] = { directory: {} };
    current = (current[segment] as { directory: FileSystemTree }).directory;
  }
  return current;
}

function normalizeRelativePath(path: string): string {
  const normalized = path.trim().replace(/^\/+/, "");
  if (
    !normalized ||
    normalized.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("File path must be a relative non-empty path");
  }
  return normalized;
}

function isScript(value: object, name: string): boolean {
  const script = (value as Record<string, unknown>)[name];
  return typeof script === "string" && script.trim().length > 0;
}
