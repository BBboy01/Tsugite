import { ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslation } from "react-i18next";
import type { ProjectSettings } from "@iris/shared";

import type { FileTreeNode } from "../lib/file-tree-model";
import { FileTypeIcon, FolderTypeIcon } from "../lib/file-icon";
import type { InlineEditMode } from "../lib/file-tree-edit-model";
import type { FileTreeDeleteTarget, FileTreeTarget } from "./file-tree";
import { countFiles, DeletePopover, InlineTreeInput } from "./file-tree-inline-controls";

type FileTreeContextTarget = { type: "file"; id: string } | { type: "folder"; path: string };

export type InlineEditState = {
  mode: InlineEditMode;
  target: FileTreeTarget;
  directory: string;
  value: string;
  error?: string;
};

type FileTreeNodesProps = {
  theme: ProjectSettings["theme"];
  nodes: FileTreeNode[];
  depth?: number;
  parentPath?: string;
  selectedPath: string;
  collapsedFolders: ReadonlySet<string>;
  contextTarget: FileTreeContextTarget | null;
  inlineEdit: InlineEditState | null;
  deleteTarget: FileTreeDeleteTarget | null;
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
  depth = 0,
  parentPath = "",
  selectedPath,
  collapsedFolders,
  contextTarget,
  inlineEdit,
  deleteTarget,
  onSelect,
  onToggleFolder,
  onInlineChange,
  onInlineSubmit,
  onInlineCancel,
  onDeleteConfirm,
  onDeleteCancel,
}: FileTreeNodesProps) {
  const { t } = useTranslation();
  const createInput =
    inlineEdit?.mode.startsWith("create") && inlineEdit.directory === parentPath ? (
      <InlineTreeInput
        key="inline-create"
        value={inlineEdit.value}
        error={inlineEdit.error}
        onChange={onInlineChange}
        onSubmit={onInlineSubmit}
        onCancel={onInlineCancel}
      />
    ) : null;

  const renderedNodes = nodes.map((node) => {
    const paddingLeft = `${6 + depth * 14}px`;
    if (node.kind === "folder") {
      const collapsed = collapsedFolders.has(node.path);
      const contextSelected = contextTarget?.type === "folder" && contextTarget.path === node.path;
      const editing =
        inlineEdit?.mode === "rename-folder" &&
        inlineEdit.target?.type === "folder" &&
        inlineEdit.target.path === node.path;
      const deleting = deleteTarget?.type === "folder" && deleteTarget.path === node.path;
      return (
        <motion.div
          key={node.path}
          initial={{ opacity: 0, y: -3 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
        >
          <div
            className={`group relative flex min-h-8 items-center rounded-lg pr-1.5 hover:bg-[color-mix(in_srgb,var(--glass-popover)_82%,var(--ink-strong)_18%)] ${contextSelected ? "outline outline-1 outline-offset-[-1px] outline-[color-mix(in_srgb,var(--accent)_52%,transparent)]" : ""}`}
            style={{ paddingLeft }}
          >
            {editing ? (
              <InlineTreeInput
                value={inlineEdit.value}
                error={inlineEdit.error}
                onChange={onInlineChange}
                onSubmit={onInlineSubmit}
                onCancel={onInlineCancel}
              />
            ) : (
              <motion.button
                type="button"
                aria-expanded={!collapsed}
                aria-label={`${node.path} ${t("files.folder")}`}
                className="flex min-w-0 flex-1 items-center gap-[7px] rounded-lg border-0 bg-transparent py-1.5 text-left font-iris-mono text-xs leading-tight text-iris-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-iris-accent"
                data-context-kind="folder"
                data-context-path={node.path}
                onClick={() => onToggleFolder(node.path)}
              >
                <motion.span
                  animate={{ rotate: collapsed ? 0 : 90 }}
                  transition={{ duration: 0.16, ease: "easeOut" }}
                  className="grid shrink-0 place-items-center"
                >
                  <ChevronRight width="13" height="13" aria-hidden="true" />
                </motion.span>
                <FolderTypeIcon path={node.path} width="15" height="15" />
                <span className="min-w-0 truncate text-[color-mix(in_srgb,var(--muted)_45%,transparent)] transition-none">
                  {node.name}
                </span>
              </motion.button>
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
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.div
                key={`${node.path}-children`}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <FileTreeNodes
                  theme={theme}
                  nodes={node.children}
                  depth={depth + 1}
                  parentPath={node.path}
                  selectedPath={selectedPath}
                  collapsedFolders={collapsedFolders}
                  contextTarget={contextTarget}
                  inlineEdit={inlineEdit}
                  deleteTarget={deleteTarget}
                  onSelect={onSelect}
                  onToggleFolder={onToggleFolder}
                  onInlineChange={onInlineChange}
                  onInlineSubmit={onInlineSubmit}
                  onInlineCancel={onInlineCancel}
                  onDeleteConfirm={onDeleteConfirm}
                  onDeleteCancel={onDeleteCancel}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      );
    }

    const contextSelected = contextTarget?.type === "file" && contextTarget.id === node.file.id;
    const editing =
      inlineEdit?.mode === "rename-file" &&
      inlineEdit.target?.type === "file" &&
      inlineEdit.target.file.id === node.file.id;
    const deleting = deleteTarget?.type === "file" && deleteTarget.file.id === node.file.id;
    return (
      <motion.div
        className={`group relative my-px flex min-h-7 items-center gap-[7px] rounded-lg pr-[6px] font-iris-mono text-xs leading-tight ${node.file.path === selectedPath ? "bg-[color-mix(in_srgb,var(--glass-popover)_84%,var(--ink-strong)_16%)] text-iris-strong shadow-[0_1px_2px_rgba(67,72,50,0.05)]" : "text-iris-muted hover:bg-[color-mix(in_srgb,var(--glass-popover)_82%,var(--ink-strong)_18%)]"} ${contextSelected ? "outline outline-1 outline-offset-[-1px] outline-[color-mix(in_srgb,var(--accent)_52%,transparent)]" : ""}`}
        data-context-id={node.file.id}
        data-context-kind="file"
        key={node.file.id}
        style={{ paddingLeft }}
        initial={{ opacity: 0, y: -3 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.16, ease: "easeOut" }}
      >
        {editing ? (
          <InlineTreeInput
            value={inlineEdit.value}
            error={inlineEdit.error}
            onChange={onInlineChange}
            onSubmit={onInlineSubmit}
            onCancel={onInlineCancel}
          />
        ) : (
          <motion.button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-[7px] overflow-hidden border-0 bg-transparent py-[7px] text-left text-inherit focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-iris-accent"
            onClick={() => onSelect(node.file.path)}
          >
            <FileTypeIcon path={node.file.path} width="14" height="14" />
            <span
              className={`truncate text-[10px] transition-none ${node.file.path === selectedPath ? "" : "text-[color-mix(in_srgb,var(--muted)_45%,transparent)]"}`}
            >
              {node.name}
            </span>
          </motion.button>
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
      </motion.div>
    );
  });
  return createInput ? [createInput, ...renderedNodes] : renderedNodes;
}
