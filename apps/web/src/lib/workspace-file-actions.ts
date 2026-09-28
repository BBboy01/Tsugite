import type { LoroDoc } from "loro-crdt";
import {
  copyFile,
  createFile,
  createFolder,
  deleteFile,
  deleteFolder,
  renameFolder,
  renameFile,
  type ProjectFile,
} from "@iris/shared";
import type { FileTreeTarget } from "./file-tree-model";
import { closeEditorTab } from "./editor-tabs";
import { WORKSPACE_CHANGE_ORIGIN } from "./editor-undo";
import {
  captureDeletedItem,
  restoreDeletedItem,
  type FileDeletionRecovery,
} from "./file-deletion-recovery";

type FileActionOptions = {
  doc: LoroDoc;
  selectedPath: string;
  openTabPaths: string[];
  setNavigation: (selectedPath: string, openTabPaths: string[]) => void;
  activateFile: (path: string) => void;
  stopFollowing: () => void;
};

export function createWorkspaceFileActions({
  doc,
  selectedPath,
  openTabPaths,
  setNavigation,
  activateFile,
  stopFollowing,
}: FileActionOptions) {
  const commitNavigation = (nextSelectedPath: string, nextOpenTabPaths: string[]) => {
    const tabsUnchanged =
      nextOpenTabPaths.length === openTabPaths.length &&
      nextOpenTabPaths.every((path, index) => path === openTabPaths[index]);
    if (nextSelectedPath !== selectedPath || !tabsUnchanged) {
      setNavigation(nextSelectedPath, nextOpenTabPaths);
    }
  };

  const handleAddFile = (_target: FileTreeTarget, nextPath: string): string | undefined => {
    try {
      const language = /\.(?:[cm]?js|jsx)$/i.test(nextPath.trim()) ? "javascript" : "typescript";
      const file = createFile(doc, nextPath, language);
      activateFile(file.path);
      doc.commit({ origin: WORKSPACE_CHANGE_ORIGIN });
      return undefined;
    } catch (error) {
      return error instanceof Error ? error.message : "Unable to create file";
    }
  };

  const handleAddFolder = (_target: FileTreeTarget, nextPath: string): string | undefined => {
    try {
      stopFollowing();
      createFolder(doc, nextPath);
      doc.commit({ origin: WORKSPACE_CHANGE_ORIGIN });
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
      stopFollowing();
      let nextSelectedPath = selectedPath;
      let nextOpenTabPaths: string[];
      if (target.type === "file") {
        renameFile(doc, target.file.id, nextPath);
        nextOpenTabPaths = openTabPaths.map((path) => (path === currentPath ? nextPath : path));
        if (selectedPath === currentPath) nextSelectedPath = nextPath;
      } else {
        renameFolder(doc, currentPath, nextPath);
        nextOpenTabPaths = openTabPaths.map((path) =>
          path.startsWith(`${currentPath}/`)
            ? `${nextPath}${path.slice(currentPath.length)}`
            : path,
        );
        if (selectedPath.startsWith(`${currentPath}/`)) {
          nextSelectedPath = `${nextPath}${selectedPath.slice(currentPath.length)}`;
        }
      }
      commitNavigation(nextSelectedPath, nextOpenTabPaths);
      doc.commit({ origin: WORKSPACE_CHANGE_ORIGIN });
      return undefined;
    } catch (error) {
      return error instanceof Error ? error.message : "Unable to rename item";
    }
  };

  const handleCopy = (file: ProjectFile) => {
    try {
      const copied = copyFile(doc, file.id);
      doc.commit({ origin: WORKSPACE_CHANGE_ORIGIN });
      activateFile(copied.path);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Unable to duplicate file");
    }
  };

  const handleDelete = (
    target: Exclude<FileTreeTarget, null>,
  ): FileDeletionRecovery | undefined => {
    const deleted = captureDeletedItem(doc, target);
    if (!deleted) return undefined;
    const { path } = deleted;
    stopFollowing();
    if (target.type === "file") {
      deleteFile(doc, target.file.id);
      if (openTabPaths.includes(path)) {
        const result = closeEditorTab(openTabPaths, path, selectedPath);
        commitNavigation(selectedPath === path ? result.nextPath : selectedPath, result.paths);
      }
    } else {
      deleteFolder(doc, target.path);
      const removedPaths = openTabPaths.filter((tabPath) => tabPath.startsWith(`${path}/`));
      let nextPaths = openTabPaths;
      let nextSelectedPath = selectedPath;
      for (const removedPath of removedPaths) {
        const result = closeEditorTab(nextPaths, removedPath, nextSelectedPath);
        nextPaths = result.paths;
        nextSelectedPath = result.nextPath;
      }
      commitNavigation(
        selectedPath.startsWith(`${path}/`) ? nextSelectedPath : selectedPath,
        nextPaths,
      );
    }
    doc.commit({ origin: WORKSPACE_CHANGE_ORIGIN });
    let restored = false;
    return {
      path,
      undo: () => {
        if (restored || !restoreDeletedItem(doc, deleted)) return false;
        restored = true;
        stopFollowing();
        const selectedFile = deleted.files.find((file) => file.path === selectedPath);
        if (selectedFile) activateFile(selectedFile.path);
        return true;
      },
    };
  };

  return { handleAddFile, handleAddFolder, handleRename, handleCopy, handleDelete };
}
