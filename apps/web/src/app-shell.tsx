import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Theme } from "@radix-ui/themes";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";

import {
  copyFile,
  createFile,
  createFolder,
  deleteFile,
  deleteFolder,
  getFileByPath,
  listFolders,
  listFiles,
  readSettings,
  renameFolder,
  renameFile,
  setSharedSetting,
  type ProjectFile,
  type ProjectSettings,
} from "@iris/shared";

import { EditorPane } from "./components/editor-pane";
import { FileTree } from "./components/file-tree";
import type { FileTreeTarget } from "./components/file-tree";
import { GlobalHeader } from "./components/global-header";
import { PreviewPane } from "./components/preview-pane";
import { WorkspaceLayout } from "./components/workspace-layout";
import { closeEditorTab, openEditorTab } from "./lib/editor-tabs";
import { isDarkWorkspaceTheme } from "./lib/workspace-theme";
import { RoomClient, getIdentity } from "./lib/room-client";
import {
  toggleMobileWorkspacePanel,
  type MobileWorkspacePanel,
} from "./lib/workspace-layout-model";

type AppShellProps = {
  roomId: string;
};

export function AppShell({ roomId }: AppShellProps) {
  const { t } = useTranslation();
  const [client] = useState(() => new RoomClient({ roomId, identity: getIdentity() }));
  const [revision, setRevision] = useState(0);
  const [selectedPath, setSelectedPath] = useState("src/main.tsx");
  const [openTabPaths, setOpenTabPaths] = useState(["src/main.tsx"]);
  const [mobilePanel, setMobilePanel] = useState<MobileWorkspacePanel | null>(null);
  const presenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubscribe = client.subscribe(() => setRevision((value) => value + 1));
    client.connect();
    return () => {
      unsubscribe();
      client.disconnect();
      if (presenceTimer.current) clearTimeout(presenceTimer.current);
    };
  }, [client]);

  const files = useMemo(() => listFiles(client.doc), [client, revision]);
  const folders = useMemo(() => listFolders(client.doc), [client, revision]);
  const settings = useMemo(() => readSettings(client.doc), [client, revision]);
  const selectedFile = selectedPath ? getFileByPath(client.doc, selectedPath) : undefined;
  const openFiles = useMemo(
    () => openTabPaths.map((path) => getFileByPath(client.doc, path)).filter(Boolean),
    [client, openTabPaths, revision],
  ) as ProjectFile[];

  useEffect(() => {
    if (files.length === 0) return;
    const availablePaths = new Set(files.map((file) => file.path));
    const nextTabs = openTabPaths.filter((path) => availablePaths.has(path));
    if (nextTabs.length !== openTabPaths.length) setOpenTabPaths(nextTabs);
    if (selectedPath && availablePaths.has(selectedPath)) return;
    const nextPath = nextTabs[0] ?? "";
    if (nextPath !== selectedPath) setSelectedPath(nextPath);
  }, [files, openTabPaths, selectedPath]);

  const activateFile = (path: string) => {
    if (presenceTimer.current) {
      clearTimeout(presenceTimer.current);
      presenceTimer.current = null;
    }
    setOpenTabPaths((current) => openEditorTab(current, path));
    setSelectedPath(path);
    client.sendPresence(path);
  };

  const handleCloseTab = (path: string) => {
    const result = closeEditorTab(openTabPaths, path, selectedPath);
    setOpenTabPaths(result.paths);
    if (path === selectedPath) setSelectedPath(result.nextPath);
  };

  const updateSharedSetting = <K extends keyof ProjectSettings>(
    key: K,
    value: ProjectSettings[K],
  ) => {
    setSharedSetting(client.doc, key, value);
    client.doc.commit();
  };

  const handleAddFile = (_target: FileTreeTarget, nextPath: string): string | undefined => {
    try {
      const file = createFile(
        client.doc,
        nextPath,
        "typescript",
        `export const name = '${nextPath.split("/").at(-1)}'`,
      );
      activateFile(file.path);
      client.doc.commit();
      return undefined;
    } catch (error) {
      return error instanceof Error ? error.message : "Unable to create file";
    }
  };

  const handleAddFolder = (_target: FileTreeTarget, nextPath: string): string | undefined => {
    try {
      createFolder(client.doc, nextPath);
      client.doc.commit();
      return undefined;
    } catch (error) {
      return error instanceof Error ? error.message : "Unable to create folder";
    }
  };

  const handleRename = (
    target: Exclude<FileTreeTarget, null>,
    nextPath: string,
  ): string | undefined => {
    const currentPath = target.type === "file" ? target.file.path : target.path;
    if (!nextPath || nextPath === currentPath) return undefined;
    try {
      if (target.type === "file") {
        renameFile(client.doc, target.file.id, nextPath);
        setOpenTabPaths((current) =>
          current.map((path) => (path === currentPath ? nextPath : path)),
        );
        if (selectedPath === currentPath) setSelectedPath(nextPath);
      } else {
        renameFolder(client.doc, currentPath, nextPath);
        setOpenTabPaths((current) =>
          current.map((path) =>
            path.startsWith(`${currentPath}/`)
              ? `${nextPath}${path.slice(currentPath.length)}`
              : path,
          ),
        );
        if (selectedPath.startsWith(`${currentPath}/`)) {
          setSelectedPath(`${nextPath}${selectedPath.slice(currentPath.length)}`);
        }
      }
      client.doc.commit();
      return undefined;
    } catch (error) {
      return error instanceof Error ? error.message : "Unable to rename item";
    }
  };

  const handleCopy = (file: ProjectFile) => {
    try {
      const copied = copyFile(client.doc, file.id);
      client.doc.commit();
      activateFile(copied.path);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Unable to duplicate file");
    }
  };

  const handleDelete = (target: Exclude<FileTreeTarget, null>) => {
    const path = target.type === "file" ? target.file.path : target.path;
    if (!window.confirm(`Delete ${path}?`)) return;
    if (target.type === "file") {
      deleteFile(client.doc, target.file.id);
      if (openTabPaths.includes(path)) {
        const result = closeEditorTab(openTabPaths, path, selectedPath);
        setOpenTabPaths(result.paths);
        if (selectedPath === path) setSelectedPath(result.nextPath);
      }
    } else {
      deleteFolder(client.doc, target.path);
      const removedPaths = openTabPaths.filter((tabPath) => tabPath.startsWith(`${path}/`));
      let nextPaths = openTabPaths;
      let nextSelectedPath = selectedPath;
      for (const removedPath of removedPaths) {
        const result = closeEditorTab(nextPaths, removedPath, nextSelectedPath);
        nextPaths = result.paths;
        nextSelectedPath = result.nextPath;
      }
      setOpenTabPaths(nextPaths);
      if (selectedPath.startsWith(`${path}/`)) setSelectedPath(nextSelectedPath);
    }
    client.doc.commit();
  };

  const handleCursorChange = (cursor: { anchor: number; head: number }) => {
    if (presenceTimer.current) clearTimeout(presenceTimer.current);
    presenceTimer.current = setTimeout(() => client.sendPresence(selectedPath, cursor), 120);
  };

  const handleDisplayNameChange = (displayName: string) => client.updateDisplayName(displayName);
  const handleColorChange = (color: string) => client.updateColor(color);
  const toggleMobilePanel = (panel: MobileWorkspacePanel) => {
    setMobilePanel((current) => toggleMobileWorkspacePanel(current, panel));
  };

  return (
    <Theme
      asChild
      appearance={isDarkWorkspaceTheme(settings.theme) ? "dark" : "light"}
      accentColor="blue"
      grayColor="gray"
      radius="medium"
      scaling="100%"
    >
      <motion.main
        className={`grid min-h-screen w-full grid-cols-1 grid-rows-[48px_minmax(0,1fr)] overflow-hidden bg-iris-canvas max-[760px]:grid-rows-[44px_minmax(0,1fr)] theme-${settings.theme}`}
        style={{ "--code-font": `'${settings.fontFamily}'` } as CSSProperties}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.24, ease: "easeOut" }}
      >
        <GlobalHeader
          currentUserId={client.identity.userId}
          roomId={roomId}
          members={client.members}
          status={client.status}
          onOpenFiles={() => toggleMobilePanel("files")}
          onOpenPreview={() => toggleMobilePanel("preview")}
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
                onDelete={handleDelete}
                currentUser={client.identity}
                onDisplayNameChange={handleDisplayNameChange}
                onColorChange={handleColorChange}
                settings={settings}
                onSettingChange={updateSharedSetting}
              />
            </div>
          }
          editor={
            <section className="flex h-full min-w-0 min-h-0 flex-col bg-[var(--editor-surface)] max-[760px]:min-h-[calc(100vh-44px)]">
              {selectedFile ? (
                <EditorPane
                  doc={client.doc}
                  file={selectedFile}
                  tabs={openFiles}
                  settings={settings}
                  onSelectTab={activateFile}
                  onCloseTab={handleCloseTab}
                  onCursorChange={handleCursorChange}
                  remoteMembers={client.members}
                  currentUserId={client.identity.userId}
                />
              ) : (
                <div className="grid min-h-0 flex-1 place-items-center font-iris-mono text-xs leading-6 text-iris-muted">
                  {t("app.waitingSnapshot")}
                </div>
              )}
            </section>
          }
          preview={
            <aside
              className={`h-full min-h-0 min-w-0 overflow-hidden bg-iris-preview max-[760px]:fixed max-[760px]:right-0 max-[760px]:top-11 max-[760px]:bottom-0 max-[760px]:z-10 max-[760px]:h-auto max-[760px]:w-[min(92vw,420px)] max-[760px]:shadow-[-8px_0_28px_rgba(66,68,45,0.12)] ${mobilePanel === "preview" ? "max-[760px]:block" : "max-[760px]:hidden"}`}
            >
              {selectedFile ? (
                <PreviewPane
                  file={selectedFile}
                  files={files}
                  folders={folders}
                  settings={settings}
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
