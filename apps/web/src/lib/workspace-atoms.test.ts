import { expect, test } from "bun:test";
import { createStore } from "jotai/vanilla";
import {
  commandPaletteOpenAtom,
  selectedPathAtom,
  settingsOpenAtom,
  workspaceCommandAtom,
  workspaceStateAtom,
} from "./workspace-atoms";

test("scopes workspace commands to one atom store", () => {
  const store = createStore();
  store.set(workspaceStateAtom, {
    selectedPath: "src/App.tsx",
    openTabPaths: ["src/App.tsx"],
    followingUserId: "remote",
    mobilePanel: null,
    previewConsoleOpen: false,
    activeDialog: null,
  });

  store.set(workspaceCommandAtom, { type: "activate-file", path: "src/main.tsx" });

  expect(store.get(workspaceStateAtom)).toMatchObject({
    selectedPath: "src/main.tsx",
    openTabPaths: ["src/App.tsx", "src/main.tsx"],
    followingUserId: null,
  });

  store.set(workspaceCommandAtom, { type: "set-settings-open", open: true });
  expect(store.get(settingsOpenAtom)).toBe(true);
});

test("separate stores do not leak workspace selection", () => {
  const first = createStore();
  const second = createStore();
  first.set(workspaceCommandAtom, { type: "activate-file", path: "src/main.tsx" });

  expect(first.get(workspaceStateAtom).selectedPath).toBe("src/main.tsx");
  expect(second.get(workspaceStateAtom).selectedPath).toBe("src/App.tsx");
});

test("dialog state updates do not notify unrelated workspace selectors", () => {
  const store = createStore();
  let selectedPathUpdates = 0;
  const unsubscribe = store.sub(selectedPathAtom, () => selectedPathUpdates++);

  store.set(workspaceCommandAtom, { type: "set-command-palette-open", open: true });

  expect(store.get(commandPaletteOpenAtom)).toBe(true);
  expect(selectedPathUpdates).toBe(0);
  unsubscribe();
});
