import { describe, expect, it } from "bun:test";

import { reconcileWorkspaceNavigation } from "./workspace-navigation";

const file = (id: string, path: string) => ({ id, path });

describe("reconcileWorkspaceNavigation", () => {
  it("preserves an explicitly empty selection while other tabs remain open", () => {
    const result = reconcileWorkspaceNavigation(
      [file("a", "src/App.tsx")],
      ["src/App.tsx"],
      "",
      new Map([["a", "src/App.tsx"]]),
    );

    expect(result.selectedPath).toBe("");
    expect(result.openTabPaths).toEqual(["src/App.tsx"]);
  });

  it("renames open tabs and the selected path by stable file id", () => {
    const result = reconcileWorkspaceNavigation(
      [file("a", "src/renamed.tsx"), file("b", "src/other.tsx")],
      ["src/old.tsx", "src/other.tsx"],
      "src/old.tsx",
      new Map([["a", "src/old.tsx"]]),
    );

    expect(result.openTabPaths).toEqual(["src/renamed.tsx", "src/other.tsx"]);
    expect(result.selectedPath).toBe("src/renamed.tsx");
    expect(result.currentFilePaths).toEqual(
      new Map([
        ["a", "src/renamed.tsx"],
        ["b", "src/other.tsx"],
      ]),
    );
  });

  it("falls back to the first surviving tab when the selected file is deleted", () => {
    const result = reconcileWorkspaceNavigation(
      [file("b", "src/other.tsx")],
      ["src/deleted.tsx", "src/other.tsx"],
      "src/deleted.tsx",
      new Map([
        ["a", "src/deleted.tsx"],
        ["b", "src/other.tsx"],
      ]),
    );

    expect(result.openTabPaths).toEqual(["src/other.tsx"]);
    expect(result.selectedPath).toBe("src/other.tsx");
  });
});
