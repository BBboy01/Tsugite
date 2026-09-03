import { expect, test } from "bun:test";

import { getLatestPreviewError } from "./preview-error-model";

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
