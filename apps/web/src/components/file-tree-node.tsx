import { ChevronRightIcon } from "@radix-ui/react-icons";
import { AnimatePresence, motion } from "motion/react";
import { useTranslation } from "react-i18next";

import type { FileTreeNode } from "../lib/file-tree-model";
import { FileTypeIcon, FolderTypeIcon } from "../lib/file-icon";

type FileTreeContextTarget = { type: "file"; id: string } | { type: "folder"; path: string };

type FileTreeNodesProps = {
  nodes: FileTreeNode[];
  depth?: number;
  selectedPath: string;
  collapsedFolders: ReadonlySet<string>;
  contextTarget: FileTreeContextTarget | null;
  onSelect: (path: string) => void;
  onToggleFolder: (path: string) => void;
};

export function FileTreeNodes({
  nodes,
  depth = 0,
  selectedPath,
  collapsedFolders,
  contextTarget,
  onSelect,
  onToggleFolder,
}: FileTreeNodesProps) {
  const { t } = useTranslation();
  return nodes.map((node) => {
    const paddingLeft = `${6 + depth * 14}px`;
    if (node.kind === "folder") {
      const collapsed = collapsedFolders.has(node.path);
      const contextSelected = contextTarget?.type === "folder" && contextTarget.path === node.path;
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
                <ChevronRightIcon width="13" height="13" aria-hidden="true" />
              </motion.span>
              <FolderTypeIcon path={node.path} width="15" height="15" />
              <span className="min-w-0 truncate transition-none group-hover:text-iris-strong">
                {node.name}
              </span>
            </motion.button>
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
                  nodes={node.children}
                  depth={depth + 1}
                  selectedPath={selectedPath}
                  collapsedFolders={collapsedFolders}
                  contextTarget={contextTarget}
                  onSelect={onSelect}
                  onToggleFolder={onToggleFolder}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      );
    }

    const contextSelected = contextTarget?.type === "file" && contextTarget.id === node.file.id;
    return (
      <motion.div
        className={`group my-px flex min-h-8 items-center gap-[7px] rounded-lg pr-[6px] font-iris-mono text-xs leading-tight ${node.file.path === selectedPath ? "bg-[color-mix(in_srgb,var(--glass-popover)_84%,var(--ink-strong)_16%)] text-iris-strong shadow-[0_1px_2px_rgba(67,72,50,0.05)]" : "text-iris-muted hover:bg-[color-mix(in_srgb,var(--glass-popover)_82%,var(--ink-strong)_18%)]"} ${contextSelected ? "outline outline-1 outline-offset-[-1px] outline-[color-mix(in_srgb,var(--accent)_52%,transparent)]" : ""}`}
        data-context-id={node.file.id}
        data-context-kind="file"
        key={node.file.id}
        style={{ paddingLeft }}
        initial={{ opacity: 0, y: -3 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.16, ease: "easeOut" }}
      >
        <motion.button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-[7px] overflow-hidden border-0 bg-transparent py-[7px] text-left text-inherit focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-iris-accent"
          onClick={() => onSelect(node.file.path)}
        >
          <FileTypeIcon path={node.file.path} width="14" height="14" />
          <span className="truncate transition-none group-hover:text-iris-strong">{node.name}</span>
        </motion.button>
      </motion.div>
    );
  });
}
