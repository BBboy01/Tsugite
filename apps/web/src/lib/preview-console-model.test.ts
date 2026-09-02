import { expect, test } from "bun:test";

import {
  clampPreviewConsoleHeight,
  filterPreviewOutputs,
  getPreviewConsoleMaxHeight,
  resizePreviewConsoleHeight,
} from "./preview-console-model";

test("filters console output by level while preserving order", () => {
  const outputs = [
    { level: "log" as const, message: "boot" },
    { level: "warn" as const, message: "slow" },
    { level: "error" as const, message: "failed" },
    { level: "log" as const, message: "retry" },
  ];

  expect(filterPreviewOutputs(outputs, "all")).toEqual(outputs);
  expect(filterPreviewOutputs(outputs, "warn")).toEqual([{ level: "warn", message: "slow" }]);
  expect(filterPreviewOutputs(outputs, "error")).toEqual([{ level: "error", message: "failed" }]);
});

test("clamps the console height between its minimum and half the preview height", () => {
  expect(clampPreviewConsoleHeight(40, 800)).toBe(72);
  expect(clampPreviewConsoleHeight(180, 800)).toBe(180);
  expect(clampPreviewConsoleHeight(600, 800)).toBe(400);
});

test("grows upward and shrinks downward", () => {
  expect(resizePreviewConsoleHeight(144, -32, 800)).toBe(176);
  expect(resizePreviewConsoleHeight(144, 48, 800)).toBe(96);
});

test("keeps the maximum height at least as large as the minimum", () => {
  expect(getPreviewConsoleMaxHeight(100)).toBe(72);
});
