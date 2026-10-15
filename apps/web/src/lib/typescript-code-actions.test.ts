import { expect, test } from "bun:test";
import { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { toCodeMirrorCompletions, toCodeMirrorDiagnostics } from "./typescript-code-actions";

test("converts intelligence completion and diagnostics into editor-owned plain data", () => {
  expect(
    toCodeMirrorCompletions([{ name: "displayName", kind: "const", sortText: "1" }], 4),
  ).toMatchObject({
    from: 4,
    options: [{ label: "displayName", type: "const" }],
  });
  expect(
    toCodeMirrorDiagnostics([
      { from: 2, to: 5, code: 2304, severity: "error", message: "Missing name" },
    ]),
  ).toEqual([{ from: 2, to: 5, severity: "error", message: "TS2304: Missing name" }]);
});

test("applies each completion's complete replacement range, including text after the caret", () => {
  let state = EditorState.create({ doc: "object.alpha", selection: { anchor: 9 } });
  const view = {
    get state() {
      return state;
    },
    dispatch: (spec: Parameters<EditorState["update"]>[0]) => {
      state = state.update(spec).state;
    },
  } as unknown as EditorView;
  const result = toCodeMirrorCompletions(
    [
      { name: "alpha", kind: "property", sortText: "0", replacement: { from: 7, to: 12 } },
      {
        name: "alpha as string key",
        kind: "property",
        sortText: "1",
        insertText: '["alpha"]',
        replacement: { from: 6, to: 12 },
      },
    ],
    7,
    9,
  );
  expect(result.from).toBe(7);
  for (const [index, expected] of ["object.alpha", 'object["alpha"]'].entries()) {
    state = EditorState.create({ doc: "object.alpha", selection: { anchor: 9 } });
    const selected = result.options[index];
    expect(typeof selected.apply).toBe("function");
    if (typeof selected.apply !== "function") continue;
    selected.apply(view, selected, result.from, result.to ?? 9);
    expect(state.doc.toString()).toBe(expected);
    expect(state.selection.main.head).toBe(expected.length);
  }
});
