import { atom } from "jotai";
import {
  isWorkspaceCommand,
  reduceWorkspaceState,
  type WorkspaceCommand,
  type WorkspaceState,
} from "./workspace-state";

const INITIAL_WORKSPACE_STATE: WorkspaceState = {
  selectedPath: "src/App.tsx",
  openTabPaths: ["src/App.tsx"],
  followingUserId: null,
  mobilePanel: null,
  previewConsoleOpen: false,
  activeDialog: null,
};

export const workspaceStateAtom = atom<WorkspaceState>(INITIAL_WORKSPACE_STATE);

export const selectedPathAtom = atom((get) => get(workspaceStateAtom).selectedPath);
export const openTabPathsAtom = atom((get) => get(workspaceStateAtom).openTabPaths);
export const followingUserIdAtom = atom((get) => get(workspaceStateAtom).followingUserId);
export const mobilePanelAtom = atom((get) => get(workspaceStateAtom).mobilePanel);
export const previewConsoleOpenAtom = atom((get) => get(workspaceStateAtom).previewConsoleOpen);
export const settingsOpenAtom = atom((get) => get(workspaceStateAtom).activeDialog === "settings");
export const fileSearchOpenAtom = atom(
  (get) => get(workspaceStateAtom).activeDialog === "fileSearch",
);
export const commandPaletteOpenAtom = atom(
  (get) => get(workspaceStateAtom).activeDialog === "commandPalette",
);

export const workspaceCommandAtom = atom(null, (get, set, command: WorkspaceCommand) => {
  if (!isWorkspaceCommand(command)) {
    if (import.meta.env.DEV) console.warn("Ignored an invalid workspace command.");
    return;
  }
  set(workspaceStateAtom, reduceWorkspaceState(get(workspaceStateAtom), command));
});
