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

const BROKEN_ROLLDOWN_VERSION = "1.2.9";
const WEBCONTAINER_ROLLDOWN_VERSION = "1.2.8";

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

export function buildPreviewFileSystemTree(
  files: ProjectFile[],
  folders: string[],
  packageManager: PackageManager,
): FileSystemTree {
  const tree = buildFileSystemTree(files, folders);
  const packageFile = files.find((file) => file.path === "package.json");
  if (!packageFile) return tree;

  const packageJson = parsePackageJson(packageFile.text.toString());
  if (!packageJson || !usesVite(packageJson) || managesRolldown(packageJson)) return tree;

  if (packageManager === "pnpm") {
    if (files.some((file) => file.path === "pnpm-workspace.yaml")) return tree;
    const pnpm = packageJson.pnpm;
    if (pnpm !== undefined && !isRecord(pnpm)) return tree;
    const overrides = pnpm?.overrides;
    if (overrides !== undefined && !isRecord(overrides)) return tree;
    if (isRecord(overrides) && hasRolldownOverride(overrides)) return tree;

    const selector = `rolldown@${BROKEN_ROLLDOWN_VERSION}`;

    tree["package.json"] = packageJsonFile({
      ...packageJson,
      pnpm: {
        ...pnpm,
        overrides: { ...overrides, [selector]: WEBCONTAINER_ROLLDOWN_VERSION },
      },
    });
    tree["pnpm-workspace.yaml"] = {
      file: {
        contents: `packages:\n  - .\noverrides:\n  ${selector}: ${WEBCONTAINER_ROLLDOWN_VERSION}\n`,
      },
    };
    return tree;
  }

  const field = packageManager === "npm" ? "overrides" : "resolutions";
  const selector = packageManager === "npm" ? `rolldown@${BROKEN_ROLLDOWN_VERSION}` : "rolldown";
  const current = packageJson[field];
  if (current !== undefined && !isRecord(current)) return tree;
  if (isRecord(current) && hasRolldownOverride(current)) return tree;

  tree["package.json"] = packageJsonFile({
    ...packageJson,
    [field]: { ...current, [selector]: WEBCONTAINER_ROLLDOWN_VERSION },
  });
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

function parsePackageJson(source: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(source);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function packageJsonFile(packageJson: Record<string, unknown>): FileSystemTree[string] {
  return { file: { contents: `${JSON.stringify(packageJson, null, 2)}\n` } };
}

function usesVite(packageJson: Record<string, unknown>): boolean {
  return (
    hasDependency(packageJson.dependencies, "vite") ||
    hasDependency(packageJson.devDependencies, "vite")
  );
}

function managesRolldown(packageJson: Record<string, unknown>): boolean {
  return [
    packageJson.dependencies,
    packageJson.devDependencies,
    packageJson.optionalDependencies,
    packageJson.peerDependencies,
  ].some((dependencies) => hasDependency(dependencies, "rolldown"));
}

function hasDependency(value: unknown, name: string): boolean {
  return isRecord(value) && typeof value[name] === "string";
}

function hasRolldownOverride(overrides: Record<string, unknown>): boolean {
  return Object.keys(overrides).some(
    (selector) => selector === "rolldown" || selector.startsWith("rolldown@"),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
