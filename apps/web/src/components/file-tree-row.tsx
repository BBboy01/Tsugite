import { ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import type { ProjectSettings } from "@iris/shared";

import type { VisibleFileTreeRow } from "../lib/file-tree-model";
import { FileTypeIcon, FolderTypeIcon } from "../lib/file-icon";
import type {
  FileTreeContextTarget,
  FileTreeDeleteTarget,
  InlineEditState,
} from "./file-tree.types";
import { countFiles, DeletePopover, InlineTreeInput } from "./file-tree-inline-controls";

type FileTreeRowProps = {
  row: VisibleFileTreeRow;
  theme: ProjectSettings["theme"];
  selectedPath: string;
  collapsedFolders: ReadonlySet<string>;
  contextTarget: FileTreeContextTarget | null;
  inlineEdit: InlineEditState | null;
  deleteTarget: FileTreeDeleteTarget | null;
  activeKey: string;
  onFocusKey: (key: string) => void;
  onSelect: (path: string) => void;
  onToggleFolder: (path: string) => void;
  onInlineChange: (value: string) => void;
  onInlineSubmit: () => void;
  onInlineCancel: () => void;
  onDeleteConfirm: () => void;
  onDeleteCancel: () => void;
};

export function FileTreeRow({
  row,
  theme,
  selectedPath,
  collapsedFolders,
  contextTarget,
  inlineEdit,
  deleteTarget,
  activeKey,
  onFocusKey,
  onSelect,
  onToggleFolder,
  onInlineChange,
  onInlineSubmit,
  onInlineCancel,
  onDeleteConfirm,
  onDeleteCancel,
}: FileTreeRowProps) {
  const { t } = useTranslation();
  if (row.kind === "create") {
    return (
      <InlineTreeInput
        value={inlineEdit?.value ?? ""}
        error={inlineEdit?.error}
        onChange={onInlineChange}
        onSubmit={onInlineSubmit}
        onCancel={onInlineCancel}
      />
    );
  }

  const paddingLeft = `${6 + row.depth * 14}px`;
  if (row.kind === "folder") {
    const node = row.node;
    const collapsed = collapsedFolders.has(node.path);
    const contextSelected = contextTarget?.type === "folder" && contextTarget.path === node.path;
    const editing =
      inlineEdit?.mode === "rename-folder" &&
      inlineEdit.target?.type === "folder" &&
      inlineEdit.target.path === node.path;
    const deleting = deleteTarget?.type === "folder" && deleteTarget.path === node.path;
    return (
      <div
        role="treeitem"
        aria-label={`${node.path} ${t("files.folder")}`}
        aria-level={row.depth + 1}
        aria-posinset={row.positionInSet}
        aria-setsize={row.setSize}
        aria-selected={false}
        aria-expanded={node.children.length > 0 ? !collapsed : undefined}
        tabIndex={activeKey === row.key ? 0 : -1}
        data-row-key={row.key}
        data-context-kind="folder"
        data-context-path={node.path}
        onFocus={(event) => {
          if (event.currentTarget.contains(event.target)) onFocusKey(row.key);
        }}
        onClick={(event) => {
          if (!event.currentTarget.contains(event.target as Node)) return;
          if (event.target instanceof HTMLInputElement || editing) return;
          if (node.children.length > 0) onToggleFolder(node.path);
        }}
        className={`group relative flex min-h-8 items-center rounded-lg pr-1.5 hover:bg-[color-mix(in_srgb,var(--glass-popover)_82%,var(--ink-strong)_18%)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-iris-accent ${contextSelected ? "outline outline-1 outline-offset-[-1px] outline-[color-mix(in_srgb,var(--accent)_52%,transparent)]" : ""}`}
        style={{ paddingLeft }}
      >
        {editing && inlineEdit ? (
          <InlineTreeInput
            value={inlineEdit.value}
            error={inlineEdit.error}
            onChange={onInlineChange}
            onSubmit={onInlineSubmit}
            onCancel={onInlineCancel}
          />
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-[7px] py-1.5 font-iris-mono text-xs leading-tight text-iris-muted">
            <motion.span
              animate={{ rotate: collapsed ? 0 : 90 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              className="grid shrink-0 place-items-center"
            >
              <ChevronRight width="13" height="13" aria-hidden="true" />
            </motion.span>
            <FolderTypeIcon path={node.path} width="15" height="15" />
            <span className="min-w-0 truncate text-[var(--text-dimmed)] transition-none">
              {node.name}
            </span>
          </div>
        )}
        {deleting && (
          <DeletePopover
            theme={theme}
            anchorRect={deleteTarget.anchorRect}
            path={node.path}
            count={countFiles(node.children)}
            isFolder
            onConfirm={onDeleteConfirm}
            onCancel={onDeleteCancel}
          />
        )}
      </div>
    );
  }

  const node = row.node;
  const selected = node.file.path === selectedPath;
  const contextSelected = contextTarget?.type === "file" && contextTarget.id === node.file.id;
  const editing =
    inlineEdit?.mode === "rename-file" &&
    inlineEdit.target?.type === "file" &&
    inlineEdit.target.file.id === node.file.id;
  const deleting = deleteTarget?.type === "file" && deleteTarget.file.id === node.file.id;
  return (
    <div
      role="treeitem"
      aria-level={row.depth + 1}
      aria-posinset={row.positionInSet}
      aria-setsize={row.setSize}
      aria-selected={selected}
      tabIndex={activeKey === row.key ? 0 : -1}
      data-row-key={row.key}
      className={`group relative my-px flex min-h-7 items-center gap-[7px] rounded-lg pr-[6px] font-iris-mono text-xs leading-tight focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-iris-accent ${selected ? "bg-[color-mix(in_srgb,var(--glass-popover)_84%,var(--ink-strong)_16%)] text-iris-strong shadow-[0_1px_2px_rgba(67,72,50,0.05)]" : "text-iris-muted hover:bg-[color-mix(in_srgb,var(--glass-popover)_82%,var(--ink-strong)_18%)]"} ${contextSelected ? "outline outline-1 outline-offset-[-1px] outline-[color-mix(in_srgb,var(--accent)_52%,transparent)]" : ""}`}
      data-context-id={node.file.id}
      data-context-kind="file"
      data-context-path={node.file.path}
      style={{ paddingLeft }}
      onFocus={(event) => {
        if (event.currentTarget.contains(event.target)) onFocusKey(row.key);
      }}
      onClick={(event) => {
        if (!event.currentTarget.contains(event.target as Node)) return;
        if (!(event.target instanceof HTMLInputElement) && !editing) onSelect(node.file.path);
      }}
    >
      {editing && inlineEdit ? (
        <InlineTreeInput
          value={inlineEdit.value}
          error={inlineEdit.error}
          onChange={onInlineChange}
          onSubmit={onInlineSubmit}
          onCancel={onInlineCancel}
        />
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-[7px] overflow-hidden py-[7px] text-inherit">
          <FileTypeIcon path={node.file.path} width="14" height="14" />
          <span
            className={`truncate text-[10px] transition-none ${selected ? "" : "text-[var(--text-dimmed)]"}`}
          >
            {node.name}
          </span>
        </div>
      )}
      {deleting && (
        <DeletePopover
          theme={theme}
          anchorRect={deleteTarget.anchorRect}
          path={node.file.path}
          count={0}
          isFolder={false}
          onConfirm={onDeleteConfirm}
          onCancel={onDeleteCancel}
        />
      )}
    </div>
  );
}
