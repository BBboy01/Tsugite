import * as ContextMenu from "@radix-ui/react-context-menu";
import { Copy, FilePlus2, Pencil, Plus, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";

import type { ProjectFile, ProjectSettings } from "@iris/shared";

import { buildFileTree, folderAncestors } from "../lib/file-tree-model";
import {
  getInlineEditDefaultValue,
  getInlineEditDirectory,
  resolveInlineEdit,
  type InlineEditMode,
} from "../lib/file-tree-edit-model";
import { CurrentUserCard } from "./current-user-card";
import { FileTreeNodes, type InlineEditState } from "./file-tree-node";
import { SettingsPopover } from "./settings-popover";
import type { KeyBinding } from "../lib/keymap";
import type { LanguageCode } from "../lib/i18n";

export type FileTreeTarget =
  | { type: "file"; file: ProjectFile }
  | { type: "folder"; path: string }
  | null;

export type FileTreeDeleteTarget = Exclude<FileTreeTarget, null> & { anchorRect: DOMRect };

type FileTreeProps = {
  files: ProjectFile[];
  folders: string[];
  selectedPath: string;
  onSelect: (path: string) => void;
  onCreateFile: (target: FileTreeTarget, path: string) => string | undefined;
  onCreateFolder: (target: FileTreeTarget, path: string) => string | undefined;
  onRename: (target: Exclude<FileTreeTarget, null>, path: string) => string | undefined;
  onCopy: (file: ProjectFile) => void;
  onDelete: (target: Exclude<FileTreeTarget, null>) => void;
  currentUser: {
    displayName: string;
    color: string;
  };
  onDisplayNameChange: (value: string) => boolean;
  onColorChange: (value: string) => boolean;
  settings: ProjectSettings;
  onSettingChange: <K extends keyof ProjectSettings>(key: K, value: ProjectSettings[K]) => void;
  vimMode: boolean;
  onVimModeChange: (enabled: boolean) => void;
  keymap: KeyBinding[];
  onKeymapChange: (bindings: KeyBinding[]) => void;
  onLanguageChange: (language: LanguageCode) => void;
};

export function FileTree({
  files,
  folders,
  selectedPath,
  onSelect,
  onCreateFile,
  onCreateFolder,
  onRename,
  onCopy,
  onDelete,
  currentUser,
  onDisplayNameChange,
  onColorChange,
  settings,
  onSettingChange,
  vimMode,
  onVimModeChange,
  keymap,
  onKeymapChange,
  onLanguageChange,
}: FileTreeProps) {
  const { t } = useTranslation();
  const [contextTarget, setContextTarget] = useState<FileTreeTarget>(null);
  const [inlineEdit, setInlineEdit] = useState<InlineEditState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FileTreeDeleteTarget | null>(null);
  const deleteItemRef = useRef<HTMLDivElement>(null);
  const pendingMenuAction = useRef<(() => void) | null>(null);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => new Set());
  const tree = useMemo(() => buildFileTree(files, folders), [files, folders]);

  useEffect(() => {
    const ancestors = folderAncestors(selectedPath);
    setCollapsedFolders((current) => {
      if (!ancestors.some((path) => current.has(path))) return current;
      const next = new Set(current);
      for (const path of ancestors) next.delete(path);
      return next;
    });
  }, [selectedPath]);

  const handleContextMenu = (event: MouseEvent<HTMLElement>) => {
    const target =
      event.target instanceof HTMLElement
        ? event.target.closest<HTMLElement>("[data-context-kind]")
        : null;
    if (!target) {
      setContextTarget(null);
      return;
    }

    if (target.dataset.contextKind === "file") {
      const file = files.find((item) => item.id === target.dataset.contextId);
      setContextTarget(file ? { type: "file", file } : null);
      return;
    }
    if (target.dataset.contextKind === "folder" && target.dataset.contextPath) {
      setContextTarget({ type: "folder", path: target.dataset.contextPath });
      return;
    }
    setContextTarget(null);
  };

  const startInlineEdit = (mode: InlineEditMode, target: FileTreeTarget) => {
    const inlineTarget = target
      ? target.type === "file"
        ? { type: "file" as const, path: target.file.path }
        : { type: "folder" as const, path: target.path }
      : null;
    const nextInlineEdit: InlineEditState = {
      mode,
      target,
      directory: getInlineEditDirectory(inlineTarget, mode),
      value: getInlineEditDefaultValue(mode, inlineTarget, files.length),
    };
    setDeleteTarget(null);
    pendingMenuAction.current = () => {
      setInlineEdit(nextInlineEdit);
      if (mode.startsWith("create") && target?.type === "folder") {
        setCollapsedFolders((current) => {
          if (!current.has(target.path)) return current;
          const next = new Set(current);
          next.delete(target.path);
          return next;
        });
      }
    };
  };

  const handleInlineSubmit = () => {
    if (!inlineEdit) return;
    const resolved = resolveInlineEdit(inlineEdit.mode, inlineEdit.directory, inlineEdit.value);
    if (resolved.status === "cancel") {
      setInlineEdit(null);
      return;
    }
    if (resolved.status === "invalid") {
      setInlineEdit((current) =>
        current ? { ...current, error: t("dialog.pathRequired") } : null,
      );
      return;
    }
    const target = inlineEdit.target;
    const result =
      inlineEdit.mode === "create-file"
        ? onCreateFile(target, resolved.path)
        : inlineEdit.mode === "create-folder"
          ? onCreateFolder(target, resolved.path)
          : target
            ? onRename(target, resolved.path)
            : "Select an item to rename";
    if (result) {
      setInlineEdit((current) => (current ? { ...current, error: result } : null));
      return;
    }
    setInlineEdit(null);
  };

  const toggleFolder = (path: string) => {
    setCollapsedFolders((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <>
      <ContextMenu.Root onOpenChange={(open) => !open && setContextTarget(null)}>
        <ContextMenu.Trigger asChild>
          <motion.aside
            className="glass-panel flex h-full min-h-0 w-full min-w-0 flex-col bg-iris-rail text-iris-ink max-[760px]:w-[min(84vw,300px)] max-[760px]:min-w-[min(84vw,300px)] max-[760px]:border-r max-[760px]:border-iris-divider max-[760px]:shadow-[8px_0_28px_rgba(66,68,45,0.12)]"
            aria-label={t("files.projectFiles")}
            onContextMenu={handleContextMenu}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <div className="min-h-0 flex-1 overflow-auto px-2.5 pb-5 pt-1">
              <FileTreeNodes
                nodes={tree}
                theme={settings.theme}
                selectedPath={selectedPath}
                collapsedFolders={collapsedFolders}
                contextTarget={
                  contextTarget
                    ? contextTarget.type === "file"
                      ? { type: "file", id: contextTarget.file.id }
                      : contextTarget
                    : null
                }
                inlineEdit={inlineEdit}
                deleteTarget={deleteTarget}
                onSelect={onSelect}
                onToggleFolder={toggleFolder}
                onInlineChange={(value) =>
                  setInlineEdit((current) =>
                    current ? { ...current, value, error: undefined } : null,
                  )
                }
                onInlineSubmit={handleInlineSubmit}
                onInlineCancel={() => setInlineEdit(null)}
                onDeleteConfirm={() => {
                  if (!deleteTarget) return;
                  onDelete(deleteTarget);
                  setDeleteTarget(null);
                }}
                onDeleteCancel={() => setDeleteTarget(null)}
              />
            </div>

            <div className="flex items-center gap-2 px-2.5 pb-2.5 pt-2">
              <div className="min-w-0 flex-1">
                <CurrentUserCard
                  displayName={currentUser.displayName}
                  color={currentUser.color}
                  onDisplayNameChange={onDisplayNameChange}
                  onColorChange={onColorChange}
                />
              </div>
              <SettingsPopover
                settings={settings}
                onChange={onSettingChange}
                vimMode={vimMode}
                onVimModeChange={onVimModeChange}
                keymap={keymap}
                onKeymapChange={onKeymapChange}
                onLanguageChange={onLanguageChange}
              />
            </div>
          </motion.aside>
        </ContextMenu.Trigger>

        <ContextMenu.Portal>
          <ContextMenu.Content
            onCloseAutoFocus={(event) => {
              const action = pendingMenuAction.current;
              pendingMenuAction.current = null;
              if (!action) return;
              event.preventDefault();
              action();
            }}
            className={`theme-${settings.theme} glass-popover z-40 min-w-[190px] rounded-[9px] border border-iris-divider bg-iris-preview p-1.5 font-iris-mono text-[11px] leading-[1.2] text-iris-ink shadow-[0_14px_30px_rgba(65,66,45,0.16)]`}
          >
            <ContextMenu.Item
              className="flex cursor-default select-none items-center gap-2 rounded-md px-2 py-2 outline-none data-[highlighted]:bg-[color-mix(in_srgb,var(--accent)_13%,transparent)] data-[highlighted]:text-iris-strong"
              onSelect={() => startInlineEdit("create-file", contextTarget)}
            >
              <FilePlus2 width="14" height="14" />
              {t("files.newFile")}
            </ContextMenu.Item>
            <ContextMenu.Item
              className="flex cursor-default select-none items-center gap-2 rounded-md px-2 py-2 outline-none data-[highlighted]:bg-[color-mix(in_srgb,var(--accent)_13%,transparent)] data-[highlighted]:text-iris-strong"
              onSelect={() => startInlineEdit("create-folder", contextTarget)}
            >
              <Plus width="14" height="14" />
              {t("files.newFolder")}
            </ContextMenu.Item>
            <ContextMenu.Separator className="my-1 mx-1 h-px bg-iris-divider" />
            <ContextMenu.Item
              className="flex cursor-default select-none items-center gap-2 rounded-md px-2 py-2 outline-none data-[highlighted]:bg-[color-mix(in_srgb,var(--accent)_13%,transparent)] data-[highlighted]:text-iris-strong data-[disabled]:pointer-events-none data-[disabled]:opacity-45"
              disabled={!contextTarget}
              onSelect={() =>
                contextTarget &&
                startInlineEdit(
                  contextTarget.type === "file" ? "rename-file" : "rename-folder",
                  contextTarget,
                )
              }
            >
              <Pencil width="14" height="14" />
              {t("files.rename")}
            </ContextMenu.Item>
            <ContextMenu.Item
              className="flex cursor-default select-none items-center gap-2 rounded-md px-2 py-2 outline-none data-[highlighted]:bg-[color-mix(in_srgb,var(--accent)_13%,transparent)] data-[highlighted]:text-iris-strong data-[disabled]:pointer-events-none data-[disabled]:opacity-45"
              disabled={contextTarget?.type !== "file"}
              onSelect={() => contextTarget?.type === "file" && onCopy(contextTarget.file)}
            >
              <Copy width="14" height="14" />
              {t("files.copy")}
            </ContextMenu.Item>
            <ContextMenu.Item
              ref={deleteItemRef}
              className="flex cursor-default select-none items-center gap-2 rounded-md px-2 py-2 text-[#a55f5f] outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-45 data-[highlighted]:bg-[rgba(165,95,95,0.1)]"
              disabled={!contextTarget}
              onSelect={() => {
                const anchorRect = deleteItemRef.current?.getBoundingClientRect();
                if (!contextTarget || !anchorRect) return;
                const target = { ...contextTarget, anchorRect };
                pendingMenuAction.current = () => {
                  setInlineEdit(null);
                  setDeleteTarget(target);
                };
              }}
            >
              <Trash2 width="14" height="14" />
              {t("files.delete")}
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
    </>
  );
}
