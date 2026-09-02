import { expect, test } from "bun:test";

import { SETTINGS_DIALOG_THEME_CLASS_NAME } from "./settings-popover";

test("uses a dedicated theme wrapper for the settings portal", () => {
  expect(SETTINGS_DIALOG_THEME_CLASS_NAME).toBe("settings-dialog-theme");
});

test("uses the shadcn searchable select inside the modal dialog", async () => {
  const source = await Bun.file(new URL("./editor-settings-controls.tsx", import.meta.url)).text();

  expect(source).toContain("<Autocomplete");
  expect(source).toContain("filter={contains}");
  expect(source).toContain("<SelectInput");
  expect(source).toContain("<SelectList");
  expect(source).toContain("UNSTABLE_portalContainer={containerRef.current ?? undefined}");
});

test("mounts the theme tooltip inside the settings dialog", async () => {
  const source = await Bun.file(new URL("./theme-picker.tsx", import.meta.url)).text();

  expect(source).toContain("<Tooltip container={container}");
});

test("lets settings popovers escape the dialog clipping boundary", async () => {
  const source = await Bun.file(new URL("./settings-popover.tsx", import.meta.url)).text();

  expect(source).toContain("overflow-visible rounded-[14px]");
});
