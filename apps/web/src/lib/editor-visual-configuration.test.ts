import { expect, test } from "bun:test";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { ProjectSettings } from "@iris/shared";

import { EditorVisualConfiguration } from "./editor-visual-configuration";
import { editorTheme } from "./editor-theme";

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

for (const [theme, dark] of [
  ["paper", false],
  ["github-light", false],
  ["solarized-light", false],
  ["catppuccin-latte", false],
  ["ink", true],
  ["github-dark", true],
  ["solarized-dark", true],
  ["tokyo-night", true],
  ["dracula", true],
  ["catppuccin-mocha", true],
  ["nord", true],
  ["gruvbox-dark-medium", true],
  ["one-dark-pro", true],
  ["rose-pine", true],
  ["everforest-dark", true],
  ["kanagawa-wave", true],
] as const) {
  test(`initializes the ${theme} editor dark facet as ${dark}`, () => {
    const state = EditorState.create({ extensions: [editorTheme({ ...settings, theme })] });
    expect(state.facet(EditorView.darkTheme)).toBe(dark);
  });
}

test("theme changes update the dark facet while preserving text, selection, and wrapping", () => {
  const configuration = new EditorVisualConfiguration("tsx", settings);
  let state = EditorState.create({
    doc: "const value = 1;",
    selection: { anchor: 6, head: 11 },
    extensions: Object.values(configuration.extensions),
  });
  const initial = state;
  for (const [theme, dark] of [
    ["dracula", true],
    ["github-dark", true],
    ["paper", false],
  ] as const) {
    const effects = configuration.reconfigure({ ...settings, theme });
    expect(effects).toHaveLength(2);
    state = state.update({ effects }).state;
    expect(state.facet(EditorView.darkTheme)).toBe(dark);
    expect(state.doc).toBe(initial.doc);
    expect(state.selection.eq(initial.selection)).toBe(true);
    expect(state.facet(EditorView.contentAttributes)).not.toContainEqual({
      class: "cm-lineWrapping",
    });
  }
});

test("runtime preferences and unchanged visual settings do not reconfigure the editor", () => {
  const configuration = new EditorVisualConfiguration("tsx", settings);
  expect(configuration.reconfigure({ ...settings })).toEqual([]);
  expect(configuration.reconfigure({ ...settings, autoInstall: true })).toEqual([]);
  const relative = { ...settings, relativeLineNumbers: true };
  expect(configuration.reconfigure(relative)).toHaveLength(1);
  expect(configuration.reconfigure({ ...relative })).toEqual([]);
});
