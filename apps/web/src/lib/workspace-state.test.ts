import { expect, test } from "bun:test";
import { reduceWorkspaceState, type WorkspaceState } from "./workspace-state";

const initial: WorkspaceState = {
  selectedPath: "src/App.tsx",
  openTabPaths: ["src/App.tsx"],
  followingUserId: "remote",
  mobilePanel: null,
  previewConsoleOpen: false,
  activeDialog: null,
};

test("activating a file opens it, selects it, and exits follow mode", () => {
  const next = reduceWorkspaceState(initial, { type: "activate-file", path: "src/main.tsx" });

  expect(next).toEqual({
    ...initial,
    selectedPath: "src/main.tsx",
    openTabPaths: ["src/App.tsx", "src/main.tsx"],
    followingUserId: null,
  });
});

test("selecting a followed file keeps follow mode active", () => {
  const next = reduceWorkspaceState(initial, { type: "select-file", path: "src/main.tsx" });

  expect(next.selectedPath).toBe("src/main.tsx");
  expect(next.openTabPaths).toEqual(["src/App.tsx", "src/main.tsx"]);
  expect(next.followingUserId).toBe("remote");
});

test("closing the active tab picks the right neighbor and exits follow mode", () => {
  const state = {
    ...initial,
    selectedPath: "src/main.tsx",
    openTabPaths: ["src/App.tsx", "src/main.tsx", "src/index.css"],
  };
  const next = reduceWorkspaceState(state, { type: "close-tab", path: "src/main.tsx" });

  expect(next.selectedPath).toBe("src/index.css");
  expect(next.openTabPaths).toEqual(["src/App.tsx", "src/index.css"]);
  expect(next.followingUserId).toBeNull();
});

test("updates selected file and open tabs as one navigation transition", () => {
  const next = reduceWorkspaceState(initial, {
    type: "set-navigation",
    selectedPath: "src/renamed.tsx",
    openTabPaths: ["src/renamed.tsx", "src/other.tsx"],
  });

  expect(next.selectedPath).toBe("src/renamed.tsx");
  expect(next.openTabPaths).toEqual(["src/renamed.tsx", "src/other.tsx"]);
  expect(next.followingUserId).toBe("remote");
});

test("panel and dialog commands are deterministic", () => {
  let state = reduceWorkspaceState(initial, { type: "set-mobile-panel", panel: "files" });
  state = reduceWorkspaceState(state, { type: "set-file-search-open", open: true });
  state = reduceWorkspaceState(state, { type: "set-command-palette-open", open: true });
  state = reduceWorkspaceState(state, { type: "set-settings-open", open: true });
  state = reduceWorkspaceState(state, { type: "set-mobile-panel", panel: "files" });

  expect(state).toMatchObject({
    mobilePanel: null,
    activeDialog: "settings",
  });
});

test("keeps only the most recently opened workspace dialog active", () => {
  let state = reduceWorkspaceState(initial, { type: "set-file-search-open", open: true });
  state = reduceWorkspaceState(state, { type: "set-command-palette-open", open: true });
  state = reduceWorkspaceState(state, { type: "set-settings-open", open: true });

  state = reduceWorkspaceState(state, { type: "set-file-search-open", open: false });
  expect(state.activeDialog).toBe("settings");
});

test("closing the palette after opening file search leaves file search active", () => {
  let state = reduceWorkspaceState(initial, { type: "set-command-palette-open", open: true });
  state = reduceWorkspaceState(state, { type: "set-file-search-open", open: true });
  state = reduceWorkspaceState(state, { type: "set-command-palette-open", open: false });

  expect(state.activeDialog).toBe("fileSearch");
});
