export type SettingScope = "workspace" | "editor" | "keyboard" | "runtime";
export type SettingKind = "select" | "multi-select" | "toggle" | "custom" | "action" | "keymap";

export type SettingDefinition = {
  id: string;
  scope: SettingScope;
  sharing: "device" | "room";
  kind: SettingKind;
  labelKey: string;
  descriptionKey?: string;
  command?: boolean;
};

export const SETTINGS_REGISTRY: SettingDefinition[] = [
  {
    id: "language",
    sharing: "device",
    scope: "workspace",
    kind: "select",
    labelKey: "settings.language",
    command: true,
  },
  {
    id: "theme",
    sharing: "room",
    scope: "workspace",
    kind: "custom",
    labelKey: "settings.theme",
    command: true,
  },
  {
    id: "fontFamily",
    sharing: "room",
    scope: "editor",
    kind: "custom",
    labelKey: "settings.fontFamily",
  },
  {
    id: "fontSize",
    sharing: "room",
    scope: "editor",
    kind: "custom",
    labelKey: "settings.fontSize",
  },
  {
    id: "wordWrap",
    sharing: "room",
    scope: "editor",
    kind: "toggle",
    labelKey: "settings.wordWrap",
    descriptionKey: "settings.wordWrapDescription",
    command: true,
  },
  {
    id: "relativeLineNumbers",
    sharing: "room",
    scope: "editor",
    kind: "toggle",
    labelKey: "settings.relativeLineNumbers",
    descriptionKey: "settings.relativeLineNumbersDescription",
    command: true,
  },
  {
    id: "normalCursorStyle",
    sharing: "room",
    scope: "editor",
    kind: "select",
    labelKey: "settings.normalCursorStyle",
    command: true,
  },
  {
    id: "vimMode",
    sharing: "device",
    scope: "keyboard",
    kind: "toggle",
    labelKey: "settings.vimMode",
    descriptionKey: "settings.vimModeDescription",
    command: true,
  },
  {
    id: "systemClipboard",
    sharing: "device",
    scope: "keyboard",
    kind: "toggle",
    labelKey: "settings.systemClipboard",
    descriptionKey: "settings.systemClipboardDescription",
  },
  {
    id: "fileSearchKeymap",
    sharing: "device",
    scope: "keyboard",
    kind: "keymap",
    labelKey: "settings.fileSearchKeymap",
  },
  {
    id: "openSettingsKeymap",
    sharing: "device",
    scope: "keyboard",
    kind: "keymap",
    labelKey: "settings.openKeymap",
  },
  {
    id: "commandPaletteKeymap",
    sharing: "device",
    scope: "keyboard",
    kind: "keymap",
    labelKey: "settings.commandPaletteKeymap",
  },
  {
    id: "previewConsoleKeymap",
    sharing: "device",
    scope: "keyboard",
    kind: "keymap",
    labelKey: "settings.previewConsoleKeymap",
  },
  {
    id: "packageManager",
    sharing: "room",
    scope: "runtime",
    kind: "select",
    labelKey: "settings.packageManager",
    command: true,
  },
  {
    id: "autoInstall",
    sharing: "room",
    scope: "runtime",
    kind: "toggle",
    labelKey: "settings.autoInstall",
    descriptionKey: "settings.autoInstallDescription",
    command: true,
  },
  {
    id: "autoStartPreview",
    sharing: "room",
    scope: "runtime",
    kind: "toggle",
    labelKey: "settings.autoStartPreview",
    descriptionKey: "settings.autoStartPreviewDescription",
    command: true,
  },
  {
    id: "runtimeRestart",
    sharing: "device",
    scope: "runtime",
    kind: "action",
    labelKey: "settings.runtimeRestart",
  },
  {
    id: "runtimeReinstall",
    sharing: "device",
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
