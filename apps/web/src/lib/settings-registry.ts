export type SettingScope = "workspace" | "editor" | "keyboard" | "runtime";
export type SettingKind = "select" | "multi-select" | "toggle" | "custom" | "action" | "keymap";

export type SettingDefinition = {
  id: string;
  scope: SettingScope;
  kind: SettingKind;
  labelKey: string;
  descriptionKey?: string;
  command?: boolean;
};

export const SETTINGS_REGISTRY: SettingDefinition[] = [
  {
    id: "language",
    scope: "workspace",
    kind: "select",
    labelKey: "settings.language",
    command: true,
  },
  {
    id: "theme",
    scope: "workspace",
    kind: "custom",
    labelKey: "settings.theme",
    command: true,
  },
  {
    id: "fontFamily",
    scope: "editor",
    kind: "custom",
    labelKey: "settings.fontFamily",
  },
  {
    id: "fontSize",
    scope: "editor",
    kind: "custom",
    labelKey: "settings.fontSize",
  },
  {
    id: "wordWrap",
    scope: "editor",
    kind: "toggle",
    labelKey: "settings.wordWrap",
    descriptionKey: "settings.wordWrapDescription",
    command: true,
  },
  {
    id: "relativeLineNumbers",
    scope: "editor",
    kind: "toggle",
    labelKey: "settings.relativeLineNumbers",
    descriptionKey: "settings.relativeLineNumbersDescription",
    command: true,
  },
  {
    id: "normalCursorStyle",
    scope: "editor",
    kind: "select",
    labelKey: "settings.normalCursorStyle",
    command: true,
  },
  {
    id: "vimMode",
    scope: "keyboard",
    kind: "toggle",
    labelKey: "settings.vimMode",
    descriptionKey: "settings.vimModeDescription",
    command: true,
  },
  {
    id: "fileSearchKeymap",
    scope: "keyboard",
    kind: "keymap",
    labelKey: "settings.fileSearchKeymap",
  },
  {
    id: "openSettingsKeymap",
    scope: "keyboard",
    kind: "keymap",
    labelKey: "settings.openKeymap",
  },
  {
    id: "commandPaletteKeymap",
    scope: "keyboard",
    kind: "keymap",
    labelKey: "settings.commandPaletteKeymap",
  },
  {
    id: "packageManager",
    scope: "runtime",
    kind: "select",
    labelKey: "settings.packageManager",
    command: true,
  },
  {
    id: "autoInstall",
    scope: "runtime",
    kind: "toggle",
    labelKey: "settings.autoInstall",
    descriptionKey: "settings.autoInstallDescription",
    command: true,
  },
  {
    id: "autoStartPreview",
    scope: "runtime",
    kind: "toggle",
    labelKey: "settings.autoStartPreview",
    descriptionKey: "settings.autoStartPreviewDescription",
    command: true,
  },
  {
    id: "runtimeRestart",
    scope: "runtime",
    kind: "action",
    labelKey: "settings.runtimeRestart",
  },
  {
    id: "runtimeReinstall",
    scope: "runtime",
    kind: "action",
    labelKey: "settings.runtimeReinstall",
  },
];

export function getSettingDefinition(id: string) {
  return SETTINGS_REGISTRY.find((setting) => setting.id === id);
}

export function getSettingsByScope(scope: SettingScope) {
  return SETTINGS_REGISTRY.filter((setting) => setting.scope === scope);
}
