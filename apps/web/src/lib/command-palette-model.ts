import type { PackageManager, ProjectSettings, WorkspaceTheme } from "@iris/shared";
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
  PanelBottom,
  type LucideIcon,
} from "lucide-react";
import type { TFunction } from "i18next";

import { WORKSPACE_THEME_OPTIONS } from "./workspace-theme";
import { RUNTIME_ACTIONS } from "./runtime-actions";
import { languageOptions } from "./i18n";
import { getSettingDefinition } from "./settings-registry";
import { formatKeyBinding, type KeyBinding } from "./keymap";
import type { LanguageCode } from "./i18n-config";
import type { RuntimeAction } from "./runtime-actions";

export type RootCommandId =
  | "file.search"
  | "settings.open"
  | "preview.console.toggle"
  | "language.choose"
  | "theme.random"
  | "theme.choose"
  | "cursor.choose"
  | "packageManager.choose"
  | "vim.toggle"
  | "systemClipboard.toggle"
  | "wordWrap.toggle"
  | "relativeLineNumbers.toggle"
  | "autoInstall.toggle"
  | "autoStartPreview.toggle"
  | `runtime.${RuntimeAction}`;
export type ExternalCommandId = Extract<RootCommandId, "file.search" | "settings.open">;
export type Submenu = "language" | "theme" | "normalCursor" | "packageManager";

type PaletteCommandBase = {
  label: string;
  searchText?: string;
  icon: LucideIcon;
  shortcut?: string;
  selected?: boolean;
};

type RootPaletteCommand = PaletteCommandBase & { scope: "root"; id: RootCommandId };
export type PaletteCommand =
  | RootPaletteCommand
  | (PaletteCommandBase & { scope: "language"; id: LanguageCode })
  | (PaletteCommandBase & { scope: "theme"; id: WorkspaceTheme })
  | (PaletteCommandBase & {
      scope: "normalCursor";
      id: ProjectSettings["normalCursorStyle"];
    })
  | (PaletteCommandBase & { scope: "packageManager"; id: PackageManager });

type ToggleCommandId = Extract<RootCommandId, `${string}.toggle`>;

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

function toggleCommand(id: ToggleCommandId, label: string, enabled: boolean): RootPaletteCommand {
  return {
    scope: "root",
    id,
    label,
    searchText: label,
    icon: enabled ? ToggleRight : ToggleLeft,
  };
}

export function getRootCommands(
  settings: ProjectSettings,
  vimMode: boolean,
  systemClipboard: boolean,
  t: TFunction,
  keymap: readonly KeyBinding[],
): PaletteCommand[] {
  const settingLabel = (id: string) => t(getSettingDefinition(id)?.labelKey ?? id);
  const shortcutFor = (action: KeyBinding["action"]) =>
    formatKeyBinding(keymap.find((binding) => binding.action === action)?.key ?? "");
  return [
    {
      scope: "root",
      id: "file.search",
      label: t("command.fileSearch"),
      icon: FileSearch,
      shortcut: shortcutFor("file.search"),
    },
    {
      scope: "root",
      id: "settings.open",
      label: t("command.openSettings"),
      icon: Settings,
      shortcut: shortcutFor("settings.open"),
    },
    {
      scope: "root",
      id: "preview.console.toggle",
      label: t("preview.output"),
      icon: PanelBottom,
      shortcut: shortcutFor("preview.console"),
    },
    {
      scope: "root",
      id: "language.choose",
      label: settingLabel("language"),
      icon: Languages,
    },
    { scope: "root", id: "theme.random", label: t("settings.theme.random"), icon: Dices },
    { scope: "root", id: "theme.choose", label: t("command.chooseTheme"), icon: Palette },
    {
      scope: "root",
      id: "cursor.choose",
      label: t("command.chooseNormalCursor"),
      icon: TextCursor,
    },
    {
      scope: "root",
      id: "packageManager.choose",
      label: t("command.choosePackageManager"),
      icon: Package,
    },
    toggleCommand("vim.toggle", settingLabel("vimMode"), vimMode),
    toggleCommand("systemClipboard.toggle", settingLabel("systemClipboard"), systemClipboard),
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
    ...RUNTIME_ACTIONS.map((action): RootPaletteCommand => ({
      scope: "root",
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
      return languageOptions.map((language): PaletteCommand => ({
        scope: "language",
        id: language.code,
        label: language.label,
        icon: Languages,
      }));
    case "theme":
      return WORKSPACE_THEME_OPTIONS.map((theme): PaletteCommand => ({
        scope: "theme",
        id: theme.id,
        label: t(theme.labelKey),
        icon: Palette,
        selected: theme.id === settings.theme,
      }));
    case "normalCursor":
      return NORMAL_CURSOR_STYLES.map((style): PaletteCommand => ({
        scope: "normalCursor",
        id: style,
        label: t(NORMAL_CURSOR_LABEL_KEYS[style]),
        icon: TextCursor,
        selected: style === settings.normalCursorStyle,
      }));
    case "packageManager":
      return PACKAGE_MANAGERS.map((packageManager): PaletteCommand => ({
        scope: "packageManager",
        id: packageManager,
        label: packageManager,
        icon: Package,
        selected: packageManager === settings.packageManager,
      }));
  }
}
