import { useFileTree } from "@pierre/trees/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ProjectFile, ProjectSettings } from "@iris/shared";
import type { ContextMenuOpenContext } from "@pierre/trees";
import { useTranslation } from "react-i18next";
import { folderAncestors, type FileTreeTarget } from "../lib/file-tree-model";
import { toPierreTreePaths } from "../lib/pierre-tree-paths";
import { uniqueDraftName } from "./pierre-file-tree-context-actions";
import { usePierreFileTreeDom } from "./use-pierre-file-tree-dom";

export type PierreFileTreeProps = {
  files: ProjectFile[];
  folders: string[];
  selectedPath: string;
  theme: ProjectSettings["theme"];
  label: string;
  onSelect: (path: string) => void;
  onMove: (sourcePaths: readonly string[], targetDirectory: string) => string | undefined;
  onCreateFile: (target: FileTreeTarget, path: string) => string | undefined;
  onCreateFolder: (target: FileTreeTarget, path: string) => string | undefined;
  onRename: (target: Exclude<FileTreeTarget, null>, path: string) => string | undefined;
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
  const pendingSearchRestoreRef = useRef<string | null>(null);
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
  const drafts = useRef(new Map<string, { kind: "file" | "folder"; defaultName: string }>());
  const [deletePrompt, setDeletePrompt] = useState<{
    target: Exclude<FileTreeTarget, null>;
    anchorRect: DOMRect;
  } | null>(null);
  const [deleteError, setDeleteError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [rootContext, setRootContext] = useState<ContextMenuOpenContext | null>(null);
  const modelRef = useRef<ReturnType<typeof useFileTree>["model"] | null>(null);
  const resetTreePaths = (nextPaths: string[]) => {
    const currentPaths = pathsRef.current;
    const currentDirectories = currentPaths.filter((path) => path.endsWith("/"));
    const expandedPaths = currentDirectories.filter((path) => {
      const item = modelRef.current?.getItem(path);
      return item && "isExpanded" in item && item.isExpanded();
    });
    const newDirectories = nextPaths.filter(
      (path) => path.endsWith("/") && !currentPaths.includes(path),
    );
    modelRef.current?.resetPaths(nextPaths, {
      initialExpandedPaths: [
        ...expandedPaths.filter((path) => nextPaths.includes(path)),
        ...newDirectories,
      ],
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
    unsafeCSS: `
      [data-file-tree-search-container][data-open="false"] { display: none; }
      [data-file-tree-search-container] { block-size: 26px; flex-shrink: 0; margin-bottom: 8px; }
      [data-file-tree-search-input] { box-sizing: border-box; height: 26px; line-height: 24px; font-size: 11px; }
      [role="tree"]:has([data-file-tree-search-input]:focus:placeholder-shown)
        [data-item-focused="true"]:not(:focus-visible)::before { outline: none; }
    `,
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
      canDrop: ({ draggedPaths, target }) => {
        const destination = target.directoryPath?.replace(/\/$/, "") ?? "";
        return draggedPaths.every((path) => {
          const source = path.replace(/\/$/, "");
          return (
            source !== "package.json" &&
            source !== destination &&
            !destination.startsWith(`${source}/`)
          );
        });
      },
      onDropComplete: ({ draggedPaths, target }) => {
        const error = callbacks.current.onMove(draggedPaths, target.directoryPath ?? "");
        if (error) {
          resetTreePaths(pathsRef.current);
          setActionError(error);
        }
      },
      onDropError: (_error, { draggedPaths, target }) => {
        const error = callbacks.current.onMove(draggedPaths, target.directoryPath ?? "");
        resetTreePaths(pathsRef.current);
        setActionError(error);
      },
    },
    renaming: {
      canRename: ({ path }) => path !== "package.json",
      onRename: ({ sourcePath, destinationPath, isFolder }) => {
        const source = sourcePath.replace(/\/$/, "");
        const target: FileTreeTarget = isFolder
          ? { type: "folder", path: source }
          : (() => {
              const file = callbacks.current.files.find((candidate) => candidate.path === source);
              return file ? { type: "file", file } : null;
            })();
        const draft = drafts.current.get(sourcePath) ?? drafts.current.get(`${sourcePath}/`);
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
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const openRootMenu = (event: MouseEvent) => {
      if (event.button !== 2) return;
      const path = event.composedPath();
      const treeHost = model.getFileTreeContainer();
      if (!treeHost || !path.includes(treeHost)) return;
      if (path.some((target) => target instanceof Element && target.closest('[role="treeitem"]')))
        return;
      if (path.some((target) => target instanceof Element && target.closest('[role="search"]')))
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setRootContext({
        anchorElement: wrapper,
        anchorRect: {
          left: event.clientX,
          top: event.clientY,
          right: event.clientX,
          bottom: event.clientY,
          width: 0,
          height: 0,
          x: event.clientX,
          y: event.clientY,
        },
        close: () => setRootContext(null),
        restoreFocus: () => wrapper.focus(),
      });
    };
    wrapper.addEventListener("contextmenu", openRootMenu, true);
    return () => wrapper.removeEventListener("contextmenu", openRootMenu, true);
  }, [model]);

  useEffect(() => {
    for (const path of folderAncestors(selectedPath)) {
      const directory = model.getItem(`${path}/`);
      if (directory && "expand" in directory && !directory.isExpanded()) directory.expand();
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

  const commitDraftEdit = (input: HTMLInputElement | null, sourcePath: string) => {
    const normalizedSourcePath = sourcePath.replace(/\/$/, "");
    const draftKey = drafts.current.has(sourcePath)
      ? sourcePath
      : drafts.current.has(normalizedSourcePath)
        ? normalizedSourcePath
        : `${normalizedSourcePath}/`;
    const draft = drafts.current.get(draftKey);
    if (!draft) return false;
    const source = sourcePath.replace(/\/$/, "");
    const parent = source.split("/").slice(0, -1).join("/");
    const value = (input?.value.trim() || draft.defaultName).replace(/^\/+|\/+$/g, "");
    if (!value) return false;
    const destinationPath =
      parent && !value.startsWith(`${parent}/`) ? `${parent}/${value}` : value;
    const error =
      draft.kind === "file"
        ? callbacks.current.onCreateFile(null, destinationPath)
        : callbacks.current.onCreateFolder(null, destinationPath);
    if (error) {
      setActionError(error);
      return false;
    }
    drafts.current.delete(draftKey);
    model.remove(draftKey, draft.kind === "folder" ? { recursive: true } : undefined);
    return true;
  };

  const commitPathRename = (input: HTMLInputElement, sourcePath: string) => {
    const source = sourcePath.replace(/\/$/, "");
    const file = callbacks.current.files.find((candidate) => candidate.path === source);
    const target: FileTreeTarget = sourcePath.endsWith("/")
      ? { type: "folder", path: source }
      : file
        ? { type: "file", file }
        : null;
    const destination = input.value.trim();
    if (!target || source === destination) return;
    const error = callbacks.current.onRename(target, destination);
    if (error) {
      setActionError(error);
      return;
    }
    model.remove(sourcePath, target.type === "folder" ? { recursive: true } : undefined);
  };

  const findInlineRenameInput = () => {
    const visit = (root: Document | ShadowRoot | Element): HTMLInputElement | null => {
      const input = root.querySelector<HTMLInputElement>("[data-item-rename-input]");
      if (input) return input;
      for (const element of root.querySelectorAll<HTMLElement>("*")) {
        if (element.shadowRoot) {
          const nestedInput = visit(element.shadowRoot);
          if (nestedInput) return nestedInput;
        }
      }
      return null;
    };
    const container = model.getFileTreeContainer();
    return container ? visit(container) : null;
  };

  const finishActiveEdit = () => {
    const input = findInlineRenameInput();
    const path =
      input?.closest<HTMLElement>("[data-item-path]")?.dataset.itemPath ??
      [...drafts.current.keys()][0];
    if (path && drafts.current.has(path) && commitDraftEdit(input, path)) return true;
    input?.blur();
    return true;
  };

  const startDraftCreation = (action: "new-file" | "new-folder", parent: string) => {
    const pendingPaths = [...drafts.current.keys()];
    if (!finishActiveEdit()) return false;
    const existingPaths = [...paths, ...pendingPaths];
    let base = uniqueDraftName(
      action === "new-file" ? "untitled" : "new-folder",
      "",
      parent,
      existingPaths,
    );
    while (
      model.getItem(`${parent ? `${parent}/` : ""}${base}${action === "new-folder" ? "/" : ""}`)
    ) {
      existingPaths.push(
        `${parent ? `${parent}/` : ""}${base}${action === "new-folder" ? "/" : ""}`,
      );
      base = uniqueDraftName(
        action === "new-file" ? "untitled" : "new-folder",
        "",
        parent,
        existingPaths,
      );
    }
    const draftPath = `${parent ? `${parent}/` : ""}${base}${action === "new-folder" ? "/" : ""}`;
    drafts.current.set(draftPath, {
      kind: action === "new-file" ? "file" : "folder",
      defaultName: base,
    });
    model.add(draftPath);
    const started = model.startRenaming(draftPath);
    if (!started) {
      drafts.current.delete(draftPath);
      model.remove(draftPath, action === "new-folder" ? { recursive: true } : undefined);
      setActionError("The new item could not be edited");
      return false;
    }
    return true;
  };

  usePierreFileTreeDom({
    wrapperRef,
    model,
    label,
    t,
    drafts,
    commitDraftEdit,
    commitPathRename,
    pendingSearchRestoreRef,
  });

  const deletePath = deletePrompt
    ? deletePrompt.target.type === "file"
      ? deletePrompt.target.file.path
      : deletePrompt.target.path
    : "";
  const deleteFolderPath = deletePrompt?.target.type === "folder" ? deletePrompt.target.path : null;
  const deleteCount = deleteFolderPath
    ? files.filter((file) => file.path.startsWith(`${deleteFolderPath}/`)).length
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
