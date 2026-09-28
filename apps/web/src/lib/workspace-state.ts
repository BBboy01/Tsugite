import { closeEditorTab, openEditorTab } from "./editor-tabs";
import { toggleMobileWorkspacePanel, type MobileWorkspacePanel } from "./workspace-layout-model";

export type WorkspaceDialog = "settings" | "fileSearch" | "commandPalette";

export type WorkspaceState = {
  selectedPath: string;
  openTabPaths: string[];
  followingUserId: string | null;
  mobilePanel: MobileWorkspacePanel | null;
  previewConsoleOpen: boolean;
  activeDialog: WorkspaceDialog | null;
};

export type WorkspaceCommand =
  | { type: "activate-file"; path: string }
  | { type: "select-file"; path: string }
  | { type: "close-tab"; path: string }
  | { type: "set-navigation"; selectedPath: string; openTabPaths: string[] }
  | { type: "set-following"; userId: string | null }
  | { type: "set-mobile-panel"; panel: MobileWorkspacePanel }
  | { type: "set-mobile-panel-value"; panel: MobileWorkspacePanel | null }
  | { type: "toggle-preview-console" }
  | { type: "set-preview-console-open"; open: boolean }
  | { type: "set-settings-open"; open: boolean }
  | { type: "set-file-search-open"; open: boolean }
  | { type: "set-command-palette-open"; open: boolean };

export function isWorkspaceCommand(value: unknown): value is WorkspaceCommand {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const command = value as Record<string, unknown>;
  switch (command.type) {
    case "activate-file":
    case "select-file":
    case "close-tab":
      return typeof command.path === "string";
    case "set-navigation":
      if (typeof command.selectedPath !== "string" || !Array.isArray(command.openTabPaths)) {
        return false;
      }
      for (const path of command.openTabPaths) {
        if (typeof path !== "string") return false;
      }
      return true;
    case "set-following":
      return command.userId === null || typeof command.userId === "string";
    case "set-mobile-panel":
      return command.panel === "files" || command.panel === "preview";
    case "set-mobile-panel-value":
      return command.panel === null || command.panel === "files" || command.panel === "preview";
    case "toggle-preview-console":
      return true;
    case "set-preview-console-open":
    case "set-settings-open":
    case "set-file-search-open":
    case "set-command-palette-open":
      return typeof command.open === "boolean";
    default:
      return false;
  }
}

export function reduceWorkspaceState(
  state: WorkspaceState,
  command: WorkspaceCommand,
): WorkspaceState {
  switch (command.type) {
    case "activate-file":
      return {
        ...state,
        selectedPath: command.path,
        openTabPaths: command.path
          ? openEditorTab(state.openTabPaths, command.path)
          : state.openTabPaths,
        followingUserId: null,
      };
    case "select-file":
      return {
        ...state,
        selectedPath: command.path,
        openTabPaths: command.path
          ? openEditorTab(state.openTabPaths, command.path)
          : state.openTabPaths,
      };
    case "close-tab": {
      const result = closeEditorTab(state.openTabPaths, command.path, state.selectedPath);
      return {
        ...state,
        selectedPath: result.nextPath,
        openTabPaths: result.paths,
        followingUserId: null,
      };
    }
    case "set-navigation":
      return {
        ...state,
        selectedPath: command.selectedPath,
        openTabPaths: command.openTabPaths,
      };
    case "set-following":
      return { ...state, followingUserId: command.userId };
    case "set-mobile-panel":
      return {
        ...state,
        mobilePanel: toggleMobileWorkspacePanel(state.mobilePanel, command.panel),
        followingUserId: null,
      };
    case "set-mobile-panel-value":
      return { ...state, mobilePanel: command.panel };
    case "toggle-preview-console":
      return { ...state, previewConsoleOpen: !state.previewConsoleOpen };
    case "set-preview-console-open":
      return { ...state, previewConsoleOpen: command.open };
    case "set-settings-open":
      return setActiveDialog(state, "settings", command.open);
    case "set-file-search-open":
      return setActiveDialog(state, "fileSearch", command.open);
    case "set-command-palette-open":
      return setActiveDialog(state, "commandPalette", command.open);
  }
}

function setActiveDialog(
  state: WorkspaceState,
  dialog: WorkspaceDialog,
  open: boolean,
): WorkspaceState {
  if (open) return { ...state, activeDialog: dialog };
  if (state.activeDialog !== dialog) return state;
  return { ...state, activeDialog: null };
}
