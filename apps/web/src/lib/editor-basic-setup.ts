import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  HighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { lintKeymap } from "@codemirror/lint";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";

import { formatEditorLineNumber } from "./editor-line-numbers";

const themeFallbackHighlightStyle = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.controlKeyword, tags.operatorKeyword, tags.bool, tags.null],
    color: "var(--accent)",
  },
  { tag: [tags.number, tags.atom, tags.typeName, tags.className], color: "var(--accent-deep)" },
  { tag: [tags.string, tags.regexp], color: "var(--success)" },
  { tag: tags.comment, color: "var(--muted)" },
  { tag: tags.definition(tags.variableName), color: "var(--accent-deep)" },
]);

export function editorLineNumbers(relativeLineNumbers: boolean) {
  return lineNumbers({
    formatNumber: (lineNumber, state) =>
      formatEditorLineNumber(
        lineNumber,
        state.doc.lineAt(state.selection.main.head).number,
        relativeLineNumbers,
      ),
  });
}

export function editorBasicSetup() {
  return [
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    foldGutter(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    syntaxHighlighting(themeFallbackHighlightStyle, { fallback: true }),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      ...lintKeymap,
    ]),
  ];
}
