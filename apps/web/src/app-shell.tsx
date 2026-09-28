import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Theme } from "@radix-ui/themes";
import { Provider } from "jotai";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { EditorPane } from "./components/editor-pane";
import { FileTree } from "./components/file-tree";
import type { FileTreeTarget } from "./lib/file-tree-model";
import { FileDeletionControl } from "./components/file-deletion-control";
import { GlobalHeader } from "./components/global-header";
import { PreviewPane } from "./components/preview-pane";
import { WorkspaceLayout } from "./components/workspace-layout";
import { FileFuzzySearchDialog } from "./components/file-fuzzy-search-dialog";
import { CommandPalette } from "./components/command-palette";
import { dispatchRuntimeAction } from "./lib/runtime-actions";
import { isDarkWorkspaceTheme, readRoomTheme, writeRoomTheme } from "./lib/workspace-theme";
import { useWorkspaceController } from "./lib/use-workspace-controller";
import type { EditorLocation } from "./lib/editor-navigation";
import { useRoomDrafts } from "./lib/use-room-drafts";
import { RoomDraftRecovery } from "./components/room-draft-recovery";
import type { FileDeletionRecovery } from "./lib/file-deletion-recovery";
import type { ProjectSettings, WorkspaceTheme } from "@iris/shared";

export function AppShell({ roomId }: { roomId: string }) {
  return (
    <Provider>
      <AppShellContent roomId={roomId} />
    </Provider>
  );
}

function AppShellContent({ roomId }: { roomId: string }) {
  const { t } = useTranslation();
  const [requestedLocation, setRequestedLocation] = useState<EditorLocation>();
  const [deletionRecovery, setDeletionRecovery] = useState<FileDeletionRecovery>();
  const {
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
  } = useWorkspaceController(roomId);
  const { state: draftState, session: draftSession } = useRoomDrafts(client);
  const [themePreview, setThemePreview] = useState<WorkspaceTheme | null>(null);
  const [cachedTheme] = useState(() => readRoomTheme(window.localStorage, roomId));
  const isThemeReady = hasReceivedSnapshot || cachedTheme !== null;
  useEffect(() => {
    if (!isThemeReady) return;
    const frame = requestAnimationFrame(() => document.getElementById("app-boot")?.remove());
    return () => cancelAnimationFrame(frame);
  }, [isThemeReady]);
  useEffect(() => {
    if (hasReceivedSnapshot) writeRoomTheme(window.localStorage, roomId, settings.theme);
  }, [hasReceivedSnapshot, roomId, settings.theme]);
  const visualSettings = useMemo(
    () => ({
      ...settings,
      theme: themePreview ?? (hasReceivedSnapshot ? null : cachedTheme) ?? settings.theme,
    }),
    [settings, themePreview, hasReceivedSnapshot, cachedTheme],
  );
  const handlePaletteSettingChange = useCallback(
    <K extends keyof ProjectSettings>(key: K, value: ProjectSettings[K]) => {
      if (key === "theme") setThemePreview(null);
      updateSharedSetting(key, value);
    },
    [updateSharedSetting],
  );
  const openFilesPanel = useCallback(() => toggleMobilePanel("files"), [toggleMobilePanel]);
  const openPreviewPanel = useCallback(() => toggleMobilePanel("preview"), [toggleMobilePanel]);
  const handleDraftClose = useCallback(() => editorFocusRef.current?.(), [editorFocusRef]);
  const handleCommandPaletteCloseAutoFocus = useCallback(
    () => requestAnimationFrame(() => requestAnimationFrame(() => editorFocusRef.current?.())),
    [editorFocusRef],
  );
  const handleCommandSelect = useCallback(
    (action: string) => {
      if (action === "file.search") setFileSearchOpen(true);
      if (action === "settings.open") setSettingsOpen(true);
    },
    [setFileSearchOpen, setSettingsOpen],
  );
  const handleFileSelect = useCallback(
    (path: string) => {
      activateFile(path);
      setMobilePanel(null);
    },
    [activateFile, setMobilePanel],
  );
  const handleFileDelete = useCallback(
    (target: Exclude<FileTreeTarget, null>) => {
      const recovery = handleDelete(target);
      if (recovery) setDeletionRecovery(recovery);
    },
    [handleDelete],
  );
  const handleFileSearchOpenChange = useCallback(
    (open: boolean) => {
      focusEditorWhenReadyRef.current = !open;
      if (open) focusInitialEditorRef.current = false;
      setFileSearchOpen(open);
    },
    [focusEditorWhenReadyRef, focusInitialEditorRef, setFileSearchOpen],
  );
  const handleEditorLocalInteraction = useCallback(
    () => setFollowingUserId(null),
    [setFollowingUserId],
  );
  const handleLocationHandled = useCallback(() => setRequestedLocation(undefined), []);
  const handleNavigateToSource = useCallback(
    (location: EditorLocation) => {
      const sourceFile = files.find((item) => item.path === location.path);
      if (sourceFile?.text.toString() !== location.source) return;
      setRequestedLocation({ ...location });
      activateFile(location.path);
      setMobilePanel(null);
    },
    [activateFile, files, setMobilePanel],
  );

  return (
    <Theme
      asChild
      appearance={isDarkWorkspaceTheme(visualSettings.theme) ? "dark" : "light"}
      accentColor="blue"
      grayColor="gray"
      radius="medium"
      scaling="100%"
    >
      <motion.main
        className={`grid h-screen min-h-screen w-full grid-cols-1 grid-rows-[48px_minmax(0,1fr)] overflow-hidden bg-iris-canvas pb-1 max-[760px]:grid-rows-[44px_minmax(0,1fr)] theme-${visualSettings.theme} ${isThemeReady ? "" : "invisible"}`}
        style={{ "--code-font": `'${visualSettings.fontFamily}'` } as CSSProperties}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.24, ease: "easeOut" }}
      >
        <GlobalHeader
          currentUserId={client.identity.userId}
          roomId={roomId}
          members={members}
          status={status}
          syncError={client.syncError}
          hasPendingChanges={hasPendingChanges}
          draftBackup={draftState.backup}
          followingUserId={followingUserId}
          onFollowMember={handleFollowMember}
          onOpenFiles={openFilesPanel}
          onOpenPreview={openPreviewPanel}
        />
        <RoomDraftRecovery
          state={draftState}
          session={draftSession}
          theme={visualSettings.theme}
          onClose={handleDraftClose}
        />
        <CommandPalette
          settings={settings}
          previewTheme={themePreview}
          vimMode={vimMode}
          onOpenChange={setCommandPaletteOpen}
          onSettingChange={handlePaletteSettingChange}
          onThemePreview={setThemePreview}
          onVimModeChange={updateVimMode}
          onRuntimeAction={dispatchRuntimeAction}
          onTogglePreviewConsole={togglePreviewConsole}
          onLanguageChange={updateLanguage}
          keymap={keymap}
          onCloseAutoFocus={handleCommandPaletteCloseAutoFocus}
          onSelect={handleCommandSelect}
        />
        <FileDeletionControl
          recovery={deletionRecovery}
          theme={visualSettings.theme}
          onClose={() => setDeletionRecovery(undefined)}
        />

        <WorkspaceLayout
          files={
            <div
              className={`min-h-0 h-full overflow-hidden border-r border-iris-divider max-[760px]:fixed max-[760px]:left-0 max-[760px]:top-11 max-[760px]:bottom-0 max-[760px]:z-10 max-[760px]:h-auto max-[760px]:min-h-0 ${mobilePanel === "files" ? "max-[760px]:block" : "max-[760px]:hidden"}`}
            >
              <FileTree
                files={files}
                folders={folders}
                selectedPath={selectedPath}
                onSelect={handleFileSelect}
                onCreateFile={handleAddFile}
                onCreateFolder={handleAddFolder}
                onRename={handleRename}
                onCopy={handleCopy}
                onDelete={handleFileDelete}
                currentUserDisplayName={client.identity.displayName}
                currentUserColor={client.identity.color}
                onDisplayNameChange={handleDisplayNameChange}
                onColorChange={handleColorChange}
                settings={visualSettings}
                onSettingChange={updateSharedSetting}
                vimMode={vimMode}
                onVimModeChange={updateVimMode}
                keymap={keymap}
                onKeymapChange={updateKeymap}
                onLanguageChange={updateLanguage}
              />
              <FileFuzzySearchDialog
                files={files}
                theme={visualSettings.theme}
                onOpenChange={handleFileSearchOpenChange}
                onSelect={activateFile}
              />
            </div>
          }
          editor={
            <section className="flex h-full min-w-0 min-h-0 flex-col bg-[var(--editor-surface)] max-[760px]:min-h-[calc(100vh-48px)]">
              {selectedFile ? (
                <EditorPane
                  doc={client.doc}
                  file={selectedFile}
                  files={files}
                  tabs={openFiles}
                  settings={visualSettings}
                  vimMode={vimMode}
                  onSelectTab={activateFile}
                  onCloseTab={handleCloseTab}
                  onCursorChange={handleCursorChange}
                  onLocalInteraction={handleEditorLocalInteraction}
                  followedSelection={followedSelection}
                  isFollowing={Boolean(followingUserId)}
                  remoteMembers={members}
                  currentUserId={client.identity.userId}
                  onEditorFocusReady={handleEditorFocusReady}
                  requestedLocation={requestedLocation}
                  onLocationHandled={handleLocationHandled}
                />
              ) : (
                <div className="grid min-h-0 flex-1 place-items-center font-iris-mono text-xs leading-6 text-iris-muted">
                  {t("editor.noOpenFiles")}
                </div>
              )}
            </section>
          }
          preview={
            <aside
              className={`h-full min-h-0 min-w-0 overflow-hidden bg-iris-preview max-[760px]:fixed max-[760px]:right-0 max-[760px]:top-11 max-[760px]:bottom-0 max-[760px]:z-10 max-[760px]:h-auto max-[760px]:w-[min(92vw,420px)] max-[760px]:shadow-[-8px_0_28px_rgba(66,68,45,0.12)] ${mobilePanel === "preview" ? "max-[760px]:block" : "max-[760px]:hidden"}`}
            >
              {previewFile ? (
                <PreviewPane
                  file={previewFile}
                  files={files}
                  folders={folders}
                  settings={visualSettings}
                  previewConsoleOpen={previewConsoleOpen}
                  onPreviewConsoleOpenChange={setPreviewConsoleOpen}
                  onNavigateToSource={handleNavigateToSource}
                />
              ) : (
                <div className="grid min-h-0 flex-1 place-items-center font-iris-mono text-xs leading-6 text-iris-muted">
                  {t("app.waitingPreview")}
                </div>
              )}
            </aside>
          }
        />
      </motion.main>
    </Theme>
  );
}
