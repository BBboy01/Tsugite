import type { ProjectFile } from "@iris/shared";
import type { FileTreeTarget } from "./file-tree-model";

export type PierreDraft = { kind: "file" | "folder"; defaultName: string };

export function canMovePierrePaths(
  paths: readonly string[],
  directory: string | null | undefined,
) {
  const destination = directory?.replace(/\/$/, "") ?? "";
  return paths.every((path) => {
    const source = path.replace(/\/$/, "");
    return (
      source !== "package.json" &&
      source !== destination &&
      !destination.startsWith(`${source}/`)
    );
  });
}

export function getPierreTarget(
  path: string,
  files: readonly ProjectFile[],
  isFolder = path.endsWith("/"),
): FileTreeTarget {
  const source = path.replace(/\/$/, "");
  if (isFolder) return { type: "folder", path: source };
  const file = files.find((candidate) => candidate.path === source);
  return file ? { type: "file", file } : null;
}

export function getPierreCreationDirectory(
  item: { path: string; kind: string } | null,
) {
  if (!item) return "";
  const path = item.path.replace(/\/$/, "");
  return item.kind === "directory"
    ? path
    : path.split("/").slice(0, -1).join("/");
}

export function createPierreDraft(
  action: "new-file" | "new-folder",
  parent: string,
  paths: readonly string[],
  hasPath: (path: string) => boolean = () => false,
): PierreDraft & { path: string } {
  const prefix = parent ? `${parent}/` : "";
  const kind = action === "new-file" ? "file" : "folder";
  const stem = kind === "file" ? "untitled" : "new-folder";
  const taken = new Set(
    paths
      .filter((path) => path.startsWith(prefix))
      .map(
        (path) => path.slice(prefix.length).replace(/\/$/, "").split("/")[0],
      ),
  );
  for (let suffix = 1; ; suffix += 1) {
    const defaultName = suffix === 1 ? stem : `${stem} ${suffix}`;
    const path = `${prefix}${defaultName}${kind === "folder" ? "/" : ""}`;
    if (!taken.has(defaultName) && !hasPath(path))
      return { path, kind, defaultName };
  }
}

export function resolvePierreDraftEdit(
  drafts: ReadonlyMap<string, PierreDraft>,
  sourcePath: string,
  inputValue: string | null,
) {
  const source = sourcePath.replace(/\/$/, "");
  const draftKey = drafts.has(sourcePath)
    ? sourcePath
    : drafts.has(source)
      ? source
      : `${source}/`;
  const draft = drafts.get(draftKey);
  if (!draft) return null;
  const parent = source.split("/").slice(0, -1).join("/");
  const value = (inputValue?.trim() || draft.defaultName).replace(
    /^\/+|\/+$/g,
    "",
  );
  if (!value) return null;
  const destinationPath =
    parent && !value.startsWith(`${parent}/`) ? `${parent}/${value}` : value;
  return { draftKey, kind: draft.kind, destinationPath };
}

export function getPierreExpandedPaths(
  currentPaths: readonly string[],
  nextPaths: readonly string[],
  isExpanded: (path: string) => boolean,
) {
  const expanded = currentPaths.filter(
    (path) => path.endsWith("/") && isExpanded(path),
  );
  const newDirectories = nextPaths.filter(
    (path) => path.endsWith("/") && !currentPaths.includes(path),
  );
  return [
    ...expanded.filter((path) => nextPaths.includes(path)),
    ...newDirectories,
  ];
}
