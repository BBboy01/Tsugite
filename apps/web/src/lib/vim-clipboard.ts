import { Vim } from "@replit/codemirror-vim";
import type { EditorView } from "@codemirror/view";

export function attachVimClipboard(view: EditorView, enabled: boolean): () => void {
  if (!enabled || typeof navigator === "undefined" || !navigator.clipboard) {
    return () => undefined;
  }

  // Keep native Vim semantics for linewise, visual, and cursor-aware paste.
  Vim.map("y", '"+y', "normal");
  Vim.map("p", '"+p', "normal");
  Vim.map("P", '"+P', "normal");

  return () => {
    Vim.unmap("y", "normal");
    Vim.unmap("p", "normal");
    Vim.unmap("P", "normal");
    void view;
  };
}
