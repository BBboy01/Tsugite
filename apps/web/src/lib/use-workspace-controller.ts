import { useCallback, useEffect, useMemo, useRef } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { setSharedSetting, type ProjectSettings } from "@iris/shared";
import { WORKSPACE_CHANGE_ORIGIN } from "./editor-undo";
import { useRoomSession } from "./use-room-session";
import { createWorkspaceFileActions } from "./workspace-file-actions";
import type { MobileWorkspacePanel } from "./workspace-layout-model";
import {
  followingUserIdAtom,
  mobilePanelAtom,
  openTabPathsAtom,
  previewConsoleOpenAtom,
  selectedPathAtom,
  workspaceCommandAtom,
} from "./workspace-atoms";
import { useEditorFocus } from "./use-editor-focus";
import { useWorkspaceNavigation } from "./use-workspace-navigation";
import { useWorkspaceFollow } from "./use-workspace-follow";
import { useWorkspacePreferences } from "./workspace-preferences";
import { useWorkspaceShortcuts } from "./use-workspace-shortcuts";

export function useWorkspaceController(roomId: string) {
  const {
    client,
    files,
    folders,
    settings,
    status,
    members,
    hasPendingChanges,
    hasReceivedSnapshot,
  } = useRoomSession(roomId);
  const dispatchWorkspace = useSetAtom(workspaceCommandAtom);
  const selectedPath = useAtomValue(selectedPathAtom);
  const openTabPaths = useAtomValue(openTabPathsAtom);
  const followingUserId = useAtomValue(followingUserIdAtom);
  const mobilePanel = useAtomValue(mobilePanelAtom);
  const previewConsoleOpen = useAtomValue(previewConsoleOpenAtom);
  const { vimMode, keymap, updateVimMode, updateKeymap, updateLanguage } =
    useWorkspacePreferences();
  const updateNavigation = useCallback(
    (nextSelectedPath: string, nextOpenTabPaths: string[]) =>
      dispatchWorkspace({
        type: "set-navigation",
        selectedPath: nextSelectedPath,
        openTabPaths: nextOpenTabPaths,
      }),
    [dispatchWorkspace],
  );
  const setFollowingUserId = useCallback(
    (userId: string | null) => dispatchWorkspace({ type: "set-following", userId }),
    [],
  );
  const setMobilePanel = useCallback(
    (panel: MobileWorkspacePanel | null) =>
      dispatchWorkspace({ type: "set-mobile-panel-value", panel }),
    [],
  );
  const setFileSearchOpen = useCallback(
    (open: boolean) => dispatchWorkspace({ type: "set-file-search-open", open }),
    [],
  );
  const setCommandPaletteOpen = useCallback(
    (open: boolean) => dispatchWorkspace({ type: "set-command-palette-open", open }),
    [],
  );
  const togglePreviewConsole = useCallback(
    () => dispatchWorkspace({ type: "toggle-preview-console" }),
    [],
  );
  const setPreviewConsoleOpen = useCallback(
    (open: boolean) => dispatchWorkspace({ type: "set-preview-console-open", open }),
    [],
  );
  const setSettingsOpen = useCallback(
    (open: boolean) => dispatchWorkspace({ type: "set-settings-open", open }),
    [],
  );
  const presenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearPresenceTimer = useCallback(() => {
    if (presenceTimer.current) clearTimeout(presenceTimer.current);
    presenceTimer.current = null;
  }, []);
  const {
    editorFocusRef,
    focusEditorWhenReadyRef,
    focusInitialEditorRef,
    requestSelectionFocus,
    handleEditorFocusReady,
  } = useEditorFocus();

  useEffect(() => {
    clearPresenceTimer();
    client.sendPresence(selectedPath);
    return () => {
      clearPresenceTimer();
    };
  }, [clearPresenceTimer, client, selectedPath]);

  const { openFiles, selectedFile, previewFile, selectFile, activateFile, handleCloseTab } =
    useWorkspaceNavigation({
      files,
      selectedPath,
      openTabPaths,
      dispatchWorkspace,
      requestSelectionFocus,
      beforeSelect: clearPresenceTimer,
    });

  const { followedSelection, handleFollowMember } = useWorkspaceFollow({
    currentUserId: client.identity.userId,
    members,
    followingUserId,
    selectedPath,
    setFollowingUserId,
    selectFile,
  });

  const updateSharedSetting = useCallback(
    <K extends keyof ProjectSettings>(key: K, value: ProjectSettings[K]) => {
      setFollowingUserId(null);
      setSharedSetting(client.doc, key, value);
      client.doc.commit({ origin: WORKSPACE_CHANGE_ORIGIN });
    },
    [client, setFollowingUserId],
  );

  useWorkspaceShortcuts({
    keymap,
    setSettingsOpen,
    setCommandPaletteOpen,
    setFileSearchOpen,
    togglePreviewConsole,
  });

  const stopFollowing = useCallback(() => setFollowingUserId(null), [setFollowingUserId]);
  const { handleAddFile, handleAddFolder, handleRename, handleCopy, handleDelete } = useMemo(
    () =>
      createWorkspaceFileActions({
        doc: client.doc,
        selectedPath,
        openTabPaths,
        setNavigation: updateNavigation,
        activateFile,
        stopFollowing,
      }),
    [activateFile, client.doc, openTabPaths, selectedPath, updateNavigation, stopFollowing],
  );

  const handleCursorChange = useCallback(
    (cursor: { anchor: number; head: number }) => {
      setFollowingUserId(null);
      clearPresenceTimer();
      presenceTimer.current = setTimeout(() => client.sendPresence(selectedPath, cursor), 120);
    },
    [clearPresenceTimer, client, selectedPath, setFollowingUserId],
  );

  const handleDisplayNameChange = useCallback(
    (displayName: string): boolean => {
      setFollowingUserId(null);
      return client.updateDisplayName(displayName);
    },
    [client, setFollowingUserId],
  );
  const handleColorChange = useCallback(
    (color: string): boolean => {
      setFollowingUserId(null);
      return client.updateColor(color);
    },
    [client, setFollowingUserId],
  );
  const toggleMobilePanel = useCallback(
    (panel: MobileWorkspacePanel) => {
      dispatchWorkspace({ type: "set-mobile-panel", panel });
    },
    [dispatchWorkspace],
  );

  return {
    client,
    settings,
    files,
    folders,
    status,
    members,
    hasPendingChanges,
    hasReceivedSnapshot,
    selectedPath,
    openFiles,
    selectedFile,
    previewFile,
    followingUserId,
    followedSelection,
    mobilePanel,
    previewConsoleOpen,
    vimMode,
    keymap,
    editorFocusRef,
    focusEditorWhenReadyRef,
    focusInitialEditorRef,
    setCommandPaletteOpen,
    setFileSearchOpen,
    setMobilePanel,
    togglePreviewConsole,
    setPreviewConsoleOpen,
    setSettingsOpen,
    setFollowingUserId,
    handleFollowMember,
    toggleMobilePanel,
    updateSharedSetting,
    updateVimMode,
    updateLanguage,
    updateKeymap,
    activateFile,
    handleAddFile,
    handleAddFolder,
    handleRename,
    handleCopy,
    handleDelete,
    handleDisplayNameChange,
    handleColorChange,
    handleCloseTab,
    handleCursorChange,
    handleEditorFocusReady,
  };
}
