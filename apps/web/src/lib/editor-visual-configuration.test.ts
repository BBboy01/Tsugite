import { expect, test } from "bun:test";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { ProjectSettings } from "@iris/shared";

import { EditorVisualConfiguration } from "./editor-visual-configuration";

const settings: ProjectSettings = {
  theme: "paper",
  fontFamily: "IBM Plex Mono",
  fontSize: 13,
  wordWrap: false,
  relativeLineNumbers: false,
  normalCursorStyle: "block",
  packageManager: "pnpm",
  autoInstall: false,
  autoStartPreview: false,
};

test("font changes do not invalidate highlighting or wrapping", () => {
  const configuration = new EditorVisualConfiguration("tsx", settings);
  expect(configuration.reconfigure({ ...settings, fontSize: 18 })).toHaveLength(1);
});

test("wrapping changes only its compartment and preserves text and selection", () => {
  const configuration = new EditorVisualConfiguration("tsx", settings);
  const state = EditorState.create({
    doc: "const value = 1;",
    selection: { anchor: 6, head: 11 },
    extensions: Object.values(configuration.extensions),
  });
  const effects = configuration.reconfigure({ ...settings, wordWrap: true });
  expect(effects).toHaveLength(1);
  const next = state.update({ effects }).state;
  expect(next.doc).toBe(state.doc);
  expect(next.selection.eq(state.selection)).toBe(true);
  expect(next.facet(EditorView.contentAttributes)).toContainEqual({ class: "cm-lineWrapping" });
});

test("theme changes update highlighting without rebuilding font and line-number configuration", () => {
  const configuration = new EditorVisualConfiguration("tsx", settings);
  expect(configuration.reconfigure({ ...settings, theme: "dracula" })).toHaveLength(1);
});

test("runtime preferences and unchanged visual settings do not reconfigure the editor", () => {
  const configuration = new EditorVisualConfiguration("tsx", settings);
  expect(configuration.reconfigure({ ...settings })).toEqual([]);
  expect(configuration.reconfigure({ ...settings, autoInstall: true })).toEqual([]);
  const relative = { ...settings, relativeLineNumbers: true };
  expect(configuration.reconfigure(relative)).toHaveLength(1);
  expect(configuration.reconfigure({ ...relative })).toEqual([]);
});
