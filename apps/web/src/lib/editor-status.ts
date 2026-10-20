export type EditorStatus = {
  path: string;
  position: string;
  progress: string;
};

export function editorStatus(
  path: string,
  line: number,
  column: number,
  totalLines: number,
): EditorStatus {
  const progress =
    totalLines <= 1 || line <= 1
      ? "Top"
      : line >= totalLines
        ? "Bot"
        : `${Math.round((line / totalLines) * 100)}%`;
  return {
    path,
    position: `${line}:${column}`,
    progress,
  };
}
import type { EditorView } from "@codemirror/view";

export function editorStatusAt(view: EditorView, path: string): EditorStatus {
  const head = view.state.selection.main.head;
  const line = view.state.doc.lineAt(head);
  return editorStatus(path, line.number, head - line.from + 1, view.state.doc.lines);
}
