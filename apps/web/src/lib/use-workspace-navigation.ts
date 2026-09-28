import { useCallback, useEffect, useMemo, useRef } from "react";
import type { ProjectFile } from "@iris/shared";

import type { WorkspaceCommand } from "./workspace-state";
import { reconcileWorkspaceNavigation } from "./workspace-navigation";

type WorkspaceNavigationOptions = {
  files: readonly ProjectFile[];
  selectedPath: string;
  openTabPaths: readonly string[];
  dispatchWorkspace: (command: WorkspaceCommand) => void;
  requestSelectionFocus: () => void;
  beforeSelect?: () => void;
};

export function useWorkspaceNavigation({
  files,
  selectedPath,
  openTabPaths,
  dispatchWorkspace,
  requestSelectionFocus,
  beforeSelect,
}: WorkspaceNavigationOptions) {
  const previousFilePathsRef = useRef(new Map<string, string>());
  const filesByPath = useMemo(() => new Map(files.map((file) => [file.path, file])), [files]);
  const selectedFile = useMemo(() => filesByPath.get(selectedPath), [filesByPath, selectedPath]);
  const previewFile =
    selectedFile ?? files.find((file) => file.path === "src/main.tsx") ?? files[0];
  const openFiles = useMemo(
    () => openTabPaths.map((path) => filesByPath.get(path)).filter(Boolean) as ProjectFile[],
    [filesByPath, openTabPaths],
  );

  useEffect(() => {
    if (files.length === 0 && previousFilePathsRef.current.size === 0) return;
    const next = reconcileWorkspaceNavigation(
      files,
      openTabPaths,
      selectedPath,
      previousFilePathsRef.current,
    );
    previousFilePathsRef.current = next.currentFilePaths;

    const tabsChanged =
      next.openTabPaths.length !== openTabPaths.length ||
      next.openTabPaths.some((path, index) => path !== openTabPaths[index]);
    if (tabsChanged || next.selectedPath !== selectedPath) {
      dispatchWorkspace({
        type: "set-navigation",
        selectedPath: next.selectedPath,
        openTabPaths: next.openTabPaths,
      });
    }
  }, [dispatchWorkspace, files, openTabPaths, selectedPath]);

  const selectFile = useCallback(
    (path: string) => {
      beforeSelect?.();
      dispatchWorkspace({ type: "select-file", path });
      requestSelectionFocus();
    },
    [beforeSelect, dispatchWorkspace, requestSelectionFocus],
  );

  const activateFile = useCallback(
    (path: string) => {
      beforeSelect?.();
      dispatchWorkspace({ type: "activate-file", path });
      requestSelectionFocus();
    },
    [beforeSelect, dispatchWorkspace, requestSelectionFocus],
  );

  const handleCloseTab = useCallback(
    (path: string) => {
      if (path === selectedPath) beforeSelect?.();
      dispatchWorkspace({ type: "close-tab", path });
      if (path === selectedPath) requestSelectionFocus();
    },
    [beforeSelect, dispatchWorkspace, requestSelectionFocus, selectedPath],
  );

  return { openFiles, selectedFile, previewFile, selectFile, activateFile, handleCloseTab };
}
