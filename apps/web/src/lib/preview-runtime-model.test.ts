import { expect, test } from "bun:test";

import { getPreviewRunState, getRuntimeSettingsKey } from "./preview-runtime-model";

test("derives stable preview runtime state and settings key", () => {
  expect(getPreviewRunState(undefined, "installing")).toBe("installing");
  expect(getPreviewRunState("start-failed", "idle")).toBe("error");
  expect(
    getRuntimeSettingsKey({ packageManager: "pnpm", autoInstall: true, autoStartPreview: false }),
  ).toBe("pnpm:true:false");
});
