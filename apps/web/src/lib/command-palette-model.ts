import type { ProjectSettings } from "@iris/shared";
import {
  Dices,
  FileSearch,
  Languages,
  Package,
  Palette,
  Settings,
  TextCursor,
  ToggleLeft,
  ToggleRight,
  type LucideIcon,
} from "lucide-react";
import type { TFunction } from "i18next";

import { WORKSPACE_THEME_OPTIONS } from "./workspace-theme";
import { RUNTIME_ACTIONS } from "./runtime-actions";
import { languageOptions } from "./i18n";
import { getSettingDefinition } from "./settings-registry";
import type { KeyBinding } from "./keymap";

export type CommandId =
  | "file.search"
  | "settings.open"
  | "language.choose"
  | `runtime.${(typeof RUNTIME_ACTIONS)[number]["id"]}`;
export type Submenu = "language" | "theme" | "normalCursor" | "packageManager";

export type PaletteCommand = {
  id: string;
  label: string;
  searchText?: string;
  icon: LucideIcon;
  iconClassName?: string;
  shortcut?: string;
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

function toggleCommand(id: string, label: string, enabled: boolean): PaletteCommand {
  return {
    id,
    label,
    searchText: label,
    icon: enabled ? ToggleRight : ToggleLeft,
    iconClassName: enabled ? "text-emerald-500" : "text-rose-500",
  };
}

export function getRootCommands(
  settings: ProjectSettings,
  vimMode: boolean,
  t: TFunction,
  keymap: readonly KeyBinding[],
): PaletteCommand[] {
  const settingLabel = (id: string) => t(getSettingDefinition(id)?.labelKey ?? id);
  const shortcutFor = (action: KeyBinding["action"]) =>
    keymap.find((binding) => binding.action === action)?.key;
  return [
    {
      id: "file.search",
      label: t("command.fileSearch"),
      icon: FileSearch,
      shortcut: shortcutFor("file.search"),
    },
    {
      id: "settings.open",
      label: t("command.openSettings"),
      icon: Settings,
      shortcut: shortcutFor("settings.open"),
    },
    { id: "language.choose", label: settingLabel("language"), icon: Languages },
    { id: "theme.random", label: t("settings.theme.random"), icon: Dices },
    { id: "theme.choose", label: t("command.chooseTheme"), icon: Palette },
    { id: "cursor.choose", label: t("command.chooseNormalCursor"), icon: TextCursor },
    { id: "packageManager.choose", label: t("command.choosePackageManager"), icon: Package },
    toggleCommand("vim.toggle", settingLabel("vimMode"), vimMode),
    toggleCommand("wordWrap.toggle", settingLabel("wordWrap"), settings.wordWrap),
    toggleCommand(
      "relativeLineNumbers.toggle",
      settingLabel("relativeLineNumbers"),
      settings.relativeLineNumbers,
    ),
    toggleCommand("autoInstall.toggle", settingLabel("autoInstall"), settings.autoInstall),
    toggleCommand(
      "autoStartPreview.toggle",
      settingLabel("autoStartPreview"),
      settings.autoStartPreview,
    ),
    ...RUNTIME_ACTIONS.map((action) => ({
      id: `runtime.${action.id}`,
      label: t(action.labelKey),
      icon: action.icon,
    })),
  ];
}

export function getSubmenuLabel(submenu: Submenu, t: TFunction) {
  switch (submenu) {
    case "language":
      return t("settings.language");
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
    case "language":
      return languageOptions.map((language) => ({
        id: language.code,
        label: language.label,
        icon: Languages,
      }));
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
        icon: TextCursor,
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
