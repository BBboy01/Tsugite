import { useFileTree } from "@pierre/trees/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ProjectFile, ProjectSettings } from "@iris/shared";
import type { ContextMenuOpenContext } from "@pierre/trees";
import { useTranslation } from "react-i18next";
import { folderAncestors, type FileTreeTarget } from "../lib/file-tree-model";
import { toPierreTreePaths } from "../lib/pierre-tree-paths";
import {
  canMovePierrePaths,
  createPierreDraft,
  getPierreExpandedPaths,
  getPierreTarget,
  resolvePierreDraftEdit,
  type PierreDraft,
} from "../lib/pierre-file-tree-actions";
import {
  pierreFileTreeCSS,
  usePierreFileTreeDom,
} from "./use-pierre-file-tree-dom";

export type PierreFileTreeProps = {
  files: ProjectFile[];
  folders: string[];
  selectedPath: string;
  theme: ProjectSettings["theme"];
  label: string;
  onSelect: (path: string) => void;
  onMove: (
    sourcePaths: readonly string[],
    targetDirectory: string,
  ) => string | undefined;
  onCreateFile: (target: FileTreeTarget, path: string) => string | undefined;
  onCreateFolder: (target: FileTreeTarget, path: string) => string | undefined;
  onRename: (
    target: Exclude<FileTreeTarget, null>,
    path: string,
  ) => string | undefined;
  onCopy: (file: ProjectFile) => void;
  onDelete: (target: Exclude<FileTreeTarget, null>) => void;
};

export function usePierreFileTreeController({
  files,
  folders,
  selectedPath,
  theme,
  label,
  onSelect,
  onMove,
  onCreateFile,
  onCreateFolder,
  onRename,
  onCopy,
  onDelete,
}: PierreFileTreeProps) {
  const { t } = useTranslation();
  const paths = useMemo(
    () =>
      toPierreTreePaths(
        files.map((file) => file.path),
        folders,
      ),
    [files, folders],
  );
  const pathsRef = useRef(paths);
  const pathsSignature = paths.join("\0");
  const pathsSignatureRef = useRef(pathsSignature);
  const foldersSignature = folders.join("\0");
  const lastTreeSelectionPathRef = useRef<string | null>(null);
  const startingRenameRef = useRef(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const callbacks = useRef({
    onSelect,
    selectedPath,
    onMove,
    files,
    onCreateFile,
    onCreateFolder,
    onRename,
    onCopy,
    onDelete,
  });
  callbacks.current = {
    onSelect,
    selectedPath,
    onMove,
    files,
    onCreateFile,
    onCreateFolder,
    onRename,
    onCopy,
    onDelete,
  };
  const drafts = useRef(new Map<string, PierreDraft>());
  const [deletePrompt, setDeletePrompt] = useState<{
    target: Exclude<FileTreeTarget, null>;
    anchorRect: DOMRect;
  } | null>(null);
  const [deleteError, setDeleteError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [rootContext, setRootContext] = useState<ContextMenuOpenContext | null>(
    null,
  );
  const modelRef = useRef<ReturnType<typeof useFileTree>["model"] | null>(null);
  const resetTreePaths = (nextPaths: string[]) => {
    modelRef.current?.resetPaths(nextPaths, {
      initialExpandedPaths: getPierreExpandedPaths(
        pathsRef.current,
        nextPaths,
        (path) => {
          const item = modelRef.current?.getItem(path);
          return Boolean(item && "isExpanded" in item && item.isExpanded());
        },
      ),
    });
  };
  const { model } = useFileTree({
    paths,
    initialExpansion: "closed",
    initialExpandedPaths: folders.map((folder) => `${folder}/`),
    initialSelectedPaths: selectedPath ? [selectedPath] : [],
    flattenEmptyDirectories: true,
    stickyFolders: true,
    icons: { set: "complete", colored: true },
    labels: {
      searchPlaceholder: "Search...",
    },
    onSearchChange: (value) => setSearchOpen(value !== null),
    unsafeCSS: pierreFileTreeCSS,
    search: true,
    fileTreeSearchMode: "hide-non-matches",
    onSelectionChange: (selected) => {
      const path = selected.at(-1);
      if (
        path &&
        !startingRenameRef.current &&
        !drafts.current.has(path) &&
        path !== callbacks.current.selectedPath &&
        !path.endsWith("/")
      ) {
        lastTreeSelectionPathRef.current = path;
        callbacks.current.onSelect(path);
      }
    },
    composition: {
      contextMenu: {
        enabled: true,
        triggerMode: "both",
        buttonVisibility: "when-needed",
      },
    },
    dragAndDrop: {
      canDrag: (items) => !items.includes("package.json"),
      canDrop: ({ draggedPaths, target }) =>
        canMovePierrePaths(draggedPaths, target.directoryPath),
      onDropComplete: ({ draggedPaths, target }) => {
        const error = callbacks.current.onMove(
          draggedPaths,
          target.directoryPath ?? "",
        );
        if (error) {
          resetTreePaths(pathsRef.current);
          setActionError(error);
        }
      },
      onDropError: (_error, { draggedPaths, target }) => {
        const error = callbacks.current.onMove(
          draggedPaths,
          target.directoryPath ?? "",
        );
        resetTreePaths(pathsRef.current);
        setActionError(error);
      },
    },
    renaming: {
      canRename: ({ path }) => path !== "package.json",
      onRename: ({ sourcePath, destinationPath, isFolder }) => {
        const target = getPierreTarget(
          sourcePath,
          callbacks.current.files,
          isFolder,
        );
        const draft =
          drafts.current.get(sourcePath) ??
          drafts.current.get(`${sourcePath}/`);
        const error =
          draft?.kind === "file"
            ? callbacks.current.onCreateFile(null, destinationPath)
            : draft?.kind === "folder"
              ? callbacks.current.onCreateFolder(null, destinationPath)
              : target
                ? callbacks.current.onRename(target, destinationPath)
                : "The item no longer exists";
        drafts.current.delete(sourcePath);
        drafts.current.delete(`${sourcePath}/`);
        if (error) {
          setActionError(error);
          // Pierre applies its local rename after this callback returns.
          queueMicrotask(() => resetTreePaths(pathsRef.current));
        }
      },
      onError: (error) => setActionError(error),
    },
  });

  modelRef.current = model;
  const wrapperRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (pathsSignatureRef.current !== pathsSignature) {
      resetTreePaths([...paths, ...drafts.current.keys()]);
      pathsSignatureRef.current = pathsSignature;
    }
    pathsRef.current = paths;
  }, [foldersSignature, model, pathsSignature]);

  useEffect(() => {
    for (const path of folderAncestors(selectedPath)) {
      const directory = model.getItem(`${path}/`);
      if (directory && "expand" in directory && !directory.isExpanded())
        directory.expand();
    }
  }, [model, selectedPath]);

  useEffect(() => {
    const selected = model.getSelectedPaths();
    if (selectedPath && selectedPath === lastTreeSelectionPathRef.current) {
      lastTreeSelectionPathRef.current = null;
      return;
    }
    lastTreeSelectionPathRef.current = null;
    for (const path of selected) {
      model.getItem(path)?.deselect();
    }
    if (selectedPath) model.getItem(selectedPath)?.select();
  }, [model, pathsSignature, selectedPath]);

  const commitDraftEdit = (value: string | null, sourcePath: string) => {
    const edit = resolvePierreDraftEdit(drafts.current, sourcePath, value);
    if (!edit) return false;
    const { kind, destinationPath, draftKey } = edit;
    const error =
      kind === "file"
        ? callbacks.current.onCreateFile(null, destinationPath)
        : callbacks.current.onCreateFolder(null, destinationPath);
    if (error) {
      setActionError(error);
      return false;
    }
    drafts.current.delete(draftKey);
    model.remove(draftKey, kind === "folder" ? { recursive: true } : undefined);
    return true;
  };

  const commitPathRename = (value: string, sourcePath: string) => {
    const source = sourcePath.replace(/\/$/, "");
    const target = getPierreTarget(sourcePath, callbacks.current.files);
    const destination = value.trim();
    if (!target || source === destination) return;
    const error = callbacks.current.onRename(target, destination);
    if (error) {
      setActionError(error);
      return;
    }
    model.remove(
      sourcePath,
      target.type === "folder" ? { recursive: true } : undefined,
    );
  };

  const { finishActiveEdit } = usePierreFileTreeDom({
    wrapperRef,
    model,
    label,
    t,
    drafts,
    commitDraftEdit,
    commitPathRename,
    onRootContext: setRootContext,
  });

  const startDraftCreation = (
    action: "new-file" | "new-folder",
    parent: string,
  ) => {
    const pendingPaths = [...drafts.current.keys()];
    if (!finishActiveEdit()) return false;
    const { path: draftPath, ...draft } = createPierreDraft(
      action,
      parent,
      [...paths, ...pendingPaths],
      (path) => Boolean(model.getItem(path)),
    );
    drafts.current.set(draftPath, draft);
    model.add(draftPath);
    const started = model.startRenaming(draftPath);
    if (!started) {
      drafts.current.delete(draftPath);
      model.remove(
        draftPath,
        action === "new-folder" ? { recursive: true } : undefined,
      );
      setActionError("The new item could not be edited");
      return false;
    }
    return true;
  };

  const deletePath = deletePrompt
    ? deletePrompt.target.type === "file"
      ? deletePrompt.target.file.path
      : deletePrompt.target.path
    : "";
  const deleteFolderPath =
    deletePrompt?.target.type === "folder" ? deletePrompt.target.path : null;
  const deleteCount = deleteFolderPath
    ? files.filter((file) => file.path.startsWith(`${deleteFolderPath}/`))
        .length
    : 0;
  return {
    wrapperRef,
    model,
    theme,
    t,
    callbacks,
    startingRenameRef,
    startDraftCreation,
    searchOpen,
    setDeleteError,
    setDeletePrompt,
    rootContext,
    actionError,
    deletePrompt,
    deleteError,
    deletePath,
    deleteCount,
  };
}
