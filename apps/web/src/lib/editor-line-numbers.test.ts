import { describe, expect, it } from "bun:test";

import { formatEditorLineNumber } from "./editor-line-numbers";

describe("formatEditorLineNumber", () => {
  it("keeps absolute numbers when relative numbering is disabled", () => {
    expect(formatEditorLineNumber(8, 4, false)).toBe("8");
  });

  it("shows the absolute number on the current line and distances elsewhere", () => {
    expect(formatEditorLineNumber(4, 4, true)).toBe("4");
    expect(formatEditorLineNumber(2, 4, true)).toBe("2");
    expect(formatEditorLineNumber(7, 4, true)).toBe("3");
  });
});
