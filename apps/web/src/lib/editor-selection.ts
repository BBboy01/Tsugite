export type EditorSelection = { anchor: number; head: number };

export function clampEditorSelection(
  selection: EditorSelection,
  documentLength: number,
): EditorSelection {
  return {
    anchor: Math.max(0, Math.min(selection.anchor, documentLength)),
    head: Math.max(0, Math.min(selection.head, documentLength)),
  };
}
