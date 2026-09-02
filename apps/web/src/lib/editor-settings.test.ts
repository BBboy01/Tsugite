import { expect, test } from "bun:test";

import {
  EDITOR_FONT_OPTIONS,
  EDITOR_FONT_SIZE_MAX,
  EDITOR_FONT_SIZE_MIN,
  filterEditorFonts,
} from "./editor-settings";

test("filters editor fonts case-insensitively", () => {
  expect(filterEditorFonts("mono", "JetBrains Mono")).toContain("Geist Mono");
  expect(filterEditorFonts("CASCADIA", "JetBrains Mono")).toEqual(["Cascadia Code"]);
});

test("keeps a shared custom font available and defines the supported size range", () => {
  expect(filterEditorFonts("", "Custom Mono")[0]).toBe("Custom Mono");
  expect(EDITOR_FONT_OPTIONS.length).toBeGreaterThan(12);
  expect([EDITOR_FONT_SIZE_MIN, EDITOR_FONT_SIZE_MAX]).toEqual([10, 24]);
});
