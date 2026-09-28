import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { ProjectSettings } from "@iris/shared";

import {
  flattenVisibleFileTree,
  folderAncestors,
  type FileTreeNode,
  type VisibleFileTreeRow,
} from "../lib/file-tree-model";
import { FileTreeRow } from "./file-tree-row";
import type {
  FileTreeContextTarget,
  FileTreeDeleteTarget,
  InlineEditState,
} from "./file-tree.types";

type FileTreeNodesProps = {
  theme: ProjectSettings["theme"];
  nodes: FileTreeNode[];
  selectedPath: string;
  collapsedFolders: ReadonlySet<string>;
  contextTarget: FileTreeContextTarget | null;
  inlineEdit: InlineEditState | null;
  deleteTarget: FileTreeDeleteTarget | null;
  label: string;
  onSelect: (path: string) => void;
  onToggleFolder: (path: string) => void;
  onInlineChange: (value: string) => void;
  onInlineSubmit: () => void;
  onInlineCancel: () => void;
  onDeleteConfirm: () => void;
  onDeleteCancel: () => void;
};

export function FileTreeNodes({
  theme,
  nodes,
  selectedPath,
  collapsedFolders,
  contextTarget,
  inlineEdit,
  deleteTarget,
  label,
  onSelect,
  onToggleFolder,
  onInlineChange,
  onInlineSubmit,
  onInlineCancel,
  onDeleteConfirm,
  onDeleteCancel,
}: FileTreeNodesProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingFocusKey = useRef<string | null>(null);
  const typeahead = useRef({ value: "", timer: 0 });
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const createDirectory = inlineEdit?.mode.startsWith("create") ? inlineEdit.directory : undefined;
  const rows = useMemo(
    () => flattenVisibleFileTree(nodes, collapsedFolders, createDirectory),
    [nodes, collapsedFolders, createDirectory],
  );
  const rowIndexes = useMemo(() => {
    const byKey = new Map<string, number>();
    const byFileId = new Map<string, number>();
    rows.forEach((row, index) => {
      byKey.set(row.key, index);
      if (row.kind === "file") byFileId.set(row.node.file.id, index);
    });
    return { byKey, byFileId };
  }, [rows]);
  const activeKey =
    focusedKey && rowIndexes.byKey.has(focusedKey)
      ? focusedKey
      : rowIndexes.byKey.has(selectedPath)
        ? selectedPath
        : (rows.find((row) => row.kind !== "create")?.key ?? "");
  useEffect(() => () => window.clearTimeout(typeahead.current.timer), []);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (rows[index]?.kind === "file" ? 30 : 32),
    getItemKey: (index) => rows[index]?.key ?? index,
    overscan: 8,
    useFlushSync: false,
    rangeExtractor: (range) => {
      const indexes = defaultRangeExtractor(range);
      const contextIndex =
        contextTarget?.type === "file"
          ? rowIndexes.byFileId.get(contextTarget.id)
          : contextTarget?.type === "folder"
            ? rowIndexes.byKey.get(contextTarget.path)
            : undefined;
      const pinnedIndexes = [
        rowIndexes.byKey.get(activeKey),
        inlineEdit?.mode.startsWith("create")
          ? rowIndexes.byKey.get(`create:${inlineEdit.directory}`)
          : undefined,
        inlineEdit?.target?.type === "file"
          ? rowIndexes.byKey.get(inlineEdit.target.file.path)
          : inlineEdit?.target?.type === "folder"
            ? rowIndexes.byKey.get(inlineEdit.target.path)
            : undefined,
        contextIndex,
        deleteTarget?.type === "file"
          ? rowIndexes.byKey.get(deleteTarget.file.path)
          : deleteTarget?.path
            ? rowIndexes.byKey.get(deleteTarget.path)
            : undefined,
      ];
      for (const index of pinnedIndexes) {
        if (index !== undefined && !indexes.includes(index)) indexes.push(index);
      }
      return indexes.toSorted((left, right) => left - right);
    },
  });
  const virtualItems = virtualizer.getVirtualItems();

  useLayoutEffect(() => {
    const key = pendingFocusKey.current;
    if (!key) return;
    const target = Array.from(
      scrollRef.current?.querySelectorAll<HTMLElement>("[data-row-key]") ?? [],
    ).find((element) => element.dataset.rowKey === key);
    if (!target) return;
    pendingFocusKey.current = null;
    target.focus({ preventScroll: true });
  }, [virtualItems, focusedKey]);

  const focusRow = (index: number) => {
    const row = rows[index];
    if (!row || row.kind === "create") return;
    pendingFocusKey.current = row.key;
    setFocusedKey(row.key);
    virtualizer.scrollToIndex(index, { align: "auto" });
  };

  const findNavigableIndex = (start: number, direction: 1 | -1) => {
    for (let index = start; index >= 0 && index < rows.length; index += direction) {
      if (rows[index]?.kind !== "create") return index;
    }
    return undefined;
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      !event.currentTarget.contains(event.target as Node) ||
      event.target instanceof HTMLInputElement ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    ) {
      return;
    }
    const key = (event.target as HTMLElement).dataset.rowKey;
    const index = rowIndexes.byKey.get(key ?? "") ?? -1;
    if (index < 0) return;
    const row = rows[index];
    if (!row || row.kind === "create") return;
    let nextIndex: number | undefined;
    switch (event.key) {
      case "ArrowDown":
        nextIndex = findNavigableIndex(index + 1, 1);
        break;
      case "ArrowUp":
        nextIndex = findNavigableIndex(index - 1, -1);
        break;
      case "Home":
        nextIndex = findNavigableIndex(0, 1);
        break;
      case "End":
        nextIndex = findNavigableIndex(rows.length - 1, -1);
        break;
      case "ArrowRight":
        if (
          row.kind === "folder" &&
          row.node.children.length > 0 &&
          collapsedFolders.has(row.node.path)
        ) {
          onToggleFolder(row.node.path);
        } else if (rows[index + 1]?.depth === row.depth + 1) {
          nextIndex = findNavigableIndex(index + 1, 1);
        }
        break;
      case "ArrowLeft":
        if (
          row.kind === "folder" &&
          row.node.children.length > 0 &&
          !collapsedFolders.has(row.node.path)
        ) {
          onToggleFolder(row.node.path);
        } else {
          const parentPath = folderAncestors(row.key).at(-1);
          if (parentPath) nextIndex = rowIndexes.byKey.get(parentPath);
        }
        break;
      case "Enter":
      case " ":
        if (row.kind === "folder") {
          if (row.node.children.length > 0) onToggleFolder(row.node.path);
        } else {
          onSelect(row.node.file.path);
        }
        break;
      default:
        if (event.key.length !== 1 || event.key === " ") {
          return;
        }
        typeahead.current.value += event.key.toLocaleLowerCase();
        window.clearTimeout(typeahead.current.timer);
        typeahead.current.timer = window.setTimeout(() => {
          typeahead.current.value = "";
        }, 500);
        for (let offset = 1; offset <= rows.length; offset += 1) {
          const candidateIndex = (index + offset) % rows.length;
          const candidate = rows[candidateIndex];
          const name = getRowName(candidate);
          if (name.toLocaleLowerCase().startsWith(typeahead.current.value)) {
            nextIndex = candidateIndex;
            break;
          }
        }
        if (nextIndex === undefined) {
          typeahead.current.value = event.key.toLocaleLowerCase();
          for (let offset = 1; offset <= rows.length; offset += 1) {
            const candidateIndex = (index + offset) % rows.length;
            const candidate = rows[candidateIndex];
            const name = getRowName(candidate);
            if (name.toLocaleLowerCase().startsWith(typeahead.current.value)) {
              nextIndex = candidateIndex;
              break;
            }
          }
        }
        if (nextIndex === undefined) return;
    }
    event.preventDefault();
    if (nextIndex !== undefined) focusRow(nextIndex);
  };

  const renderRow = (row: VisibleFileTreeRow) => (
    <FileTreeRow
      row={row}
      theme={theme}
      selectedPath={selectedPath}
      collapsedFolders={collapsedFolders}
      contextTarget={contextTarget}
      inlineEdit={inlineEdit}
      deleteTarget={deleteTarget}
      activeKey={activeKey}
      onFocusKey={setFocusedKey}
      onSelect={onSelect}
      onToggleFolder={onToggleFolder}
      onInlineChange={onInlineChange}
      onInlineSubmit={onInlineSubmit}
      onInlineCancel={onInlineCancel}
      onDeleteConfirm={onDeleteConfirm}
      onDeleteCancel={onDeleteCancel}
    />
  );

  return (
    <div
      ref={scrollRef}
      role="tree"
      aria-label={label}
      data-total-rows={rows.length}
      className="min-h-0 flex-1 overflow-auto px-2.5 pb-5 pt-1"
      onKeyDown={handleKeyDown}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusedKey(null);
      }}
    >
      <div style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}>
        {virtualItems.map((item) => {
          const row = rows[item.index];
          if (!row) return null;
          return (
            <div
              key={item.key}
              ref={virtualizer.measureElement}
              data-index={item.index}
              role="presentation"
              className="absolute left-0 top-0 w-full"
              style={{ transform: `translateY(${item.start}px)` }}
            >
              {renderRow(row)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getRowName(row: VisibleFileTreeRow | undefined): string {
  return row?.kind === "folder" || row?.kind === "file" ? row.node.name : "";
}
