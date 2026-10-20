import { describe, expect, test } from "bun:test";
import { editorStatus } from "./editor-status";

describe("editorStatus", () => {
  test("formats the first line as Top", () => {
    expect(editorStatus("src/App.tsx", 1, 1, 1)).toEqual({
      path: "src/App.tsx",
      position: "1:1",
      progress: "Top",
    });
  });

  test("formats middle lines with line percentage", () => {
    expect(editorStatus("src/App.tsx", 5, 8, 10)).toEqual({
      path: "src/App.tsx",
      position: "5:8",
      progress: "50%",
    });
  });

  test("formats the last line as Bot and keeps a single line at Top", () => {
    expect(editorStatus("README.md", 10, 3, 10).progress).toBe("Bot");
    expect(editorStatus("README.md", 1, 3, 1).progress).toBe("Top");
  });
});
