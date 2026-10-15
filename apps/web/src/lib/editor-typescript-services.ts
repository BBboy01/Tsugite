import { StateEffect } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { EditorIntelligence } from "./editor-intelligence";
import { typeScriptCompletion } from "./typescript-completion";
import { typeScriptDiagnostics } from "./typescript-diagnostics";
import { typeScriptSignatureHelp } from "./typescript-signature";
import { editorWorkspaceRefresh } from "./editor-workspace-refresh";

export function attachEditorTypeScriptServices(
  view: EditorView,
  path: string,
  intelligence: EditorIntelligence,
  onReady: (intelligence: EditorIntelligence) => void,
): () => void {
  let disposed = false;
  const load = async () => {
    try {
      const { typeScriptHover } = await import("./typescript-hover");
      if (disposed) return;
      const activeIntelligence = intelligence;
      void activeIntelligence.updateFile({ path, text: view.state.doc.toString() });
      view.dispatch({
        effects: StateEffect.appendConfig.of([
          EditorView.updateListener.of((update) => {
            if (update.docChanged)
              void activeIntelligence.updateFile({ path, text: update.state.doc.toString() });
          }),
          typeScriptHover(activeIntelligence, path),
          typeScriptCompletion(activeIntelligence, path),
          typeScriptSignatureHelp(activeIntelligence, path),
          editorWorkspaceRefresh(activeIntelligence),
          typeScriptDiagnostics(activeIntelligence, path),
        ]),
      });
      onReady(activeIntelligence);
    } catch (error) {
      if (!disposed) console.warn("TypeScript language services are unavailable.", error);
    }
  };
  void load();
  return () => {
    disposed = true;
  };
}
