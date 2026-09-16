import { EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

export async function runClipboardAction(
  view: EditorView,
  action: "copy" | "cut" | "paste",
  isCurrent: () => boolean,
) {
  const state = view.state;
  const clipboard = navigator.clipboard;
  if (!clipboard) throw new Error("clipboardUnavailable");
  let insert = "";
  if (action === "paste") insert = await clipboard.readText();
  else
    await clipboard.writeText(
      state.selection.ranges.map(({ from, to }) => state.sliceDoc(from, to)).join(state.lineBreak),
    );
  if (action === "copy") return;
  if (!isCurrent() || view.state.doc !== state.doc || !view.state.selection.eq(state.selection)) {
    throw new Error("staleTarget");
  }
  if (view.state.readOnly) return;
  const text = state.toText(insert);
  let line = 1;
  const changes =
    action === "paste" && text.lines === state.selection.ranges.length
      ? state.changeByRange((range) => {
          const lineText = text.line(line++).text;
          return {
            changes: { from: range.from, to: range.to, insert: lineText },
            range: EditorSelection.cursor(range.from + lineText.length),
          };
        })
      : state.replaceSelection(text);
  view.dispatch({
    ...changes,
    userEvent: action === "cut" ? "delete.cut" : "input.paste",
    scrollIntoView: true,
  });
}
