import { expect, test } from "bun:test";

import {
  getLatestPreviewError,
  getPreviewRecoveryActions,
  getPreviewSourceLocation,
} from "./preview-error-model";

test("returns the latest preview error for the visible error state", () => {
  expect(
    getLatestPreviewError([
      { level: "log", message: "hmr update" },
      { level: "error", message: "Unexpected token" },
      { level: "log", message: "waiting for changes" },
      { level: "error", message: "Expected expression" },
    ]),
  ).toBe("Expected expression");
});

test("only enables recovery appropriate to the preview error category", () => {
  expect(getPreviewRecoveryActions("install-failed", false, true)).toEqual([
    "restart",
    "reinstall",
  ]);
  expect(getPreviewRecoveryActions("runtime-unavailable", false, true)).toEqual(["restart"]);
  expect(getPreviewRecoveryActions("install-failed", true, true)).toEqual([]);
  expect(getPreviewRecoveryActions("cross-origin-isolation-required", false, true)).toEqual([]);
  expect(getPreviewRecoveryActions(undefined, false, false)).toEqual([]);
});

test("invalidates syntax navigation when the source snapshot changes", () => {
  const source = "const ready = true;\nconst broken = ;";
  const syntax = { path: "main.ts", source, location: { line: 2, column: 16, offset: 35 } };
  expect(getPreviewSourceLocation(syntax, "main.ts", source)).toEqual({
    path: "main.ts",
    source,
    from: 35,
    to: 35,
    line: 2,
    column: 16,
  });
  expect(getPreviewSourceLocation(syntax, "main.ts", "const ready = true;")).toBeUndefined();
  expect(getPreviewSourceLocation(syntax, "other.ts", source)).toBeUndefined();
});
