import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { setSharedSetting, type ProjectFile, type ProjectSettings } from "@iris/shared";
import type { LanguageCode } from "./i18n";
import { matchesKeyBinding, readKeymap, writeKeymap, type KeyBinding } from "./keymap";
import { closeEditorTab, openEditorTab } from "./editor-tabs";
import { WORKSPACE_CHANGE_ORIGIN } from "./editor-undo";
import { useRoomSession } from "./use-room-session";
import { createWorkspaceFileActions } from "./workspace-file-actions";
import { toggleMobileWorkspacePanel, type MobileWorkspacePanel } from "./workspace-layout-model";

export function useWorkspaceController(roomId: string) {
  const { i18n } = useTranslation();
  const { client, files, folders, settings, presenceRevision } = useRoomSession(roomId);
  const [selectedPath, setSelectedPath] = useState("src/App.tsx");
  const [openTabPaths, setOpenTabPaths] = useState(["src/App.tsx"]);
  const [followingUserId, setFollowingUserId] = useState<string | null>(null);
  const [mobilePanel, setMobilePanel] = useState<MobileWorkspacePanel | null>(null);
  const [vimMode, setVimMode] = useState(
    () =>
      typeof window !== "undefined" && window.localStorage.getItem("tsugite.vim-mode") === "true",
  );
  const [fileSearchOpen, setFileSearchOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [keymap, setKeymap] = useState<KeyBinding[]>(() => readKeymap());
  const presenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousFilePathsRef = useRef(new Map<string, string>());
  const editorFocusRef = useRef<(() => void) | undefined>(undefined);
  const focusEditorWhenReadyRef = useRef(false);
  const focusInitialEditorRef = useRef(true);
  const focusEditorAfterSelectionRef = useRef(false);

  useEffect(() => {
    return () => {
      if (presenceTimer.current) clearTimeout(presenceTimer.current);
    };
  }, []);

  const filesByPath = useMemo(() => new Map(files.map((file) => [file.path, file])), [files]);
  const selectedFile = useMemo(() => filesByPath.get(selectedPath), [filesByPath, selectedPath]);
  const previewFile =
    selectedFile ?? files.find((file) => file.path === "src/main.tsx") ?? files[0];
  const openFiles = useMemo(
    () => openTabPaths.map((path) => filesByPath.get(path)).filter(Boolean),
    [filesByPath, openTabPaths],
  ) as ProjectFile[];

  useEffect(() => {
    if (files.length === 0) return;
    const availablePaths = new Set(files.map((file) => file.path));
    const currentFilePaths = new Map(files.map((file) => [file.id, file.path]));
    const renamedPaths = new Map<string, string>();
    for (const [fileId, previousPath] of previousFilePathsRef.current) {
      const nextPath = currentFilePaths.get(fileId);
      if (nextPath && nextPath !== previousPath) renamedPaths.set(previousPath, nextPath);
    }
    previousFilePathsRef.current = currentFilePaths;

    const nextTabs = openTabPaths
      .map((path) => renamedPaths.get(path) ?? path)
      .filter((path) => availablePaths.has(path));
    if (
      nextTabs.length !== openTabPaths.length ||
      nextTabs.some((path, index) => path !== openTabPaths[index])
    ) {
      setOpenTabPaths(nextTabs);
    }

    const renamedSelectedPath = renamedPaths.get(selectedPath) ?? selectedPath;
    if (renamedSelectedPath && availablePaths.has(renamedSelectedPath)) {
      if (renamedSelectedPath !== selectedPath) setSelectedPath(renamedSelectedPath);
      return;
    }
    const nextPath = nextTabs[0] ?? "";
    if (nextPath !== selectedPath) setSelectedPath(nextPath);
  }, [files, openTabPaths, selectedPath]);

  const selectFile = useCallback(
    (path: string) => {
      if (presenceTimer.current) {
        clearTimeout(presenceTimer.current);
        presenceTimer.current = null;
      }
      setOpenTabPaths((current) => openEditorTab(current, path));
      focusEditorAfterSelectionRef.current = true;
      setSelectedPath(path);
      client.sendPresence(path);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (!focusEditorAfterSelectionRef.current) return;
          focusEditorAfterSelectionRef.current = false;
          editorFocusRef.current?.();
        }),
      );
    },
    [client],
  );

  const activateFile = (path: string) => {
    setFollowingUserId(null);
    selectFile(path);
  };

  const followingMember = useMemo(
    () =>
      followingUserId
        ? client.members.find((member) => member.userId === followingUserId)
        : undefined,
    [client, followingUserId, presenceRevision],
  );
  const followedSelection = useMemo(
    () =>
      followingMember?.selectedPath === selectedPath ? (followingMember.cursor ?? null) : null,
    [followingMember, selectedPath],
  );

  useEffect(() => {
    if (!followingUserId) return;
    const member = client.members.find((candidate) => candidate.userId === followingUserId);
    if (!member) {
      setFollowingUserId(null);
      return;
    }
    if (member.selectedPath && member.selectedPath !== selectedPath) {
      selectFile(member.selectedPath);
    }
  }, [client, followingUserId, presenceRevision, selectedPath, selectFile]);

  const handleFollowMember = (userId: string) => {
    if (userId === client.identity.userId) return;
    if (followingUserId === userId) {
      setFollowingUserId(null);
      return;
    }
    const member = client.members.find((candidate) => candidate.userId === userId);
    if (!member) return;
    setFollowingUserId(userId);
    if (member.selectedPath) selectFile(member.selectedPath);
  };

  const handleCloseTab = (path: string) => {
    setFollowingUserId(null);
    const result = closeEditorTab(openTabPaths, path, selectedPath);
    setOpenTabPaths(result.paths);
    if (path === selectedPath) setSelectedPath(result.nextPath);
  };

  const updateSharedSetting = <K extends keyof ProjectSettings>(
    key: K,
    value: ProjectSettings[K],
  ) => {
    setFollowingUserId(null);
    setSharedSetting(client.doc, key, value);
    client.doc.commit({ origin: WORKSPACE_CHANGE_ORIGIN });
  };

  const updateVimMode = (enabled: boolean) => {
    setVimMode(enabled);
    window.localStorage.setItem("tsugite.vim-mode", String(enabled));
  };
  const updateKeymap = (bindings: KeyBinding[]) => {
    setKeymap(bindings);
    writeKeymap(bindings);
  };
  const updateLanguage = (language: LanguageCode) => {
    void i18n.changeLanguage(language);
  };
  const focusEditorIfRequested = useCallback(() => {
    const focus = editorFocusRef.current;
    if (focus && (focusEditorWhenReadyRef.current || focusInitialEditorRef.current)) {
      focusEditorWhenReadyRef.current = false;
      focusInitialEditorRef.current = false;
      focus();
    }
  }, []);

  const handleEditorFocusReady = useCallback(
    (focus: (() => void) | undefined) => {
      editorFocusRef.current = focus;
      focusEditorIfRequested();
      if (focus && focusEditorAfterSelectionRef.current) {
        focusEditorAfterSelectionRef.current = false;
        focus();
      }
    },
    [focusEditorIfRequested],
  );

  useEffect(() => {
    if (!fileSearchOpen) focusEditorIfRequested();
  }, [fileSearchOpen, focusEditorIfRequested]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.matches("input, textarea")) {
        return;
      }
      if (matchesKeyBinding(event, "Mod-,")) {
        event.preventDefault();
        window.dispatchEvent(
          new CustomEvent("iris:open-settings", {
            detail: { returnFocus: true },
          }),
        );
        return;
      }
      const commandBinding = keymap.find((candidate) => candidate.action === "command.palette");
      if (commandBinding && matchesKeyBinding(event, commandBinding.key)) {
        event.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }
      const binding = keymap.find((candidate) => candidate.action === "file.search");
      if (binding && matchesKeyBinding(event, binding.key)) {
        event.preventDefault();
        setFileSearchOpen(true);
        return;
      }
      const consoleBinding = keymap.find((candidate) => candidate.action === "preview.console");
      if (consoleBinding && matchesKeyBinding(event, consoleBinding.key)) {
        event.preventDefault();
        window.dispatchEvent(new Event("iris:toggle-preview-console"));
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [keymap]);

  useEffect(() => {
    const focusEditor = () =>
      requestAnimationFrame(() => requestAnimationFrame(() => editorFocusRef.current?.()));
    window.addEventListener("iris:settings-closed", focusEditor);
    return () => window.removeEventListener("iris:settings-closed", focusEditor);
  }, []);

  const { handleAddFile, handleAddFolder, handleRename, handleCopy, handleDelete } =
    createWorkspaceFileActions({
      doc: client.doc,
      selectedPath,
      openTabPaths,
      setSelectedPath,
      setOpenTabPaths,
      activateFile,
      stopFollowing: () => setFollowingUserId(null),
    });

  const handleCursorChange = (cursor: { anchor: number; head: number }) => {
    setFollowingUserId(null);
    if (presenceTimer.current) {
      clearTimeout(presenceTimer.current);
      presenceTimer.current = null;
    }
    presenceTimer.current = setTimeout(() => client.sendPresence(selectedPath, cursor), 120);
  };

  const handleDisplayNameChange = (displayName: string): boolean => {
    setFollowingUserId(null);
    return client.updateDisplayName(displayName);
  };
  const handleColorChange = (color: string): boolean => {
    setFollowingUserId(null);
    return client.updateColor(color);
  };
  const toggleMobilePanel = (panel: MobileWorkspacePanel) => {
    setFollowingUserId(null);
    setMobilePanel((current) => toggleMobileWorkspacePanel(current, panel));
  };

  return {
    client,
    settings,
    files,
    folders,
    selectedPath,
    openFiles,
    selectedFile,
    previewFile,
    followingUserId,
    followedSelection,
    mobilePanel,
    vimMode,
    fileSearchOpen,
    commandPaletteOpen,
    keymap,
    editorFocusRef,
    focusEditorWhenReadyRef,
    focusInitialEditorRef,
    setCommandPaletteOpen,
    setFileSearchOpen,
    setMobilePanel,
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
