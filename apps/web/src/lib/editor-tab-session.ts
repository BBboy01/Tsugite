import { reconcileWorkspaceNavigation, type WorkspaceFilePath } from "./workspace-navigation";

type TabSessionStorage = Pick<Storage, "getItem" | "setItem">;
type TabNavigation = { openTabPaths: string[]; selectedPath: string };
type TabSessionInput = {
  files: readonly WorkspaceFilePath[];
  openTabPaths: readonly string[];
  selectedPath: string;
  hasReceivedSnapshot: boolean;
};

type StoredTabSession = { fileIds: string[]; activeFileId: string | null };

function getTabSessionStorage(): TabSessionStorage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function readNavigation(
  storage: TabSessionStorage | undefined,
  key: string,
  files: readonly WorkspaceFilePath[],
): TabNavigation | null {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return null;
    const saved: Partial<StoredTabSession> | null = JSON.parse(raw);
    if (
      !saved ||
      !Array.isArray(saved.fileIds) ||
      !saved.fileIds.every((id) => typeof id === "string") ||
      (saved.activeFileId !== null && typeof saved.activeFileId !== "string")
    ) {
      return null;
    }
    const pathsById = new Map(files.map((file) => [file.id, file.path]));
    const openTabPaths = [...new Set(saved.fileIds)]
      .map((id) => pathsById.get(id))
      .filter((path): path is string => path !== undefined);
    const activePath = saved.activeFileId === null ? "" : pathsById.get(saved.activeFileId);
    return {
      openTabPaths,
      selectedPath:
        saved.activeFileId === null
          ? ""
          : activePath && openTabPaths.includes(activePath)
            ? activePath
            : (openTabPaths[0] ?? ""),
    };
  } catch {
    return null;
  }
}

export class EditorTabSession {
  private restored = false;
  private pendingNavigation: TabNavigation | null = null;
  private previousFilePaths = new Map<string, string>();
  private readonly key: string;

  constructor(
    roomId: string,
    private readonly storage: TabSessionStorage | undefined = getTabSessionStorage(),
  ) {
    this.key = `iris.editor-tabs.v1.${roomId}`;
  }

  synchronize(input: TabSessionInput): TabNavigation | null {
    if (!input.hasReceivedSnapshot) return null;
    const restoredNavigation = this.restored
      ? null
      : readNavigation(this.storage, this.key, input.files);
    const source = this.pendingNavigation ?? restoredNavigation ?? input;
    const next = reconcileWorkspaceNavigation(
      input.files,
      source.openTabPaths,
      source.selectedPath,
      this.previousFilePaths,
    );
    this.restored = true;
    this.previousFilePaths = next.currentFilePaths;
    const navigation = { openTabPaths: next.openTabPaths, selectedPath: next.selectedPath };
    if (
      navigation.selectedPath !== input.selectedPath ||
      navigation.openTabPaths.length !== input.openTabPaths.length ||
      navigation.openTabPaths.some((path, index) => path !== input.openTabPaths[index])
    ) {
      // Keep the restored target until its update is rendered, including repeated effects.
      this.pendingNavigation = navigation;
      return navigation;
    }
    this.pendingNavigation = null;
    const idsByPath = new Map(input.files.map((file) => [file.path, file.id]));
    const saved: StoredTabSession = {
      fileIds: navigation.openTabPaths.map((path) => idsByPath.get(path)!),
      activeFileId: navigation.openTabPaths.includes(navigation.selectedPath)
        ? (idsByPath.get(navigation.selectedPath) ?? null)
        : null,
    };
    try {
      this.storage?.setItem(this.key, JSON.stringify(saved));
    } catch {
      // Navigation stays usable when browser storage is unavailable or full.
    }
    return null;
  }
}
