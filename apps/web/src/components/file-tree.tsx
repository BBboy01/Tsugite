import * as ContextMenu from "@radix-ui/react-context-menu";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { memo, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";

import type { ProjectFile, ProjectSettings } from "@iris/shared";

import { buildFileTree, folderAncestors, type FileTreeTarget } from "../lib/file-tree-model";
import {
  getInlineEditDefaultValue,
  getInlineEditDirectory,
  resolveInlineEdit,
  type InlineEditMode,
} from "../lib/file-tree-edit-model";
import { CurrentUserCard } from "./current-user-card";
import { FileTreeNodes } from "./file-tree-node";
import { FileTreeContextMenu } from "./file-tree-context-menu";
import type { FileTreeDeleteTarget, InlineEditState } from "./file-tree.types";
import { SettingsPopover } from "./settings-popover";
import type { KeyBinding } from "../lib/keymap";
import type { LanguageCode } from "../lib/i18n";

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
  currentUserDisplayName: string;
  currentUserColor: string;
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

export const FileTree = memo(function FileTree({
  files,
  folders,
  selectedPath,
  onSelect,
  onCreateFile,
  onCreateFolder,
  onRename,
  onCopy,
  onDelete,
  currentUserDisplayName,
  currentUserColor,
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
      event.target instanceof Element
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
              label={t("files.projectFiles")}
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

            <div className="flex items-center gap-2 px-2.5 pb-2.5 pt-2">
              <div className="min-w-0 flex-1">
                <CurrentUserCard
                  displayName={currentUserDisplayName}
                  color={currentUserColor}
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

        <FileTreeContextMenu
          theme={settings.theme}
          target={contextTarget}
          onStartEdit={startInlineEdit}
          onCopy={onCopy}
          onRequestDelete={(target) => {
            pendingMenuAction.current = () => {
              setInlineEdit(null);
              setDeleteTarget(target);
            };
          }}
          onCloseAutoFocus={(event) => {
            const action = pendingMenuAction.current;
            pendingMenuAction.current = null;
            if (!action) return;
            event.preventDefault();
            action();
          }}
        />
      </ContextMenu.Root>
    </>
  );
});
