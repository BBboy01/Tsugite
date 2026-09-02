import * as ContextMenu from "@radix-ui/react-context-menu";
import { CopyIcon, FilePlusIcon, Pencil1Icon, PlusIcon, TrashIcon } from "@radix-ui/react-icons";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useState, type MouseEvent } from "react";

import type { ProjectFile, ProjectSettings } from "@iris/shared";

import { buildFileTree, folderAncestors } from "../lib/file-tree-model";
import { resolveDialogPath } from "../lib/file-tree-path";
import { CurrentUserCard } from "./current-user-card";
import { FileTreeNodes } from "./file-tree-node";
import { FileTreeDialog, type FileDialogMode } from "./file-tree-dialog";
import { SettingsPopover } from "./settings-popover";

export type FileTreeTarget =
  | { type: "file"; file: ProjectFile }
  | { type: "folder"; path: string }
  | null;

export function getDialogDirectory(target: FileTreeTarget): string {
  if (!target) return "";
  return target.type === "folder"
    ? target.path
    : target.file.path.split("/").slice(0, -1).join("/");
}

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
}: FileTreeProps) {
  const { t } = useTranslation();
  const [contextTarget, setContextTarget] = useState<FileTreeTarget>(null);
  const [dialogMode, setDialogMode] = useState<FileDialogMode | null>(null);
  const [dialogDefaultPath, setDialogDefaultPath] = useState("");
  const [dialogError, setDialogError] = useState<string>();
  const [dialogTarget, setDialogTarget] = useState<FileTreeTarget>(null);
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

  const targetLabel = contextTarget
    ? contextTarget.type === "file"
      ? contextTarget.file.path
      : contextTarget.path
    : t("files.project");

  const openPathDialog = (mode: FileDialogMode, target: FileTreeTarget) => {
    const targetPath = target ? (target.type === "file" ? target.file.path : target.path) : "";
    const directory = getDialogDirectory(target);
    const defaultPath =
      mode === "create-file"
        ? `${directory ? `${directory}/` : ""}new-${files.length + 1}.ts`
        : mode === "create-folder"
          ? `${directory ? `${directory}/` : ""}new-folder`
          : targetPath;
    setDialogError(undefined);
    setDialogDefaultPath(defaultPath);
    setDialogTarget(target);
    setDialogMode(mode);
  };

  const handleDialogSubmit = (path: string) => {
    if (!dialogMode) return;
    const target = dialogTarget;
    const directory = getDialogDirectory(target);
    const resolvedPath = resolveDialogPath(dialogMode, directory, path);
    const result =
      dialogMode === "create-file"
        ? onCreateFile(target, resolvedPath)
        : dialogMode === "create-folder"
          ? onCreateFolder(target, resolvedPath)
          : target
            ? onRename(target, resolvedPath)
            : "Select an item to rename";
    if (result) {
      setDialogError(result);
      return;
    }
    setDialogMode(null);
    setDialogTarget(null);
    setDialogError(undefined);
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
                selectedPath={selectedPath}
                collapsedFolders={collapsedFolders}
                onSelect={onSelect}
                onToggleFolder={toggleFolder}
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
              <SettingsPopover settings={settings} onChange={onSettingChange} />
            </div>
          </motion.aside>
        </ContextMenu.Trigger>

        <ContextMenu.Portal>
          <ContextMenu.Content
            className={`theme-${settings.theme} glass-popover z-40 min-w-[190px] rounded-[9px] border border-iris-divider bg-iris-preview p-1.5 font-iris-mono text-[11px] leading-[1.2] text-iris-ink shadow-[0_14px_30px_rgba(65,66,45,0.16)]`}
          >
            <ContextMenu.Label className="max-w-[260px] truncate px-2 py-1.5 text-iris-muted">
              {targetLabel}
            </ContextMenu.Label>
            <ContextMenu.Item
              className="flex cursor-default select-none items-center gap-2 rounded-md px-2 py-2 outline-none data-[highlighted]:bg-[color-mix(in_srgb,var(--accent)_13%,transparent)] data-[highlighted]:text-iris-strong"
              onSelect={() => openPathDialog("create-file", contextTarget)}
            >
              <FilePlusIcon width="14" height="14" />
              {t("files.newFile")}
            </ContextMenu.Item>
            <ContextMenu.Item
              className="flex cursor-default select-none items-center gap-2 rounded-md px-2 py-2 outline-none data-[highlighted]:bg-[color-mix(in_srgb,var(--accent)_13%,transparent)] data-[highlighted]:text-iris-strong"
              onSelect={() => openPathDialog("create-folder", contextTarget)}
            >
              <PlusIcon width="14" height="14" />
              {t("files.newFolder")}
            </ContextMenu.Item>
            <ContextMenu.Separator className="my-1 mx-1 h-px bg-iris-divider" />
            <ContextMenu.Item
              className="flex cursor-default select-none items-center gap-2 rounded-md px-2 py-2 outline-none data-[highlighted]:bg-[color-mix(in_srgb,var(--accent)_13%,transparent)] data-[highlighted]:text-iris-strong data-[disabled]:pointer-events-none data-[disabled]:opacity-45"
              disabled={!contextTarget}
              onSelect={() =>
                contextTarget &&
                openPathDialog(
                  contextTarget.type === "file" ? "rename-file" : "rename-folder",
                  contextTarget,
                )
              }
            >
              <Pencil1Icon width="14" height="14" />
              {t("files.rename")}
            </ContextMenu.Item>
            <ContextMenu.Item
              className="flex cursor-default select-none items-center gap-2 rounded-md px-2 py-2 outline-none data-[highlighted]:bg-[color-mix(in_srgb,var(--accent)_13%,transparent)] data-[highlighted]:text-iris-strong data-[disabled]:pointer-events-none data-[disabled]:opacity-45"
              disabled={contextTarget?.type !== "file"}
              onSelect={() => contextTarget?.type === "file" && onCopy(contextTarget.file)}
            >
              <CopyIcon width="14" height="14" />
              {t("files.copy")}
            </ContextMenu.Item>
            <ContextMenu.Item
              className="flex cursor-default select-none items-center gap-2 rounded-md px-2 py-2 text-[#a55f5f] outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-45 data-[highlighted]:bg-[rgba(165,95,95,0.1)]"
              disabled={!contextTarget}
              onSelect={() => contextTarget && onDelete(contextTarget)}
            >
              <TrashIcon width="14" height="14" />
              {t("files.delete")}
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
      <FileTreeDialog
        mode={dialogMode}
        defaultPath={dialogDefaultPath}
        error={dialogError}
        theme={settings.theme}
        onOpenChange={(open) => {
          if (!open) {
            setDialogMode(null);
            setDialogTarget(null);
            setDialogError(undefined);
          }
        }}
        onSubmit={handleDialogSubmit}
      />
    </>
  );
}
