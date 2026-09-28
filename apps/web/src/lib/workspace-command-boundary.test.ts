import { expect, spyOn, test } from "bun:test";
import { createStore } from "jotai/vanilla";
import { workspaceCommandAtom, workspaceStateAtom } from "./workspace-atoms";
import type { WorkspaceCommand, WorkspaceDialog, WorkspaceState } from "./workspace-state";

const invalidCommands: [string, unknown, WorkspaceDialog?][] = [
  ["null", null],
  ["undefined", undefined],
  ["primitive", "toggle-preview-console"],
  ["array", []],
  ["missing type", {}],
  ["unknown type", { type: "unknown-command" }],
  ["missing activation path", { type: "activate-file" }],
  ["non-string selection", { type: "select-file", path: 42 }],
  ["non-string closed path", { type: "close-tab", path: null }],
  ["missing selected path", { type: "set-navigation", openTabPaths: [] }],
  ["missing tabs", { type: "set-navigation", selectedPath: "" }],
  ["invalid tab", { type: "set-navigation", selectedPath: "", openTabPaths: [42] }],
  ["sparse tabs", { type: "set-navigation", selectedPath: "", openTabPaths: Array(1) }],
  ["invalid following target", { type: "set-following", userId: false }],
  ["missing following target", { type: "set-following" }],
  ["invalid panel toggle", { type: "set-mobile-panel", panel: "editor" }],
  ["null panel toggle", { type: "set-mobile-panel", panel: null }],
  ["invalid panel value", { type: "set-mobile-panel-value", panel: "settings" }],
  ["missing panel value", { type: "set-mobile-panel-value" }],
  ["string console flag", { type: "set-preview-console-open", open: "false" }],
  ["missing settings flag", { type: "set-settings-open" }, "settings"],
  ["numeric search flag", { type: "set-file-search-open", open: 1 }],
  ["null palette flag", { type: "set-command-palette-open", open: null }, "commandPalette"],
];

for (const [name, command, activeDialog] of invalidCommands) {
  test(`ignores ${name} without publishing or corrupting state`, () => {
    const store = createStore();
    if (activeDialog) {
      store.set(workspaceStateAtom, { ...store.get(workspaceStateAtom), activeDialog });
    }
    const before = store.get(workspaceStateAtom);
    let updates = 0;
    const unsubscribe = store.sub(workspaceStateAtom, () => updates++);
    const warnings = spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      // Simulate a caller bypassing the compile-time command contract.
      store.set(workspaceCommandAtom, command as WorkspaceCommand);
      expect(store.get(workspaceStateAtom)).toBe(before);
      expect(updates).toBe(0);
      expect(warnings).toHaveBeenCalledTimes(import.meta.env.DEV ? 1 : 0);
      if (import.meta.env.DEV) {
        expect(warnings.mock.calls[0]).toHaveLength(1);
        expect(typeof warnings.mock.calls[0][0]).toBe("string");
      }

      store.set(workspaceCommandAtom, { type: "activate-file", path: "src/main.tsx" });
      expect(store.get(workspaceStateAtom)).toMatchObject({
        selectedPath: "src/main.tsx",
        openTabPaths: ["src/App.tsx", "src/main.tsx"],
      });
      expect(updates).toBe(1);
    } finally {
      warnings.mockRestore();
      unsubscribe();
    }
  });
}

const validCommands = {
  "activate-file": {
    command: { type: "activate-file", path: "src/main.tsx" },
    expected: { selectedPath: "src/main.tsx", openTabPaths: ["src/App.tsx", "src/main.tsx"] },
  },
  "select-file": {
    command: { type: "select-file", path: "" },
    expected: { selectedPath: "", openTabPaths: ["src/App.tsx"] },
  },
  "close-tab": {
    command: { type: "close-tab", path: "src/App.tsx" },
    expected: { selectedPath: "", openTabPaths: [] },
  },
  "set-navigation": {
    command: { type: "set-navigation", selectedPath: "", openTabPaths: [] },
    expected: { selectedPath: "", openTabPaths: [] },
  },
  "set-following": {
    command: { type: "set-following", userId: "remote" },
    expected: { followingUserId: "remote" },
  },
  "set-mobile-panel": {
    command: { type: "set-mobile-panel", panel: "files" },
    expected: { mobilePanel: "files" },
  },
  "set-mobile-panel-value": {
    command: { type: "set-mobile-panel-value", panel: "preview" },
    expected: { mobilePanel: "preview" },
  },
  "toggle-preview-console": {
    command: { type: "toggle-preview-console" },
    expected: { previewConsoleOpen: true },
  },
  "set-preview-console-open": {
    command: { type: "set-preview-console-open", open: true },
    expected: { previewConsoleOpen: true },
  },
  "set-settings-open": {
    command: { type: "set-settings-open", open: true },
    expected: { activeDialog: "settings" },
  },
  "set-file-search-open": {
    command: { type: "set-file-search-open", open: true },
    expected: { activeDialog: "fileSearch" },
  },
  "set-command-palette-open": {
    command: { type: "set-command-palette-open", open: true },
    expected: { activeDialog: "commandPalette" },
  },
} satisfies Record<
  WorkspaceCommand["type"],
  { command: WorkspaceCommand; expected: Partial<WorkspaceState> }
>;

test.each(Object.entries(validCommands))("accepts the %s command", (_, { command, expected }) => {
  const store = createStore();
  store.set(workspaceCommandAtom, command);
  expect(store.get(workspaceStateAtom)).toMatchObject(expected);
});

test("accepts explicit false and null values when clearing workspace UI", () => {
  const store = createStore();
  store.set(workspaceCommandAtom, { type: "set-following", userId: "remote" });
  store.set(workspaceCommandAtom, { type: "set-mobile-panel-value", panel: "preview" });
  store.set(workspaceCommandAtom, { type: "set-settings-open", open: true });
  store.set(workspaceCommandAtom, { type: "set-preview-console-open", open: true });
  store.set(workspaceCommandAtom, { type: "set-following", userId: null });
  store.set(workspaceCommandAtom, { type: "set-mobile-panel-value", panel: null });
  store.set(workspaceCommandAtom, { type: "set-settings-open", open: false });
  store.set(workspaceCommandAtom, { type: "set-preview-console-open", open: false });
  expect(store.get(workspaceStateAtom)).toMatchObject({
    followingUserId: null,
    mobilePanel: null,
    activeDialog: null,
    previewConsoleOpen: false,
  });
});
