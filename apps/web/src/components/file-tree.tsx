import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { memo } from "react";

import type { ProjectFile, ProjectSettings } from "@iris/shared";

import type { FileTreeTarget } from "../lib/file-tree-model";
import { CurrentUserCard } from "./current-user-card";
import { PierreFileTreeView } from "./pierre-file-tree-view";
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
  onMove: (sourcePaths: readonly string[], directory: string) => string | undefined;
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
  onMove,
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

  return (
    <motion.aside
      className="glass-panel flex h-full min-h-0 w-full min-w-0 flex-col bg-iris-rail text-iris-ink max-[760px]:w-[min(84vw,300px)] max-[760px]:min-w-[min(84vw,300px)] max-[760px]:border-r max-[760px]:border-iris-divider max-[760px]:shadow-[8px_0_28px_rgba(66,68,45,0.12)]"
      aria-label={t("files.projectFiles")}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      <PierreFileTreeView
        files={files}
        folders={folders}
        selectedPath={selectedPath}
        theme={settings.theme}
        label={t("files.projectFiles")}
        onSelect={onSelect}
        onMove={onMove}
        onCreateFile={onCreateFile}
        onCreateFolder={onCreateFolder}
        onRename={onRename}
        onCopy={onCopy}
        onDelete={onDelete}
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
  );
});
