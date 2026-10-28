import { useCallback, useEffect, useMemo } from "react";
import type { ProjectFile } from "@iris/shared";

import type { WorkspaceCommand } from "./workspace-state";
import { closeEditorTabs, type EditorTabCloseMode } from "./editor-tabs";
import { EditorTabSession } from "./editor-tab-session";

type WorkspaceNavigationOptions = {
  roomId: string;
  hasReceivedSnapshot: boolean;
  files: readonly ProjectFile[];
  selectedPath: string;
  openTabPaths: readonly string[];
  dispatchWorkspace: (command: WorkspaceCommand) => void;
  requestSelectionFocus: () => void;
  beforeSelect?: () => void;
};

export function useWorkspaceNavigation({
  roomId,
  hasReceivedSnapshot,
  files,
  selectedPath,
  openTabPaths,
  dispatchWorkspace,
  requestSelectionFocus,
  beforeSelect,
}: WorkspaceNavigationOptions) {
  const tabSession = useMemo(() => new EditorTabSession(roomId), [roomId]);
  const filesByPath = useMemo(() => new Map(files.map((file) => [file.path, file])), [files]);
  const selectedFile = useMemo(() => filesByPath.get(selectedPath), [filesByPath, selectedPath]);
  const previewFile =
    selectedFile ?? files.find((file) => file.path === "src/main.tsx") ?? files[0];
  const openFiles = useMemo(
    () => openTabPaths.map((path) => filesByPath.get(path)).filter(Boolean) as ProjectFile[],
    [filesByPath, openTabPaths],
  );

  useEffect(() => {
    const next = tabSession.synchronize({
      files,
      openTabPaths,
      selectedPath,
      hasReceivedSnapshot,
    });
    if (next) {
      dispatchWorkspace({
        type: "set-navigation",
        selectedPath: next.selectedPath,
        openTabPaths: next.openTabPaths,
      });
    }
  }, [dispatchWorkspace, files, hasReceivedSnapshot, openTabPaths, selectedPath, tabSession]);

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

  const handleCloseTabs = useCallback(
    (path: string, mode: EditorTabCloseMode) => {
      const result = closeEditorTabs([...openTabPaths], path, selectedPath, mode);
      const selectionChanged = result.nextPath !== selectedPath;
      if (selectionChanged) beforeSelect?.();
      dispatchWorkspace({ type: "close-tabs", path, mode });
      if (selectionChanged) requestSelectionFocus();
    },
    [beforeSelect, dispatchWorkspace, openTabPaths, requestSelectionFocus, selectedPath],
  );

  const handleReorderTabs = useCallback(
    (paths: string[]) => dispatchWorkspace({ type: "reorder-tabs", paths }),
    [dispatchWorkspace],
  );

  return {
    openFiles,
    selectedFile,
    previewFile,
    selectFile,
    activateFile,
    handleCloseTab,
    handleCloseTabs,
    handleReorderTabs,
  };
}
