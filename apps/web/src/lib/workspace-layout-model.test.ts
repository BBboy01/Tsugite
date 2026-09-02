import { expect, test } from "bun:test";

import {
  DEFAULT_WORKSPACE_PANEL_WIDTHS,
  constrainWorkspacePanelWidths,
  readWorkspacePanelWidths,
  toggleMobileWorkspacePanel,
} from "./workspace-layout-model";

test("reads persisted panel widths and rejects invalid values", () => {
  expect(readWorkspacePanelWidths(null)).toEqual(DEFAULT_WORKSPACE_PANEL_WIDTHS);
  expect(readWorkspacePanelWidths({ files: "wide", preview: 300 })).toEqual(
    DEFAULT_WORKSPACE_PANEL_WIDTHS,
  );
  expect(readWorkspacePanelWidths({ files: 600, preview: 120 })).toEqual({
    files: 420,
    preview: 220,
  });
});

test("keeps the opposite sidebar stable while resizing the files boundary", () => {
  expect(
    constrainWorkspacePanelWidths(
      { files: 600, preview: 360 },
      1000,
      { files: true, preview: true },
      "files",
    ),
  ).toEqual({ files: 320, preview: 360 });
});

test("keeps the opposite sidebar stable while resizing the preview boundary", () => {
  expect(
    constrainWorkspacePanelWidths(
      { files: 240, preview: 600 },
      1000,
      { files: true, preview: true },
      "preview",
    ),
  ).toEqual({ files: 240, preview: 440 });
});

test("allows the preview panel to grow beyond the default width", () => {
  expect(readWorkspacePanelWidths({ files: 240, preview: 700 })).toEqual({
    files: 240,
    preview: 700,
  });
});

test("adapts a single visible sidebar to the available workspace", () => {
  expect(
    constrainWorkspacePanelWidths({ files: 420, preview: 560 }, 700, {
      files: false,
      preview: true,
    }),
  ).toEqual({ files: 420, preview: 380 });
});

test("toggles the active mobile workspace panel", () => {
  expect(toggleMobileWorkspacePanel(null, "files")).toBe("files");
  expect(toggleMobileWorkspacePanel("files", "files")).toBeNull();
  expect(toggleMobileWorkspacePanel("files", "preview")).toBe("preview");
});
