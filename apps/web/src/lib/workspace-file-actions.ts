import type { Dispatch, SetStateAction } from "react";
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
import type { FileTreeTarget } from "../components/file-tree";
import { closeEditorTab } from "./editor-tabs";
import { WORKSPACE_CHANGE_ORIGIN } from "./editor-undo";

type FileActionOptions = {
  doc: LoroDoc;
  selectedPath: string;
  openTabPaths: string[];
  setSelectedPath: Dispatch<SetStateAction<string>>;
  setOpenTabPaths: Dispatch<SetStateAction<string[]>>;
  activateFile: (path: string) => void;
  stopFollowing: () => void;
};

export function createWorkspaceFileActions({
  doc,
  selectedPath,
  openTabPaths,
  setSelectedPath,
  setOpenTabPaths,
  activateFile,
  stopFollowing,
}: FileActionOptions) {
  const handleAddFile = (_target: FileTreeTarget, nextPath: string): string | undefined => {
    try {
      const file = createFile(
        doc,
        nextPath,
        "typescript",
        `export const name = '${nextPath.split("/").at(-1)}'`,
      );
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
      if (target.type === "file") {
        renameFile(doc, target.file.id, nextPath);
        setOpenTabPaths((current) =>
          current.map((path) => (path === currentPath ? nextPath : path)),
        );
        if (selectedPath === currentPath) setSelectedPath(nextPath);
      } else {
        renameFolder(doc, currentPath, nextPath);
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

  const handleDelete = (target: Exclude<FileTreeTarget, null>) => {
    const path = target.type === "file" ? target.file.path : target.path;
    if (!window.confirm(`Delete ${path}?`)) return;
    stopFollowing();
    if (target.type === "file") {
      deleteFile(doc, target.file.id);
      if (openTabPaths.includes(path)) {
        const result = closeEditorTab(openTabPaths, path, selectedPath);
        setOpenTabPaths(result.paths);
        if (selectedPath === path) setSelectedPath(result.nextPath);
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
      setOpenTabPaths(nextPaths);
      if (selectedPath.startsWith(`${path}/`)) setSelectedPath(nextSelectedPath);
    }
    doc.commit({ origin: WORKSPACE_CHANGE_ORIGIN });
  };

  return { handleAddFile, handleAddFolder, handleRename, handleCopy, handleDelete };
}
