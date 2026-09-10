import type { ProjectSettings } from "@iris/shared";
import {
  Command,
  Dices,
  FileSearch,
  Package,
  Palette,
  Settings,
  ToggleLeft,
  type LucideIcon,
} from "lucide-react";
import type { TFunction } from "i18next";

import { WORKSPACE_THEME_OPTIONS } from "./workspace-theme";

export type CommandId = "file.search" | "settings.open";
export type Submenu = "theme" | "normalCursor" | "packageManager";

export type PaletteCommand = {
  id: string;
  label: string;
  icon: LucideIcon;
  selected?: boolean;
};

const NORMAL_CURSOR_STYLES = [
  "block",
  "line",
  "underline",
  "block-blink",
  "line-blink",
  "underline-blink",
] as const;

const PACKAGE_MANAGERS = ["pnpm", "npm", "yarn"] as const;

const NORMAL_CURSOR_LABEL_KEYS: Record<ProjectSettings["normalCursorStyle"], string> = {
  block: "settings.cursor.block",
  line: "settings.cursor.line",
  underline: "settings.cursor.underline",
  "block-blink": "settings.cursor.blockBlink",
  "line-blink": "settings.cursor.lineBlink",
  "underline-blink": "settings.cursor.underlineBlink",
};

function toggleLabel(t: TFunction, label: string, enabled: boolean) {
  return `${t("command.toggle", { label })} · ${t(enabled ? "command.state.on" : "command.state.off")}`;
}

export function getRootCommands(
  settings: ProjectSettings,
  vimMode: boolean,
  t: TFunction,
): PaletteCommand[] {
  return [
    { id: "file.search", label: t("command.fileSearch"), icon: FileSearch },
    { id: "settings.open", label: t("command.openSettings"), icon: Settings },
    { id: "theme.random", label: t("settings.theme.random"), icon: Dices },
    { id: "theme.choose", label: t("command.chooseTheme"), icon: Palette },
    { id: "cursor.choose", label: t("command.chooseNormalCursor"), icon: Command },
    { id: "packageManager.choose", label: t("command.choosePackageManager"), icon: Package },
    { id: "vim.toggle", label: toggleLabel(t, t("settings.vimMode"), vimMode), icon: ToggleLeft },
    {
      id: "wordWrap.toggle",
      label: toggleLabel(t, t("settings.wordWrap"), settings.wordWrap),
      icon: ToggleLeft,
    },
    {
      id: "relativeLineNumbers.toggle",
      label: toggleLabel(t, t("settings.relativeLineNumbers"), settings.relativeLineNumbers),
      icon: ToggleLeft,
    },
    {
      id: "autoInstall.toggle",
      label: toggleLabel(t, t("settings.autoInstall"), settings.autoInstall),
      icon: ToggleLeft,
    },
    {
      id: "autoStartPreview.toggle",
      label: toggleLabel(t, t("settings.autoStartPreview"), settings.autoStartPreview),
      icon: ToggleLeft,
    },
  ];
}

export function getSubmenuLabel(submenu: Submenu, t: TFunction) {
  switch (submenu) {
    case "theme":
      return t("command.chooseTheme");
    case "normalCursor":
      return t("command.chooseNormalCursor");
    case "packageManager":
      return t("command.choosePackageManager");
  }
}

export function getSubmenuCommands(
  submenu: Submenu,
  settings: ProjectSettings,
  t: TFunction,
): PaletteCommand[] {
  switch (submenu) {
    case "theme":
      return WORKSPACE_THEME_OPTIONS.map((theme) => ({
        id: theme.id,
        label: t(theme.labelKey),
        icon: Palette,
        selected: theme.id === settings.theme,
      }));
    case "normalCursor":
      return NORMAL_CURSOR_STYLES.map((style) => ({
        id: style,
        label: t(NORMAL_CURSOR_LABEL_KEYS[style]),
        icon: Command,
        selected: style === settings.normalCursorStyle,
      }));
    case "packageManager":
      return PACKAGE_MANAGERS.map((packageManager) => ({
        id: packageManager,
        label: packageManager,
        icon: Package,
        selected: packageManager === settings.packageManager,
      }));
  }
}
