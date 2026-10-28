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

test("reordering tabs preserves the active file and follow mode", () => {
  const state = {
    ...initial,
    selectedPath: "b.ts",
    openTabPaths: ["a.ts", "b.ts", "c.ts"],
  };
  const next = reduceWorkspaceState(state, {
    type: "reorder-tabs",
    paths: ["c.ts", "a.ts", "b.ts"],
  });

  expect(next).toEqual({ ...state, openTabPaths: ["c.ts", "a.ts", "b.ts"] });
  expect(state.openTabPaths).toEqual(["a.ts", "b.ts", "c.ts"]);
});

test.each([
  ["missing a newly opened tab", ["b.ts", "a.ts"]],
  ["including a deleted tab", ["d.ts", "a.ts", "b.ts"]],
  ["duplicating a tab", ["b.ts", "a.ts", "a.ts"]],
  ["leaving the order unchanged", ["a.ts", "b.ts", "c.ts"]],
] satisfies [string, string[]][])("ignores a tab reorder %s", (_, paths) => {
  const state = { ...initial, selectedPath: "b.ts", openTabPaths: ["a.ts", "b.ts", "c.ts"] };
  expect(reduceWorkspaceState(state, { type: "reorder-tabs", paths })).toBe(state);
});

test("closing other tabs uses the target tab and exits follow mode", () => {
  const state = {
    ...initial,
    selectedPath: "b.ts",
    openTabPaths: ["a.ts", "b.ts", "c.ts"],
  };
  const next = reduceWorkspaceState(state, {
    type: "close-tabs",
    path: "c.ts",
    mode: "others",
  });

  expect(next).toEqual({
    ...state,
    openTabPaths: ["c.ts"],
    selectedPath: "c.ts",
    followingUserId: null,
  });
});

test("closing tabs to the right follows the visual order and preserves a surviving active file", () => {
  const state = {
    ...initial,
    selectedPath: "c.ts",
    openTabPaths: ["c.ts", "a.ts", "b.ts"],
  };
  const next = reduceWorkspaceState(state, {
    type: "close-tabs",
    path: "a.ts",
    mode: "right",
  });

  expect(next).toEqual({
    ...state,
    openTabPaths: ["c.ts", "a.ts"],
    followingUserId: null,
  });
});

test.each([
  ["others", "a.ts", "c.ts", ["a.ts"], "a.ts"],
  ["others", "c.ts", "a.ts", ["c.ts"], "c.ts"],
  ["others", "b.ts", "b.ts", ["b.ts"], "b.ts"],
  ["right", "a.ts", "c.ts", ["a.ts"], "a.ts"],
  ["right", "b.ts", "c.ts", ["a.ts", "b.ts"], "b.ts"],
  ["right", "c.ts", "b.ts", ["a.ts", "b.ts", "c.ts"], "b.ts"],
] satisfies ["others" | "right", string, string, string[], string][])(
  "closing %s from %s while editing %s selects a surviving neighbor",
  (mode, path, selectedPath, expectedPaths, expectedSelection) => {
    const state = { ...initial, selectedPath, openTabPaths: ["a.ts", "b.ts", "c.ts"] };
    const next = reduceWorkspaceState(state, { type: "close-tabs", path, mode });

    expect(next.openTabPaths).toEqual(expectedPaths);
    expect(next.selectedPath).toBe(expectedSelection);
  },
);

test("closing all tabs clears the active file even when the target has disappeared", () => {
  const next = reduceWorkspaceState(initial, {
    type: "close-tabs",
    path: "missing.ts",
    mode: "all",
  });

  expect(next).toEqual({
    ...initial,
    openTabPaths: [],
    selectedPath: "",
    followingUserId: null,
  });
});

test.each(["others", "right"] as const)("ignores closing %s from a missing target", (mode) => {
  expect(reduceWorkspaceState(initial, { type: "close-tabs", path: "missing.ts", mode })).toBe(
    initial,
  );
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
