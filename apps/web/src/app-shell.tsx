import { useState, type CSSProperties } from "react";
import { Theme } from "@radix-ui/themes";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { EditorPane } from "./components/editor-pane";
import { FileTree } from "./components/file-tree";
import { FileDeletionControl } from "./components/file-deletion-control";
import { GlobalHeader } from "./components/global-header";
import { PreviewPane } from "./components/preview-pane";
import { WorkspaceLayout } from "./components/workspace-layout";
import { FileFuzzySearchDialog } from "./components/file-fuzzy-search-dialog";
import { CommandPalette } from "./components/command-palette";
import { dispatchRuntimeAction } from "./lib/runtime-actions";
import { isDarkWorkspaceTheme } from "./lib/workspace-theme";
import { useWorkspaceController } from "./lib/use-workspace-controller";
import type { EditorLocation } from "./lib/editor-navigation";
import { useRoomDrafts } from "./lib/use-room-drafts";
import { RoomDraftRecovery } from "./components/room-draft-recovery";
import type { FileDeletionRecovery } from "./lib/file-deletion-recovery";
import type { ProjectSettings, WorkspaceTheme } from "@iris/shared";

export function AppShell({ roomId }: { roomId: string }) {
  const { t } = useTranslation();
  const [requestedLocation, setRequestedLocation] = useState<EditorLocation>();
  const [deletionRecovery, setDeletionRecovery] = useState<FileDeletionRecovery>();
  const {
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
  } = useWorkspaceController(roomId);
  const { state: draftState, session: draftSession } = useRoomDrafts(client);
  const [themePreview, setThemePreview] = useState<WorkspaceTheme | null>(null);
  const visualSettings = themePreview ? { ...settings, theme: themePreview } : settings;
  const handlePaletteSettingChange = <K extends keyof ProjectSettings>(
    key: K,
    value: ProjectSettings[K],
  ) => {
    if (key === "theme") setThemePreview(null);
    updateSharedSetting(key, value);
  };

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
        className={`grid h-screen min-h-screen w-full grid-cols-1 grid-rows-[48px_minmax(0,1fr)] overflow-hidden bg-iris-canvas pb-1 max-[760px]:grid-rows-[44px_minmax(0,1fr)] theme-${visualSettings.theme}`}
        style={{ "--code-font": `'${visualSettings.fontFamily}'` } as CSSProperties}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.24, ease: "easeOut" }}
      >
        <GlobalHeader
          currentUserId={client.identity.userId}
          roomId={roomId}
          members={client.members}
          status={client.status}
          syncError={client.syncError}
          hasPendingChanges={client.hasPendingChanges}
          draftBackup={draftState.backup}
          followingUserId={followingUserId}
          onFollowMember={handleFollowMember}
          onOpenFiles={() => toggleMobilePanel("files")}
          onOpenPreview={() => toggleMobilePanel("preview")}
        />
        <RoomDraftRecovery
          state={draftState}
          session={draftSession}
          theme={visualSettings.theme}
          onClose={() => editorFocusRef.current?.()}
        />
        <CommandPalette
          open={commandPaletteOpen}
          settings={settings}
          previewTheme={themePreview}
          vimMode={vimMode}
          onOpenChange={setCommandPaletteOpen}
          onSettingChange={handlePaletteSettingChange}
          onThemePreview={setThemePreview}
          onVimModeChange={updateVimMode}
          onRuntimeAction={dispatchRuntimeAction}
          onLanguageChange={updateLanguage}
          keymap={keymap}
          onCloseAutoFocus={() =>
            requestAnimationFrame(() => requestAnimationFrame(() => editorFocusRef.current?.()))
          }
          onSelect={(action) => {
            if (action === "file.search") setFileSearchOpen(true);
            if (action === "settings.open")
              window.dispatchEvent(
                new CustomEvent("iris:open-settings", { detail: { returnFocus: true } }),
              );
          }}
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
                onSelect={(path) => {
                  activateFile(path);
                  setMobilePanel(null);
                }}
                onCreateFile={handleAddFile}
                onCreateFolder={handleAddFolder}
                onRename={handleRename}
                onCopy={handleCopy}
                onDelete={(target) => {
                  const recovery = handleDelete(target);
                  if (recovery) setDeletionRecovery(recovery);
                }}
                currentUser={client.identity}
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
                open={fileSearchOpen}
                files={files}
                theme={visualSettings.theme}
                onOpenChange={(open) => {
                  focusEditorWhenReadyRef.current = !open;
                  if (open) focusInitialEditorRef.current = false;
                  setFileSearchOpen(open);
                }}
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
                  onLocalInteraction={() => setFollowingUserId(null)}
                  followedSelection={followedSelection}
                  isFollowing={Boolean(followingUserId)}
                  remoteMembers={client.members}
                  currentUserId={client.identity.userId}
                  onEditorFocusReady={handleEditorFocusReady}
                  requestedLocation={requestedLocation}
                  onLocationHandled={() => setRequestedLocation(undefined)}
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
                  onNavigateToSource={(location) => {
                    const file = files.find((item) => item.path === location.path);
                    if (file?.text.toString() !== location.source) return;
                    setRequestedLocation({ ...location });
                    activateFile(location.path);
                    setMobilePanel(null);
                  }}
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
