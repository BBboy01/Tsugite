import type { ProjectFile } from "@iris/shared";

export type WorkspaceFilePath = Pick<ProjectFile, "id" | "path">;

export type WorkspaceNavigationState = {
  openTabPaths: string[];
  selectedPath: string;
  currentFilePaths: Map<string, string>;
};

export function reconcileWorkspaceNavigation(
  files: readonly WorkspaceFilePath[],
  openTabPaths: readonly string[],
  selectedPath: string,
  previousFilePaths: ReadonlyMap<string, string>,
): WorkspaceNavigationState {
  const availablePaths = new Set(files.map((file) => file.path));
  const currentFilePaths = new Map(files.map((file) => [file.id, file.path]));
  const renamedPaths = new Map<string, string>();

  for (const [fileId, previousPath] of previousFilePaths) {
    const nextPath = currentFilePaths.get(fileId);
    if (nextPath && nextPath !== previousPath) renamedPaths.set(previousPath, nextPath);
  }

  const nextTabs = openTabPaths
    .map((path) => renamedPaths.get(path) ?? path)
    .filter((path) => availablePaths.has(path));
  const renamedSelectedPath = renamedPaths.get(selectedPath) ?? selectedPath;

  return {
    openTabPaths: nextTabs,
    selectedPath:
      !selectedPath || availablePaths.has(renamedSelectedPath)
        ? renamedSelectedPath
        : (nextTabs[0] ?? ""),
    currentFilePaths,
  };
}
